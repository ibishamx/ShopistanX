import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ProductGrid } from '@/components/product-card';
import { SortSelect } from '@/components/sort-select';
import { CollectionPage, getStore, storeFetch } from '@/lib/store';

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ sort?: string }> };

const load = (handle: string, sort?: string) =>
  storeFetch<CollectionPage>(`/collections/${encodeURIComponent(handle)}${sort ? `?sort=${encodeURIComponent(sort)}` : ''}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const c = await load(handle);
  if (!c.ok) return {};
  return {
    title: c.data.seoTitle || c.data.title,
    description: c.data.seoDescription || c.data.description.slice(0, 160) || undefined,
  };
}

export default async function CollectionRoute({ params, searchParams }: Props) {
  const [{ handle }, { sort }, store] = await Promise.all([params, searchParams, getStore()]);
  if (!store.ok) return null;
  const c = await load(handle, sort);
  if (!c.ok) {
    if (c.status === 404) notFound();
    return <p className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted">This collection could not be loaded. Please refresh the page.</p>;
  }
  const col = c.data;
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="sf-display text-center text-[clamp(30px,4vw,44px)]">{col.title}</h1>
      {col.description && <p className="mx-auto mt-3 max-w-2xl whitespace-pre-line text-center text-sm leading-relaxed text-muted">{col.description}</p>}
      <div className="mb-6 mt-8 flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
        <p className="text-sm text-muted">{col.products.length} product{col.products.length === 1 ? '' : 's'}</p>
        <Suspense><SortSelect /></Suspense>
      </div>
      {col.products.length ? <ProductGrid products={col.products} /> : <p className="py-12 text-center text-sm text-muted">No products in this collection yet.</p>}
    </div>
  );
}
