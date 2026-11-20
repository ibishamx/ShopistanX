import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { SettlementMatch } from '@prisma/client';
import { z } from 'zod';
import { Auth, MerchantAuth, MerchantGuard } from '../auth/auth.guard';
import { parse } from '../common/util';
import { Db } from '../db/db.service';

/** Delivered orders not paid by the courier after this many days are flagged as late. */
export const LATE_AFTER_DAYS = 7;

const importSchema = z.object({
  courierName: z.string().trim().min(2, 'Enter the courier name').max(60),
  reference: z.string().trim().min(1, 'Enter the payment reference or date').max(120),
  fileName: z.string().trim().max(200).optional(),
  lines: z
    .array(z.object({ trackingNumber: z.string().trim().min(1).max(80), amountPaisa: z.number().int().min(0).max(1_000_000_000) }))
    .min(1, 'The file has no payment lines')
    .max(5000, 'Import at most 5,000 lines at a time'),
});

const norm = (tracking: string) => tracking.replace(/\s+/g, '').toUpperCase();

@Controller('admin/reconciliation')
@UseGuards(MerchantGuard)
export class ReconciliationController {
  constructor(private readonly db: Db) {}

  /** Imports one courier payment report and matches every line to an order by tracking number. */
  @Post('settlements')
  import(@Auth() auth: MerchantAuth, @Body() body: unknown) {
    const input = parse(importSchema, body);
    const tenantId = auth.tenantId;
    return this.db.tenant(tenantId, async (tx) => {
      const shipped = await tx.order.findMany({
        where: { trackingNumber: { not: null } },
        select: { id: true, trackingNumber: true, totalPaisa: true, fulfillmentStatus: true },
      });
      const byTracking = new Map(shipped.map((o) => [norm(o.trackingNumber!), o]));
      const alreadyPaid = new Set(
        (
          await tx.codSettlementLine.findMany({
            where: { orderId: { not: null }, match: { in: ['MATCHED', 'AMOUNT_MISMATCH', 'NOT_DELIVERED'] } },
            select: { orderId: true },
          })
        ).map((l) => l.orderId!),
      );

      const seen = new Set<string>();
      const lines = input.lines.map((line) => {
        const order = byTracking.get(norm(line.trackingNumber));
        let match: SettlementMatch;
        if (!order) match = 'UNKNOWN_TRACKING';
        else if (alreadyPaid.has(order.id) || seen.has(order.id)) match = 'DUPLICATE';
        else if (order.fulfillmentStatus !== 'DELIVERED') match = 'NOT_DELIVERED';
        else if (line.amountPaisa !== order.totalPaisa) match = 'AMOUNT_MISMATCH';
        else match = 'MATCHED';
        if (order) seen.add(order.id);
        return { tenantId, trackingNumber: line.trackingNumber, amountPaisa: line.amountPaisa, orderId: order?.id ?? null, match };
      });

      const settlement = await tx.codSettlement.create({
        data: {
          tenantId,
          courierName: input.courierName,
          reference: input.reference,
          fileName: input.fileName || null,
          totalPaisa: input.lines.reduce((sum, l) => sum + l.amountPaisa, 0),
        },
      });
      await tx.codSettlementLine.createMany({ data: lines.map((l) => ({ ...l, settlementId: settlement.id })) });
      return { id: settlement.id, counts: countMatches(lines) };
    });
  }

  @Get('settlements')
  list(@Auth() auth: MerchantAuth) {
    return this.db.tenant(auth.tenantId, async (tx) => {
      const settlements = await tx.codSettlement.findMany({ orderBy: { createdAt: 'desc' }, include: { lines: { select: { match: true } } } });
      return settlements.map(({ lines, ...s }) => ({ ...s, lineCount: lines.length, counts: countMatches(lines) }));
    });
  }

  @Get('settlements/:id')
  async get(@Auth() auth: MerchantAuth, @Param('id', ParseUUIDPipe) id: string) {
    const settlement = await this.db.tenant(auth.tenantId, (tx) =>
      tx.codSettlement.findUnique({
        where: { id },
        include: {
          lines: {
            orderBy: [{ match: 'asc' }, { trackingNumber: 'asc' }],
            include: { order: { select: { id: true, number: true, totalPaisa: true, fulfillmentStatus: true, customerName: true } } },
          },
        },
      }),
    );
    if (!settlement) throw new NotFoundException('Payment report not found');
    return settlement;
  }

  /** Delivered COD orders that no imported courier report has paid for yet. */
  @Get('unpaid')
  unpaid(@Auth() auth: MerchantAuth) {
    return this.db.tenant(auth.tenantId, async (tx) => {
      const orders = await tx.order.findMany({
        where: {
          fulfillmentStatus: 'DELIVERED',
          paymentMethod: 'COD',
          settlementLines: { none: { match: { in: ['MATCHED', 'AMOUNT_MISMATCH'] } } },
        },
        select: {
          id: true,
          number: true,
          customerName: true,
          courierName: true,
          trackingNumber: true,
          totalPaisa: true,
          events: { where: { type: 'delivered' }, select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'asc' },
      });
      const [paid] = await tx.$queryRaw<{ remitted: bigint | null; shortfall: bigint | null }[]>`
        SELECT SUM(l."amountPaisa") AS remitted,
               SUM(o."totalPaisa" - l."amountPaisa") FILTER (WHERE l.match = 'AMOUNT_MISMATCH') AS shortfall
        FROM cod_settlement_lines l JOIN orders o ON o.tenant_id = l.tenant_id AND o.id = l."orderId"
        WHERE l.match IN ('MATCHED', 'AMOUNT_MISMATCH')`;
      const now = Date.now();
      const rows = orders.map(({ events, ...o }) => {
        const deliveredAt = events[0]?.createdAt ?? null;
        const days = deliveredAt ? Math.floor((now - deliveredAt.getTime()) / 86_400_000) : null;
        return { ...o, deliveredAt, daysSinceDelivery: days, late: days != null && days > LATE_AFTER_DAYS };
      });
      return {
        lateAfterDays: LATE_AFTER_DAYS,
        outstandingPaisa: rows.reduce((sum, o) => sum + o.totalPaisa, 0),
        remittedPaisa: Number(paid?.remitted ?? 0),
        shortfallPaisa: Number(paid?.shortfall ?? 0),
        orders: rows,
      };
    });
  }
}

function countMatches(lines: { match: SettlementMatch }[]) {
  const counts: Record<SettlementMatch, number> = { MATCHED: 0, AMOUNT_MISMATCH: 0, NOT_DELIVERED: 0, UNKNOWN_TRACKING: 0, DUPLICATE: 0 };
  for (const l of lines) counts[l.match]++;
  return counts;
}
