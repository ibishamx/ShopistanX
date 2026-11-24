'use client';

import { Badge, inputClass, rs } from '@shopistan/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Empty, LoadError, Loading, PageHeader } from '@/components/page';
import { useApi } from '@/lib/use-api';

export default function ProductsPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const params = new URLSearchParams(Object.entries({ q: debounced, status, type, tag }).filter(([, v]) => v));
  const { data: products, error, loading } = useApi<any[]>(`/admin/products${params.size ? `?${params}` : ''}`);
  const { data: facets } = useApi<{ types: string[]; tags: string[] }>('/admin/products/facets');
  const filtered = !!(debounced || status || type || tag);

  return (
    <>
      <PageHeader title="Products">
        <Link href="/products/import" className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-canvas">Import</Link>
        <Link href="/products/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Add product</Link>
      </PageHeader>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input type="search" aria-label="Search products" placeholder="Search by title, SKU or tag" className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option>
        </select>
        <select aria-label="Product type" className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {facets?.types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select aria-label="Tag" className={inputClass} value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {facets?.tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {loading && !products ? <Loading /> : error ? <LoadError error={error} /> : !products?.length ? (
        filtered ? <Empty title="No products match">Try a different search or filter.</Empty> : (
          <Empty title="No products yet">
            Add a product, or <Link href="/products/import" className="text-brand-700 underline">import your Shopify products</Link>.
          </Empty>
        )
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">{products.length === 500 ? 'Showing the first 500 products' : `${products.length} product${products.length === 1 ? '' : 's'}`}</p>
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 text-right font-medium">Stock</th>
                  <th className="px-4 py-2.5 text-right font-medium">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.map((p) => {
                  const tracked = p.variants.filter((v: any) => v.trackInventory);
                  const stock = tracked.reduce((n: number, v: any) => n + v.stock, 0);
                  const prices = p.variants.map((v: any) => v.pricePaisa);
                  const min = Math.min(...prices);
                  return (
                    <tr key={p.id} className="hover:bg-canvas">
                      <td className="px-4 py-3">
                        <Link href={`/products/${p.id}`} className="flex items-center gap-3 font-medium text-brand-700 hover:underline">
                          {p.images[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.images[0].url} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover" />
                          ) : (
                            <span className="h-10 w-10 shrink-0 rounded-lg border border-line bg-canvas" />
                          )}
                          <span className="min-w-0">
                            <span className="line-clamp-2">{p.title}</span>
                            {p.tags.length > 0 && <span className="block truncate text-xs font-normal text-muted">{p.tags.slice(0, 4).join(', ')}{p.tags.length > 4 ? '…' : ''}</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3"><Badge tone={p.status === 'ACTIVE' ? 'green' : 'gray'}>{p.status === 'ACTIVE' ? 'Active' : 'Draft'}</Badge></td>
                      <td className="px-4 py-3 text-muted">{p.productType || '—'}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${tracked.length && stock === 0 ? 'text-red-700' : ''}`}>
                        {!tracked.length ? <span className="text-muted">Not tracked</span> : stock === 0 ? 'Out of stock' : stock}
                        {p.variants.length > 1 && <span className="block text-xs text-muted">{p.variants.length} variants</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{Math.max(...prices) > min ? `From ${rs(min)}` : rs(min)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
