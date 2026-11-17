'use client';

import { pkPhone, rs } from '@shopistan/ui';
import { Empty, LoadError, Loading, PageHeader } from '@/components/page';
import { useApi } from '@/lib/use-api';

export default function CustomersPage() {
  const { data: customers, error, loading } = useApi<any[]>('/admin/customers');
  return (
    <>
      <PageHeader title="Customers" />
      {loading ? <Loading /> : error ? <LoadError error={error} /> : !customers?.length ? (
        <Empty title="No customers yet">Customers are added automatically when they place an order.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">City</th>
                <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                <th className="px-4 py-2.5 text-right font-medium">Delivered</th>
                <th className="px-4 py-2.5 text-right font-medium">Returned</th>
                <th className="px-4 py-2.5 text-right font-medium">Spent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {customers.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">{c.name}<div className="text-xs text-muted">{pkPhone(c.phone)}</div></td>
                  <td className="px-4 py-3">{c.city}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.orders}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.delivered}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${c.returned ? 'text-red-700' : ''}`}>{c.returned}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{rs(c.spentPaisa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
