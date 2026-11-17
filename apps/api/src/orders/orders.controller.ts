import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { Auth, MerchantAuth, MerchantGuard } from '../auth/auth.guard';
import { parse } from '../common/util';
import { Db } from '../db/db.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { OrdersService } from './orders.service';

const shipSchema = z.object({
  courierName: z.string().trim().min(2, 'Enter the courier name').max(60),
  trackingNumber: z.string().trim().min(3, 'Enter the tracking number').max(80),
});

const FILTERS: Record<string, object> = {
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

  @Get()
  list(@Auth() auth: MerchantAuth, @Query('filter') filter?: string) {
    return this.db.tenant(auth.tenantId, (tx) =>
      tx.order.findMany({
        where: FILTERS[filter ?? ''] ?? {},
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { items: { select: { quantity: true } } },
      }),
    );
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
