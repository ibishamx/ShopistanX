import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OrderStatus, PublicOrder } from '@/components/order-status';
import { getStore, storeFetch } from '@/lib/store';

export const metadata: Metadata = { title: 'Your order', robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ placed?: string }> }) {
  const [{ token }, { placed }, store] = await Promise.all([params, searchParams, getStore()]);
  if (!store.ok) return null;
  const order = await storeFetch<PublicOrder>(`/orders/${encodeURIComponent(token)}`);
  if (!order.ok) {
    if (order.status === 404) notFound();
    return <p className="text-sm text-muted">Your order could not be loaded. Please refresh the page.</p>;
  }
  return <OrderStatus token={token} initial={order.data} justPlaced={placed === '1'} />;
}
