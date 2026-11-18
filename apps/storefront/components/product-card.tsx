'use client';

import { rs } from '@shopistan/ui';
import Link from 'next/link';
import { addToCart } from '@/lib/cart';
import type { Product } from '@/lib/store';

/** Portrait product card: 9:16 image, sale badge, compare-at price, add to cart. */
export function ProductCard({ product, priority }: { product: Product; priority?: boolean }) {
  const prices = product.variants.map((v) => v.pricePaisa);
  const min = Math.min(...prices);
  const single = product.variants.length === 1 ? product.variants[0] : null;
  const compareAt = single?.compareAtPaisa ?? null;
  const onSale = product.variants.some((v) => v.compareAtPaisa != null && v.compareAtPaisa > v.pricePaisa);
  const soldOut = product.variants.every((v) => !v.available);
  const button = 'btn flex min-h-10 w-full items-center justify-center border border-black bg-white px-3 text-xs font-medium hover:bg-black hover:text-white transition-colors';

  return (
    <article className="min-w-0">
      <Link href={`/products/${product.handle}`} className="group relative block aspect-[9/16] overflow-hidden bg-[#f3f3f3]" aria-label={product.title}>
        {product.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.images[0]}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="grid h-full place-items-center text-xs text-muted">No photo</span>
        )}
        {soldOut ? (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-[#eef1ea] px-2.5 py-1 text-[11px] leading-none">Sold out</span>
        ) : onSale ? (
          <span className="absolute right-2.5 top-2.5 rounded-[2px] bg-[#111] px-2 py-1.5 text-[11px] leading-none text-white">Sale</span>
        ) : null}
      </Link>
      <Link href={`/products/${product.handle}`} className="mt-2.5 block text-sm leading-snug hover:underline">{product.title}</Link>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
        <span>{prices.some((p) => p !== min) ? `From ${rs(min)}` : rs(min)}</span>
        {compareAt != null && compareAt > min && <s className="text-[#555]">{rs(compareAt)}</s>}
      </p>
      <div className="mt-3">
        {soldOut ? (
          <Link href={`/products/${product.handle}`} className={button} aria-label={`View ${product.title}`}>View product</Link>
        ) : single ? (
          <button
            type="button"
            className={button}
            aria-label={`Add ${product.title} to cart`}
            onClick={() =>
              addToCart({
                variantId: single.id,
                quantity: 1,
                handle: product.handle,
                title: product.title,
                variantTitle: single.title,
                pricePaisa: single.pricePaisa,
                image: product.images[0] ?? null,
                maxQuantity: single.maxQuantity,
              })
            }
          >
            Add to cart
          </button>
        ) : (
          <Link href={`/products/${product.handle}`} className={button} aria-label={`Choose options for ${product.title}`}>Choose options</Link>
        )}
      </div>
    </article>
  );
}

export function ProductGrid({ products, columns = 4 }: { products: Product[]; columns?: 3 | 4 }) {
  return (
    <div className={`grid grid-cols-2 gap-x-3 gap-y-8 md:gap-x-[18px] ${columns === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
      {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
    </div>
  );
}
