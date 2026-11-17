import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductPurchase } from '@/components/product-purchase';
import { Product, getStore, storeFetch } from '@/lib/store';

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const product = await storeFetch<Product>(`/products/${encodeURIComponent(handle)}`);
  return product.ok ? { title: product.data.title, description: product.data.description.slice(0, 160) } : {};
}

export default async function ProductPage({ params }: Props) {
  const { handle } = await params;
  const [store, product] = await Promise.all([getStore(), storeFetch<Product>(`/products/${encodeURIComponent(handle)}`)]);
  if (!store.ok) return null;
  if (!product.ok) {
    if (product.status === 404) notFound();
    return <p className="text-sm text-muted">This product could not be loaded. Please refresh the page.</p>;
  }
  const p = product.data;

  return (
    <>
      <Link href="/" className="mb-4 inline-block text-sm text-muted hover:text-ink">← All products</Link>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-3 self-start">
          <div className="aspect-square overflow-hidden rounded-2xl border border-line bg-white">
            {p.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.images[0]} alt={p.title} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted">No photo</div>
            )}
          </div>
          {p.images.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {p.images.slice(1, 5).map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" loading="lazy" className="aspect-square rounded-xl border border-line object-cover" />
              ))}
            </div>
          )}
        </div>
        <ProductPurchase product={p} store={store.data} />
      </div>
    </>
  );
}
