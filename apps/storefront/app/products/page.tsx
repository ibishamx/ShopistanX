import type { Metadata } from 'next';
import { ProductGrid } from '@/components/product-card';
import { Product, getStore, storeFetch } from '@/lib/store';

export const metadata: Metadata = { title: 'All products' };

export default async function AllProductsPage() {
  const [store, products] = await Promise.all([getStore(), storeFetch<Product[]>('/products')]);
  if (!store.ok) return null;
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="sf-display mb-2 text-center text-[clamp(30px,4vw,44px)]">All Products</h1>
      <p className="mb-10 text-center text-sm text-muted">
        {products.ok ? `${products.data.length} product${products.data.length === 1 ? '' : 's'}` : ''}
      </p>
      {!products.ok ? (
        <p className="text-sm text-muted">Products could not be loaded. Please refresh the page.</p>
      ) : products.data.length === 0 ? (
        <p className="border border-dashed border-line px-6 py-12 text-center text-sm text-muted">New products are coming soon.</p>
      ) : (
        <ProductGrid products={products.data} />
      )}
    </div>
  );
}
