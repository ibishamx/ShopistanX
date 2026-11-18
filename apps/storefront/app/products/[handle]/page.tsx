import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductGrid } from '@/components/product-card';
import { ProductGallery } from '@/components/product-gallery';
import { ProductPurchase } from '@/components/product-purchase';
import { Product, getStore, storeFetch } from '@/lib/store';

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const product = await storeFetch<Product>(`/products/${encodeURIComponent(handle)}`);
  if (!product.ok) return {};
  return {
    title: product.data.title,
    description: product.data.description.slice(0, 160),
    openGraph: product.data.images[0] ? { images: [product.data.images[0]] } : undefined,
  };
}

export default async function ProductPage({ params }: Props) {
  const { handle } = await params;
  const [store, product, all] = await Promise.all([
    getStore(),
    storeFetch<Product>(`/products/${encodeURIComponent(handle)}`),
    storeFetch<Product[]>('/products'),
  ]);
  if (!store.ok) return null;
  if (!product.ok) {
    if (product.status === 404) notFound();
    return <p className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted">This product could not be loaded. Please refresh the page.</p>;
  }
  const p = product.data;
  const related = all.ok ? all.data.filter((x) => x.id !== p.id).slice(0, 4) : [];

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-5">
        <nav aria-label="Breadcrumb" className="mb-5 text-xs text-muted">
          <Link href="/" className="hover:text-ink">Home</Link>
          <span aria-hidden> / </span>
          <Link href="/products" className="hover:text-ink">All products</Link>
          <span aria-hidden> / </span>
          <span className="text-ink">{p.title}</span>
        </nav>
        <div className="grid gap-8 md:grid-cols-[1.1fr_1fr] md:gap-12">
          <ProductGallery images={p.images} title={p.title} />
          <ProductPurchase product={p} store={store.data} />
        </div>
      </div>
      {related.length > 0 && (
        <section className="mx-auto max-w-6xl border-t border-line px-4 py-12">
          <h2 className="mb-6 text-[23px] font-semibold tracking-tight">You may also like</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </>
  );
}
