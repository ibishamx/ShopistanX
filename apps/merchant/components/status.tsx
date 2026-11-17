import { Badge } from '@shopistan/ui';

export interface OrderLike {
  status: string;
  fulfillmentStatus: string;
}

/** One label for the stage an order is at, combining confirmation and fulfilment. */
export function orderStage(o: OrderLike): { label: string; tone: 'gray' | 'green' | 'amber' | 'red' | 'blue' } {
  if (o.status === 'CANCELLED') return { label: 'Cancelled', tone: 'gray' };
  if (o.fulfillmentStatus === 'RETURNED') return { label: 'Returned', tone: 'red' };
  if (o.fulfillmentStatus === 'DELIVERED') return { label: 'Delivered', tone: 'green' };
  if (o.fulfillmentStatus === 'SHIPPED') return { label: 'Shipped', tone: 'blue' };
  if (o.status === 'PENDING') return { label: 'Needs confirmation', tone: 'amber' };
  return { label: 'Confirmed · to ship', tone: 'green' };
}

export function OrderBadge({ order }: { order: OrderLike }) {
  const stage = orderStage(order);
  return <Badge tone={stage.tone}>{stage.label}</Badge>;
}
