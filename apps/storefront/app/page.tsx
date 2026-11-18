import { ProductGrid } from '@/components/product-card';
import { Runway } from '@/components/runway';
import { CollectionMarquee, Faq, Hero, SectionHeading, TrustBar } from '@/components/sections';
import { Product, getStore, storeFetch } from '@/lib/store';

export default async function HomePage() {
  const [store, products] = await Promise.all([getStore(), storeFetch<Product[]>('/products')]);
  if (!store.ok) return null; // The layout renders the unavailable message.
  const { theme } = store.data;
  const list = products.ok ? products.data : [];

  return (
    <>
      <Hero theme={theme} />
      {theme.showRunway && list.length > 0 && <Runway storeName={store.data.name} heading={theme.runwayHeading} products={list} />}

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
