'use client';

import { Button, Notice, api, dateTime, inputClass, pkPhone, rs } from '@shopistan/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
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

const SOURCE: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', phone: 'Phone', walk_in: 'In person', other: 'Other' };

function BulkTags({ ids, tags, onDone }: { ids: string[]; tags: string[]; onDone: (message: string) => void }) {
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  async function apply(kind: 'add' | 'remove') {
    if (!tag.trim()) return;
    setBusy(true);
    try {
      const res = await api('/admin/orders/bulk-tags', { body: { orderIds: ids, [kind]: [tag.trim()] } });
      onDone(`${kind === 'add' ? 'Added' : 'Removed'} “${tag.trim()}” ${kind === 'add' ? 'to' : 'from'} ${res.updated} order${res.updated === 1 ? '' : 's'}.`);
      setTag('');
    } catch (e: any) {
      onDone(e.message);
    }
    setBusy(false);
  }
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2">
      <span className="text-sm font-medium">{ids.length} selected</span>
      <input aria-label="Tag for selected orders" list="order-tags" className={`${inputClass} !w-48 !py-1.5`} placeholder="Tag, e.g. PostEx" value={tag} onChange={(e) => setTag(e.target.value)} />
      <datalist id="order-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
      <Button type="button" busy={busy} disabled={!tag.trim()} onClick={() => apply('add')} className="!py-1.5">Add tag</Button>
      <Button type="button" variant="secondary" disabled={busy || !tag.trim()} onClick={() => apply('remove')} className="!py-1.5">Remove tag</Button>
    </div>
  );
}

function Orders() {
  const params = useSearchParams();
  const filter = params.get('filter') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(q.trim());
  const [tag, setTag] = useState(params.get('tag') ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const query = new URLSearchParams(Object.entries({ filter, q: debounced, tag }).filter(([, v]) => v));
  const { data: orders, error, loading, reload } = useApi<any[]>(`/admin/orders${query.size ? `?${query}` : ''}`);
  const { data: tagList, reload: reloadTags } = useApi<{ tag: string; count: number }[]>('/admin/orders/tags');
  // Keep only selected orders that are still in the list (a search or filter may have hidden some).
  useEffect(() => {
    if (!orders) return;
    const visible = new Set(orders.map((o) => o.id));
    setSelected((s) => (([...s].every((id) => visible.has(id))) ? s : new Set([...s].filter((id) => visible.has(id)))));
  }, [orders]);
  const toggle = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const allSelected = !!orders?.length && orders.every((o) => selected.has(o.id));

  return (
    <>
      <PageHeader title="Orders">
        <Link href="/orders/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Create order</Link>
      </PageHeader>
      <nav aria-label="Filter orders" className="mb-3 flex gap-1 overflow-x-auto">
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
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_220px]">
        <input type="search" aria-label="Search orders" placeholder="Search by order number, name, phone, tracking number or city" className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Tag" className={inputClass} value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {tagList?.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>)}
        </select>
      </div>
      {notice && <div className="mb-3"><Notice tone="green">{notice}</Notice></div>}
      {selected.size > 0 && (
        <BulkTags
          ids={[...selected]}
          tags={tagList?.map((t) => t.tag) ?? []}
          onDone={async (message) => {
            setNotice(message);
            await Promise.all([reload(), reloadTags()]);
          }}
        />
      )}
      {loading && !orders ? <Loading /> : error ? <LoadError error={error} /> : !orders?.length ? (
        <Empty title={filter || debounced || tag ? 'No orders match' : 'No orders yet'}>
          {!(filter || debounced || tag) && (
            <>Orders placed through your COD form show up here. For orders taken on WhatsApp or Instagram, use <Link href="/orders/new" className="text-brand-700 underline">Create order</Link>.</>
          )}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="w-10 py-2.5 pl-4">
                  <input type="checkbox" aria-label="Select all orders" className="accent-brand-600" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.id)))} />
                </th>
                <th className="px-3 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">City</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.id} className={selected.has(o.id) ? 'bg-brand-50' : 'hover:bg-canvas'}>
                  <td className="py-3 pl-4 align-top">
                    <input type="checkbox" aria-label={`Select order #${o.number}`} className="accent-brand-600" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Link href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">#{o.number}</Link>
                    <div className="text-xs text-muted">{dateTime(o.createdAt)}</div>
                    {o.source === 'manual' && <div className="text-xs text-muted">Entered · {SOURCE[o.utmSource] ?? 'Manual'}</div>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {o.customerName}
                    <div className="text-xs text-muted">{pkPhone(o.phone)}</div>
                  </td>
                  <td className="px-4 py-3 align-top">{o.city}</td>
                  <td className="px-4 py-3 align-top">
                    <OrderBadge order={o} />
                    {o.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {o.tags.slice(0, 4).map((t: string) => <span key={t} className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-muted">{t}</span>)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">{rs(o.totalPaisa)}</td>
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
