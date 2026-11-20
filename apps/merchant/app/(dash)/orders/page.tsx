'use client';

import { dateTime, pkPhone, rs } from '@shopistan/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Empty, LoadError, Loading, PageHeader } from '@/components/page';
import { OrderBadge } from '@/components/status';
import { useApi } from '@/lib/use-api';

const TABS = [
  ['', 'All'],
  ['held', 'Held for review'],
  ['pending', 'Needs confirmation'],
  ['confirmed', 'To ship'],
  ['shipped', 'Shipped'],
  ['delivered', 'Delivered'],
  ['returned', 'Returned'],
  ['cancelled', 'Cancelled'],
];

function Orders() {
  const filter = useSearchParams().get('filter') ?? '';
  const { data: orders, error, loading } = useApi<any[]>(`/admin/orders${filter ? `?filter=${filter}` : ''}`);

  return (
    <>
      <PageHeader title="Orders" />
      <nav aria-label="Filter orders" className="mb-4 flex gap-1 overflow-x-auto">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={key ? `/orders?filter=${key}` : '/orders'}
            aria-current={filter === key ? 'page' : undefined}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${filter === key ? 'bg-ink text-white' : 'bg-white text-muted border border-line hover:text-ink'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {loading ? <Loading /> : error ? <LoadError error={error} /> : !orders?.length ? (
        <Empty title={filter ? 'No orders in this view' : 'No orders yet'}>
          {!filter && 'Orders placed through your COD form will show up here.'}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">City</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-canvas">
                  <td className="px-4 py-3">
                    <Link href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">#{o.number}</Link>
                    <div className="text-xs text-muted">{dateTime(o.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3">
                    {o.customerName}
                    <div className="text-xs text-muted">{pkPhone(o.phone)}</div>
                  </td>
                  <td className="px-4 py-3">{o.city}</td>
                  <td className="px-4 py-3"><OrderBadge order={o} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{rs(o.totalPaisa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Orders />
    </Suspense>
  );
}
