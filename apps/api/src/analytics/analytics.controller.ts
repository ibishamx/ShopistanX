import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { normalizePkMobile } from '../common/phone';
import { Auth, MerchantAuth, MerchantGuard } from '../auth/auth.guard';
import { Db } from '../db/db.service';

@Controller('admin')
@UseGuards(MerchantGuard)
export class AnalyticsController {
  constructor(private readonly db: Db) {}

  @Get('analytics/summary')
  summary(@Auth() auth: MerchantAuth) {
    return this.db.tenant(auth.tenantId, async (tx) => {
      const [groups, top, products, lowStock] = await Promise.all([
        tx.order.groupBy({ by: ['status', 'fulfillmentStatus', 'onHold'], _count: true, _sum: { totalPaisa: true } }),
        tx.orderItem.groupBy({
          by: ['title'],
          where: { order: { status: { not: 'CANCELLED' } } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        }),
        tx.product.count(),
        tx.productVariant.count({ where: { trackInventory: true, stock: { lte: 3 } } }),
      ]);
      const s = { orders: 0, held: 0, pending: 0, toShip: 0, shipped: 0, delivered: 0, returned: 0, cancelled: 0, bookedPaisa: 0, collectedPaisa: 0 };
      for (const g of groups) {
        const total = g._sum.totalPaisa ?? 0;
        s.orders += g._count;
        if (g.status === 'CANCELLED') { s.cancelled += g._count; continue; }
        if (g.fulfillmentStatus === 'RETURNED') { s.returned += g._count; continue; }
        s.bookedPaisa += total;
        if (g.fulfillmentStatus === 'DELIVERED') { s.delivered += g._count; s.collectedPaisa += total; }
        else if (g.fulfillmentStatus === 'SHIPPED') s.shipped += g._count;
        else if (g.status === 'PENDING') {
          s.pending += g._count;
          if (g.onHold) s.held += g._count;
        }
        else s.toShip += g._count;
      }
      return { ...s, products, lowStock, topProducts: top.map((t) => ({ title: t.title, quantity: t._sum.quantity ?? 0 })) };
    });
  }

  /** A returning customer's details, to fill in a manual order. */
  @Get('customers/lookup')
  lookup(@Auth() auth: MerchantAuth, @Query('phone') phoneInput?: string) {
    const phone = normalizePkMobile(phoneInput ?? '');
    if (!phone) return null;
    return this.db.tenant(auth.tenantId, async (tx) => {
      const customer = await tx.customer.findUnique({ where: { tenantId_phone: { tenantId: auth.tenantId, phone } } });
      if (!customer) return null;
      const last = await tx.order.findFirst({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' }, select: { addressLine: true, landmark: true, city: true } });
      const counts = await tx.order.groupBy({ by: ['fulfillmentStatus'], where: { customerId: customer.id }, _count: true });
      const count = (s: string) => counts.find((c) => c.fulfillmentStatus === s)?._count ?? 0;
      return {
        name: customer.name,
        email: customer.email,
        city: last?.city ?? customer.city,
        addressLine: last?.addressLine ?? '',
        landmark: last?.landmark ?? '',
        orders: counts.reduce((n, c) => n + c._count, 0),
        delivered: count('DELIVERED'),
        returned: count('RETURNED'),
      };
    });
  }

  @Get('customers')
  customers(@Auth() auth: MerchantAuth) {
    return this.db.tenant(auth.tenantId, async (tx) => {
      const customers = await tx.customer.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: { orders: { select: { status: true, fulfillmentStatus: true, totalPaisa: true } } },
      });
      return customers.map(({ orders, ...c }) => ({
        ...c,
        orders: orders.length,
        delivered: orders.filter((o) => o.fulfillmentStatus === 'DELIVERED').length,
        returned: orders.filter((o) => o.fulfillmentStatus === 'RETURNED').length,
        spentPaisa: orders.filter((o) => o.fulfillmentStatus === 'DELIVERED').reduce((sum, o) => sum + o.totalPaisa, 0),
      }));
    });
  }
}
