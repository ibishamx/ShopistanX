'use client';

import { Card, rs } from '@shopistan/ui';
import Link from 'next/link';
import { LoadError, Loading, PageHeader } from '@/components/page';
import { useApi } from '@/lib/use-api';

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const body = (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-80">{body}</Link> : body;
}

export default function HomePage() {
  const { data: s, error, loading } = useApi('/admin/analytics/summary');
  const { data: me } = useApi('/auth/me');
  if (loading) return <Loading />;
  if (error || !s) return <LoadError error={error!} />;

  const closed = s.delivered + s.returned;
  return (
    <>
      <PageHeader title="Home" />
      {s.products === 0 && (
        <Card className="mb-5">
          <p className="font-medium">Add your first product</p>
          <p className="mt-1 text-sm text-muted">Your store is live{me?.store.url ? ` at ${me.store.url.replace(/^https?:\/\//, '')}` : ''}. Add a product and customers can order it with Cash on Delivery straight away.</p>
          <Link href="/products/new" className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Add product</Link>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Needs confirmation" value={s.pending} href="/orders?filter=pending" />
        <Stat label="Held for review" value={s.held} href="/orders?filter=held" />
        <Stat label="Confirmed, to ship" value={s.toShip} href="/orders?filter=confirmed" />
        <Stat label="With courier" value={s.shipped} href="/orders?filter=shipped" />

        <Stat label="Booked sales" value={rs(s.bookedPaisa)} />
        <Stat label="Cash collected" value={rs(s.collectedPaisa)} />
        <Stat label="Delivery rate" value={closed ? `${Math.round((s.delivered / closed) * 100)}%` : '—'} />
        <Stat label="Returned parcels" value={s.returned} href="/orders?filter=returned" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Top products">
          {s.topProducts.length ? (
            <ul className="divide-y divide-line text-sm">
              {s.topProducts.map((p: any) => (
                <li key={p.title} className="flex justify-between py-2">
                  <span>{p.title}</span>
                  <span className="text-muted">{p.quantity} sold</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Sales will appear here after your first order.</p>
          )}
        </Card>
        <Card title="Inventory">
          <p className="text-sm">{s.products} product{s.products === 1 ? '' : 's'}</p>
          <p className="mt-1 text-sm text-muted">{s.lowStock ? `${s.lowStock} variant${s.lowStock === 1 ? ' has' : 's have'} 3 or fewer in stock.` : 'No variants are running low.'}</p>
          <Link href="/products" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">Manage products</Link>
        </Card>
      </div>
    </>
  );
}
