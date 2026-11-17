'use client';

import { Badge, rs } from '@shopistan/ui';
import Link from 'next/link';
import { Empty, LoadError, Loading, PageHeader } from '@/components/page';
import { useApi } from '@/lib/use-api';

export default function ProductsPage() {
  const { data: products, error, loading } = useApi<any[]>('/admin/products');
  const add = <Link href="/products/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Add product</Link>;
  return (
    <>
      <PageHeader title="Products">{add}</PageHeader>
      {loading ? <Loading /> : error ? <LoadError error={error} /> : !products?.length ? (
        <Empty title="No products yet">Add a product to start taking Cash on Delivery orders.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Stock</th>
                <th className="px-4 py-2.5 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((p) => {
                const stock = p.variants.reduce((n: number, v: any) => n + v.stock, 0);
                const prices = p.variants.map((v: any) => v.pricePaisa);
                const min = Math.min(...prices);
                return (
                  <tr key={p.id} className="hover:bg-canvas">
                    <td className="px-4 py-3">
                      <Link href={`/products/${p.id}`} className="flex items-center gap-3 font-medium text-brand-700 hover:underline">
                        {p.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.images[0].url} alt="" className="h-10 w-10 rounded-lg border border-line object-cover" />
                        ) : (
                          <span className="h-10 w-10 rounded-lg border border-line bg-canvas" />
                        )}
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3"><Badge tone={p.status === 'ACTIVE' ? 'green' : 'gray'}>{p.status === 'ACTIVE' ? 'Active' : 'Draft'}</Badge></td>
                    <td className={`px-4 py-3 text-right tabular-nums ${stock === 0 ? 'text-red-700' : ''}`}>
                      {stock === 0 ? 'Out of stock' : stock}
                      {p.variants.length > 1 && <span className="block text-xs text-muted">{p.variants.length} variants</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{Math.max(...prices) > min ? `From ${rs(min)}` : rs(min)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
