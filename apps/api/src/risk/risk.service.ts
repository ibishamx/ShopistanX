import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db/db.service';

export type RiskLevel = 'new' | 'trusted' | 'normal' | 'risky';

export interface OutcomeCounts {
  delivered: number;
  returned: number;
}

export interface CustomerRisk {
  level: RiskLevel;
  /** Delivered and returned COD parcels in this store. */
  thisStore: OutcomeCounts;
  /**
   * The same phone number's parcels in all other stores on the platform, as
   * totals only. Other stores are never named, and no order details leave
   * the store that owns them.
   */
  otherStores: OutcomeCounts & { stores: number };
  summary: string;
}

// Thresholds. Kept simple and explainable: a merchant should be able to see
// why an order was held.
const TRUSTED_MIN_DELIVERED = 2;
const TRUSTED_MAX_RETURN_RATE = 0.1;
const RISKY_MIN_RETURNED = 2;

export function classify(total: OutcomeCounts): RiskLevel {
  const outcomes = total.delivered + total.returned;
  if (outcomes === 0) return 'new';
  if (total.returned >= RISKY_MIN_RETURNED && total.returned >= total.delivered) return 'risky';
  if (total.delivered >= TRUSTED_MIN_DELIVERED && total.returned / outcomes <= TRUSTED_MAX_RETURN_RATE) return 'trusted';
  return 'normal';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function summarize(level: RiskLevel, total: OutcomeCounts, stores: number): string {
  if (level === 'new') return 'No delivery history on Shopistan yet';
  const outcomes = total.delivered + total.returned;
  const where = stores > 1 ? ` across ${stores} stores` : '';
  return `Accepted ${total.delivered} of ${plural(outcomes, 'COD parcel')}${where}, refused ${total.returned}`;
}

export const orderRulesSchema = z.object({
  /** Customers who refused most of their parcels: hold for a call instead of auto-confirming. */
  holdRisky: z.boolean(),
  /** First-time customers with a large order: hold for a call. Null turns the rule off. */
  holdNewOverPaisa: z.number().int().min(0).max(1_000_000_000).nullable(),
  /** Customers with a clean delivery record: confirm automatically, no confirmation message needed. */
  autoConfirmTrusted: z.boolean(),
});
export type OrderRules = z.infer<typeof orderRulesSchema>;

export const DEFAULT_ORDER_RULES: OrderRules = { holdRisky: true, holdNewOverPaisa: null, autoConfirmTrusted: false };

export function readOrderRules(value: unknown): OrderRules {
  const parsed = orderRulesSchema.safeParse({ ...DEFAULT_ORDER_RULES, ...(typeof value === 'object' && value ? value : {}) });
  return parsed.success ? parsed.data : DEFAULT_ORDER_RULES;
}

export type RuleDecision = { action: 'hold'; reason: string } | { action: 'auto_confirm'; reason: string } | { action: 'none' };

export function decide(rules: OrderRules, risk: CustomerRisk, totalPaisa: number): RuleDecision {
  if (risk.level === 'risky' && rules.holdRisky) {
    return { action: 'hold', reason: `High return risk: ${risk.summary.charAt(0).toLowerCase()}${risk.summary.slice(1)}` };
  }
  if (risk.level === 'new' && rules.holdNewOverPaisa != null && totalPaisa >= rules.holdNewOverPaisa) {
    return { action: 'hold', reason: `New customer with an order of Rs ${(totalPaisa / 100).toLocaleString('en-PK')}` };
  }
  if (risk.level === 'trusted' && rules.autoConfirmTrusted) {
    return { action: 'auto_confirm', reason: `Trusted customer: ${risk.summary.charAt(0).toLowerCase()}${risk.summary.slice(1)}` };
  }
  return { action: 'none' };
}

@Injectable()
export class RiskService {
  constructor(private readonly db: Db) {}

  /**
   * The platform-wide delivery record of one phone number. This is the only
   * cross-store read in the merchant API: it runs on the Super Admin
   * connection and returns aggregate counts, never rows.
   */
  async forPhone(tenantId: string, phone: string): Promise<CustomerRisk> {
    const rows = await this.db.platform.$queryRaw<{ own: boolean; stores: bigint; delivered: bigint; returned: bigint }[]>`
      SELECT (tenant_id = ${tenantId}::uuid) AS own,
             COUNT(DISTINCT tenant_id) AS stores,
             COUNT(*) FILTER (WHERE "fulfillmentStatus" = 'DELIVERED') AS delivered,
             COUNT(*) FILTER (WHERE "fulfillmentStatus" = 'RETURNED') AS returned
      FROM orders
      WHERE phone = ${phone} AND "paymentMethod" = 'COD' AND "fulfillmentStatus" IN ('DELIVERED', 'RETURNED')
      GROUP BY 1`;
    const pick = (own: boolean) => rows.find((r) => r.own === own);
    const mine = pick(true);
    const others = pick(false);
    const thisStore = { delivered: Number(mine?.delivered ?? 0), returned: Number(mine?.returned ?? 0) };
    const otherStores = {
      stores: Number(others?.stores ?? 0),
      delivered: Number(others?.delivered ?? 0),
      returned: Number(others?.returned ?? 0),
    };
    const total = { delivered: thisStore.delivered + otherStores.delivered, returned: thisStore.returned + otherStores.returned };
    const level = classify(total);
    const stores = otherStores.stores + (thisStore.delivered + thisStore.returned > 0 ? 1 : 0);
    return { level, thisStore, otherStores, summary: summarize(level, total, stores) };
  }
}
