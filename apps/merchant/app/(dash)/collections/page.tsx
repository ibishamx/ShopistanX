'use client';

import { Badge } from '@shopistan/ui';
import Link from 'next/link';
import { Empty, LoadError, Loading, PageHeader } from '@/components/page';
import { useApi } from '@/lib/use-api';

export default function CollectionsPage() {
  const { data: collections, error, loading } = useApi<any[]>('/admin/collections');
  return (
    <>
      <PageHeader title="Collections">
        <Link href="/collections/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Create collection</Link>
      </PageHeader>
      {loading ? <Loading /> : error ? <LoadError error={error} /> : !collections?.length ? (
        <Empty title="No collections yet">Group products into collections such as “Winter Collection”, “Under Rs 3,500” or “Sale”. Collections can fill themselves from tags or prices.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Collection</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">On the store</th>
                <th className="px-4 py-2.5 text-right font-medium">Products</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {collections.map((c) => (
                <tr key={c.id} className="hover:bg-canvas">
                  <td className="px-4 py-3"><Link href={`/collections/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.title}</Link></td>
                  <td className="px-4 py-3 text-muted">{c.kind === 'SMART' ? 'Automatic' : 'Manual'}</td>
                  <td className="px-4 py-3">
                    {!c.published ? <Badge>Hidden</Badge> : c.showInMenu ? <Badge tone="green">In menu</Badge> : <Badge tone="blue">Visible</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.productCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
