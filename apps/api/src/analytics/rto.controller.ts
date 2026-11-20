import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Auth, MerchantAuth, MerchantGuard } from '../auth/auth.guard';
import { Db } from '../db/db.service';

/** Each breakdown is a fixed SQL expression over orders (o) and, for products, order_items (i). */
const DIMENSIONS = {
  city: { label: 'City', expr: Prisma.sql`initcap(lower(trim(o.city)))`, items: false },
  courier: { label: 'Courier', expr: Prisma.sql`coalesce(o."courierName", '(none)')`, items: false },
  product: { label: 'Product', expr: Prisma.sql`i.title`, items: true },
  campaign: {
    label: 'Ad campaign',
    expr: Prisma.sql`coalesce(nullif(concat_ws(' / ', o."utmSource", o."utmCampaign"), ''), 'Direct / unknown')`,
    items: false,
  },
  hour: {
    label: 'Hour ordered',
    expr: Prisma.sql`to_char(o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Karachi', 'HH24') || ':00'`,
    items: false,
  },
  risk: { label: 'Customer risk at order', expr: Prisma.sql`coalesce(o."riskLevel", 'unknown')`, items: false },
} as const;

interface Row {
  key: string;
  delivered: bigint;
  returned: bigint;
  returned_value: bigint | null;
}

@Controller('admin/analytics/rto')
@UseGuards(MerchantGuard)
export class RtoController {
  constructor(private readonly db: Db) {}

  /**
   * Return-to-origin breakdown over parcels that reached an outcome
   * (delivered or returned) among orders placed in the last `days` days.
   */
  @Get()
  rto(@Auth() auth: MerchantAuth, @Query('days') daysParam?: string) {
    const days = Math.min(Math.max(Number(daysParam) || 90, 1), 365);
    const since = new Date(Date.now() - days * 86_400_000);
    return this.db.tenant(auth.tenantId, async (tx) => {
      const closed = Prisma.sql`o."fulfillmentStatus" IN ('DELIVERED', 'RETURNED') AND o."createdAt" >= ${since}`;
      const [totals] = await tx.$queryRaw<Row[]>`
        SELECT 'all' AS key,
               COUNT(*) FILTER (WHERE o."fulfillmentStatus" = 'DELIVERED') AS delivered,
               COUNT(*) FILTER (WHERE o."fulfillmentStatus" = 'RETURNED') AS returned,
               SUM(o."totalPaisa") FILTER (WHERE o."fulfillmentStatus" = 'RETURNED') AS returned_value
        FROM orders o WHERE ${closed}`;

      const breakdowns: Record<string, unknown> = {};
      for (const [id, dim] of Object.entries(DIMENSIONS)) {
        const rows = await tx.$queryRaw<Row[]>`
          SELECT ${dim.expr} AS key,
                 COUNT(DISTINCT o.id) FILTER (WHERE o."fulfillmentStatus" = 'DELIVERED') AS delivered,
                 COUNT(DISTINCT o.id) FILTER (WHERE o."fulfillmentStatus" = 'RETURNED') AS returned,
                 SUM(${dim.items ? Prisma.sql`i."unitPricePaisa" * i.quantity` : Prisma.sql`o."totalPaisa"`})
                   FILTER (WHERE o."fulfillmentStatus" = 'RETURNED') AS returned_value
          FROM orders o
          ${dim.items ? Prisma.sql`JOIN order_items i ON i.tenant_id = o.tenant_id AND i."orderId" = o.id` : Prisma.empty}
          WHERE ${closed}
          GROUP BY 1
          ORDER BY 3 DESC, 2 DESC
          LIMIT 25`;
        breakdowns[id] = { label: dim.label, rows: rows.map(toRow) };
      }
      return { days, totals: toRow(totals), breakdowns };
    });
  }
}

function toRow(r: Row) {
  const delivered = Number(r.delivered);
  const returned = Number(r.returned);
  const closed = delivered + returned;
  return {
    key: r.key,
    delivered,
    returned,
    returnRate: closed ? returned / closed : null,
    returnedValuePaisa: Number(r.returned_value ?? 0),
  };
}
