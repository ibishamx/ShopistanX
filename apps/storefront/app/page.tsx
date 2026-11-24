import { ProductGrid } from '@/components/product-card';
import { Runway } from '@/components/runway';
import { CollectionMarquee, Faq, Hero, SectionHeading, TrustBar } from '@/components/sections';
import Link from 'next/link';
import { CollectionSummary, Product, getStore, storeFetch } from '@/lib/store';

export default async function HomePage() {
  const [store, products, collections] = await Promise.all([getStore(), storeFetch<Product[]>('/products'), storeFetch<CollectionSummary[]>('/collections')]);
  if (!store.ok) return null; // The layout renders the unavailable message.
  const { theme } = store.data;
  const list = products.ok ? products.data : [];

  return (
    <>
      <Hero theme={theme} />
      {theme.showRunway && list.length > 0 && <Runway storeName={store.data.name} heading={theme.runwayHeading} products={list} />}

      {collections.ok && collections.data.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-12">
          <p className="mb-2 text-center text-sm font-semibold">Welcome to {store.data.name}!</p>
          <h2 className="sf-eyebrow mb-6 text-center">Shop our collections</h2>
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {collections.data.slice(0, 6).map((c) => (
              <li key={c.handle}>
                <Link href={`/collections/${c.handle}`} className="group relative block aspect-[4/5] overflow-hidden bg-sand-100">
                  {c.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  )}
                  <span className="absolute left-2 top-2 bg-white px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-black">{c.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-12">
        <SectionHeading title="New Arrivals" href={list.length > 8 ? '/products' : undefined} />
        {!products.ok ? (
          <p className="text-sm text-muted">Products could not be loaded. Please refresh the page.</p>
        ) : list.length === 0 ? (
          <p className="border border-dashed border-line px-6 py-12 text-center text-sm text-muted">New products are coming soon.</p>
        ) : (
          <ProductGrid products={list.slice(0, 8)} />
        )}
      </section>

      <CollectionMarquee large={theme.marqueeLarge} small={theme.marqueeSmall} />
      <TrustBar items={theme.trustItems} />
      <Faq items={theme.faq} whatsappNumber={store.data.whatsappNumber} />
    </>
  );
}
