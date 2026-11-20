import { Badge } from '@shopistan/ui';

export interface OrderLike {
  status: string;
  fulfillmentStatus: string;
  onHold?: boolean;
}

/** One label for the stage an order is at, combining confirmation and fulfilment. */
export function orderStage(o: OrderLike): { label: string; tone: 'gray' | 'green' | 'amber' | 'red' | 'blue' } {
  if (o.status === 'CANCELLED') return { label: 'Cancelled', tone: 'gray' };
  if (o.fulfillmentStatus === 'RETURNED') return { label: 'Returned', tone: 'red' };
  if (o.fulfillmentStatus === 'DELIVERED') return { label: 'Delivered', tone: 'green' };
  if (o.fulfillmentStatus === 'SHIPPED') return { label: 'Shipped', tone: 'blue' };
  if (o.status === 'PENDING' && o.onHold) return { label: 'Held for review', tone: 'red' };
  if (o.status === 'PENDING') return { label: 'Needs confirmation', tone: 'amber' };
  return { label: 'Confirmed · to ship', tone: 'green' };
}

export function OrderBadge({ order }: { order: OrderLike }) {
  const stage = orderStage(order);
  return <Badge tone={stage.tone}>{stage.label}</Badge>;
}

const RISK: Record<string, { label: string; tone: 'gray' | 'green' | 'amber' | 'red' | 'blue' }> = {
  new: { label: 'New customer', tone: 'blue' },
  trusted: { label: 'Trusted', tone: 'green' },
  normal: { label: 'Normal', tone: 'gray' },
  risky: { label: 'High return risk', tone: 'red' },
};

export function RiskBadge({ level }: { level: string | null }) {
  const r = RISK[level ?? ''] ?? { label: 'Unknown', tone: 'gray' as const };
  return <Badge tone={r.tone}>{r.label}</Badge>;
}
