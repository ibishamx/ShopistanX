import type { Metadata } from 'next';
import { ProductGrid } from '@/components/product-card';
import { Product, getStore, storeFetch } from '@/lib/store';

export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q = '' }, store] = await Promise.all([searchParams, getStore()]);
  if (!store.ok) return null;
  const term = q.trim();
  const results = term ? await storeFetch<{ products: Product[] }>(`/search?q=${encodeURIComponent(term)}`) : null;
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="sf-display mb-6 text-center text-[clamp(30px,4vw,44px)]">Search</h1>
      <form action="/search" role="search" className="mx-auto mb-10 flex max-w-xl gap-2">
        <label htmlFor="q" className="sr-only">Search products</label>
        <input id="q" name="q" type="search" defaultValue={term} autoFocus={!term} placeholder="Search for khaddar, lawn, maroon…" className="min-w-0 flex-1 border border-line px-4 py-3 text-sm" />
        <button type="submit" className="btn px-6 text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>Search</button>
      </form>
      {results && (!results.ok ? (
        <p className="text-center text-sm text-muted">Search is not working right now. Please try again.</p>
      ) : results.data.products.length === 0 ? (
        <p className="text-center text-sm text-muted">No products found for “{term}”. Try fewer or different words.</p>
      ) : (
        <>
          <p className="mb-5 text-sm text-muted">{results.data.products.length} result{results.data.products.length === 1 ? '' : 's'} for “{term}”</p>
          <ProductGrid products={results.data.products} />
        </>
      ))}
    </div>
  );
}
