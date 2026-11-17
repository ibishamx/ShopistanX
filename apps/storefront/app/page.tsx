import { rs } from '@shopistan/ui';
import Link from 'next/link';
import { Product, getStore, storeFetch } from '@/lib/store';

export default async function HomePage() {
  const [store, products] = await Promise.all([getStore(), storeFetch<Product[]>('/products')]);
  if (!store.ok) return null; // The layout renders the unavailable message.
  const list = products.ok ? products.data : [];

  return (
    <>
      <section className="rounded-2xl px-6 py-12 text-center text-white sm:py-16" style={{ background: 'var(--accent)' }}>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{store.data.theme.heroHeading}</h1>
        {store.data.theme.heroSubheading && <p className="mx-auto mt-3 max-w-xl text-white/85">{store.data.theme.heroSubheading}</p>}
      </section>

      <h2 className="mb-4 mt-10 text-lg font-semibold">Products</h2>
      {!products.ok ? (
        <p className="text-sm text-muted">Products could not be loaded. Please refresh the page.</p>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center text-sm text-muted">New products are coming soon.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => {
            const prices = p.variants.map((v) => v.pricePaisa);
            const min = Math.min(...prices);
            const soldOut = p.variants.every((v) => !v.available);
            const compareAt = p.variants.length === 1 ? p.variants[0].compareAtPaisa : null;
            return (
              <li key={p.id}>
                <Link href={`/products/${p.handle}`} className="group block">
                  <div className="relative aspect-square overflow-hidden rounded-xl border border-line bg-white">
                    {p.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.images[0]} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-muted">No photo</div>
                    )}
                    {soldOut && <span className="absolute left-2 top-2 rounded-full bg-ink px-2 py-0.5 text-xs text-white">Sold out</span>}
                  </div>
                  <p className="mt-2 text-sm font-medium group-hover:underline">{p.title}</p>
                  <p className="text-sm">
                    {Math.max(...prices) > min ? `From ${rs(min)}` : rs(min)}
                    {compareAt != null && compareAt > min && <s className="ml-2 text-muted">{rs(compareAt)}</s>}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
