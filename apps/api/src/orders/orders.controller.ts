import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { Auth, MerchantAuth, MerchantGuard } from '../auth/auth.guard';
import { normalizePkMobile } from '../common/phone';
import { normalizeTags, parse } from '../common/util';
import { Db } from '../db/db.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { OrdersService, manualOrderSchema } from './orders.service';

const tagList = z.array(z.string().trim().max(40)).max(30);

const shipSchema = z.object({
  courierName: z.string().trim().min(2, 'Enter the courier name').max(60),
  trackingNumber: z.string().trim().min(3, 'Enter the tracking number').max(80),
});

const FILTERS: Record<string, object> = {
  held: { status: 'PENDING', onHold: true },
  pending: { status: 'PENDING' },
  confirmed: { status: 'CONFIRMED', fulfillmentStatus: 'UNFULFILLED' },
  shipped: { fulfillmentStatus: 'SHIPPED' },
  delivered: { fulfillmentStatus: 'DELIVERED' },
  returned: { fulfillmentStatus: 'RETURNED' },
  cancelled: { status: 'CANCELLED' },
};

@Controller('admin/orders')
@UseGuards(MerchantGuard)
export class OrdersController {
  constructor(
    private readonly db: Db,
    private readonly orders: OrdersService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /** Search by order number, customer name, phone, tracking number or email; filter by stage and tag. */
  @Get()
  list(@Auth() auth: MerchantAuth, @Query('filter') filter?: string, @Query('q') q?: string, @Query('tag') tag?: string) {
    const term = (q ?? '').trim().slice(0, 100);
    const where: Prisma.OrderWhereInput = { AND: [FILTERS[filter ?? ''] ?? {}, tag ? { tags: { has: tag } } : {}, term ? searchWhere(term) : {}] };
    return this.db.tenant(auth.tenantId, (tx) =>
      tx.order.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include: { items: { select: { quantity: true } } } }),
    );
  }

  /** Every tag used on orders, for filters and suggestions. */
  @Get('tags')
  async tags(@Auth() auth: MerchantAuth) {
    const rows = await this.db.tenant(auth.tenantId, (tx) =>
      tx.$queryRaw<{ tag: string; count: bigint }[]>`SELECT unnest(tags) AS tag, COUNT(*) AS count FROM orders GROUP BY 1 ORDER BY 1`,
    );
    return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
  }

  /** An order the merchant enters for a sale agreed on WhatsApp, Instagram, the phone… */
  @Post()
  async create(@Auth() auth: MerchantAuth, @Body() body: unknown) {
    const input = parse(manualOrderSchema, body);
    const order = await this.orders.createManualOrder(auth.tenantId, { ...input, tags: normalizeTags(input.tags) });
    return { id: order.id, number: order.number };
  }

  /** Adds and removes tags on many orders at once. */
  @Post('bulk-tags')
  @HttpCode(200)
  async bulkTags(@Auth() auth: MerchantAuth, @Body() body: unknown) {
    const input = parse(z.object({ orderIds: z.array(z.string().uuid()).min(1).max(250), add: tagList.default([]), remove: tagList.default([]) }), body);
    const add = normalizeTags(input.add);
    const remove = new Set(input.remove.map((t) => t.trim().toLowerCase()));
    return this.db.tenant(auth.tenantId, async (tx) => {
      const orders = await tx.order.findMany({ where: { id: { in: input.orderIds } }, select: { id: true, tags: true } });
      for (const o of orders) {
        const tags = normalizeTags([...o.tags.filter((t) => !remove.has(t.toLowerCase())), ...add]).slice(0, 30);
        await tx.order.update({ where: { id: o.id }, data: { tags } });
      }
      return { updated: orders.length };
    });
  }

  @Get(':id')
  async get(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.tenant(auth.tenantId, async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: {
          items: true,
          events: { orderBy: { createdAt: 'asc' } },
          notifications: { orderBy: { createdAt: 'asc' } },
        },
      });
      if (!order) throw new NotFoundException('Order not found');
      const previous = await tx.order.groupBy({
        by: ['status', 'fulfillmentStatus'],
        where: { customerId: order.customerId, id: { not: id } },
        _count: true,
      });
      const history = { total: 0, delivered: 0, returned: 0, cancelled: 0 };
      for (const row of previous) {
        history.total += row._count;
        if (row.fulfillmentStatus === 'DELIVERED') history.delivered += row._count;
        if (row.fulfillmentStatus === 'RETURNED') history.returned += row._count;
        if (row.status === OrderStatus.CANCELLED) history.cancelled += row._count;
      }
      return { ...order, customerHistory: history, whatsapp: await this.whatsapp.orderLinks(tx, order) };
    });
  }

  @Put(':id/tags')
  tagsUpdate(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { tags } = parse(z.object({ tags: tagList }), body);
    return this.db.tenant(auth.tenantId, async (tx) => {
      await this.orders.findOrThrow(tx, { id });
      return tx.order.update({ where: { id }, data: { tags: normalizeTags(tags) }, select: { id: true, tags: true } });
    });
  }

  @Put(':id/note')
  noteUpdate(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { note } = parse(z.object({ note: z.string().max(2000) }), body);
    return this.db.tenant(auth.tenantId, async (tx) => {
      await this.orders.findOrThrow(tx, { id });
      return tx.order.update({ where: { id }, data: { merchantNote: note.trim() || null }, select: { id: true, merchantNote: true } });
    });
  }

  @Post(':id/confirm')
  @HttpCode(200)
  confirm(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.tenant(auth.tenantId, async (tx) =>
      this.orders.confirm(tx, await this.orders.findOrThrow(tx, { id }), 'merchant', 'merchant'),
    );
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.tenant(auth.tenantId, async (tx) =>
      this.orders.cancel(tx, await this.orders.findOrThrow(tx, { id }), 'merchant', 'by merchant'),
    );
  }

  @Post(':id/ship')
  @HttpCode(200)
  ship(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(shipSchema, body);
    return this.db.tenant(auth.tenantId, async (tx) =>
      this.orders.ship(tx, await this.orders.findOrThrow(tx, { id }), input.courierName, input.trackingNumber),
    );
  }

  @Post(':id/deliver')
  @HttpCode(200)
  deliver(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.tenant(auth.tenantId, async (tx) => this.orders.deliver(tx, await this.orders.findOrThrow(tx, { id })));
  }

  @Post(':id/return')
  @HttpCode(200)
  markReturned(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.tenant(auth.tenantId, async (tx) => this.orders.markReturned(tx, await this.orders.findOrThrow(tx, { id })));
  }

  /** Sends (or re-sends) the WhatsApp confirmation template through the merchant's Cloud API account. */
  @Post(':id/whatsapp-confirmation')
  @HttpCode(200)
  async sendWhatsapp(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string) {
    const notificationId = await this.db.tenant(auth.tenantId, async (tx) =>
      this.whatsapp.queueOrderConfirmation(tx, await this.orders.findOrThrow(tx, { id }), { manual: true }),
    );
    return this.whatsapp.process(auth.tenantId, notificationId!);
  }
}

function searchWhere(term: string): Prisma.OrderWhereInput {
  const or: Prisma.OrderWhereInput[] = [
    { customerName: { contains: term, mode: 'insensitive' } },
    { trackingNumber: { contains: term, mode: 'insensitive' } },
    { email: { contains: term, mode: 'insensitive' } },
    { city: { equals: term, mode: 'insensitive' } },
  ];
  const number = /^#?(\d{1,9})$/.exec(term);
  if (number) or.push({ number: Number(number[1]) });
  const digits = term.replace(/[^\d]/g, '');
  if (digits.length >= 4 && /^[\d\s+()-]+$/.test(term)) {
    // Phones are stored as 92XXXXXXXXXX; "0300 123" and "300123" should both match.
    const full = normalizePkMobile(term);
    or.push({ phone: { contains: full ?? digits.replace(/^0/, '') } });
  }
  return { OR: or };
}
