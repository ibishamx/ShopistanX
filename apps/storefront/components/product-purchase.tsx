'use client';

import { CodOrderForm, rs } from '@shopistan/ui';
import { useState } from 'react';
import { addToCart } from '@/lib/cart';
import type { Product, Store } from '@/lib/store';
import { TrustGlyph } from './icons';
import { placeOrder } from './place-order';
import { Quantity } from './quantity';

export function ProductPurchase({ product, store }: { product: Product; store: Store }) {
  const [variantId, setVariantId] = useState((product.variants.find((v) => v.available) ?? product.variants[0]).id);
  const [quantity, setQuantity] = useState(1);
  const variant = product.variants.find((v) => v.id === variantId)!;
  const qty = Math.min(quantity, Math.max(variant.maxQuantity, 1));
  const onSale = variant.compareAtPaisa != null && variant.compareAtPaisa > variant.pricePaisa;
  const savePercent = onSale ? Math.round((1 - variant.pricePaisa / variant.compareAtPaisa!) * 100) : 0;
  const { theme } = store;

  return (
    <div className="space-y-6">
      {onSale && (
        <div className="flex items-center justify-between gap-3 rounded-[4px] bg-[#111] px-4 py-2.5 text-white">
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">Sale</span>
          <span className="text-sm font-semibold">Save {savePercent}% · {rs(variant.compareAtPaisa! - variant.pricePaisa)} off</span>
        </div>
      )}

      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px]">{product.title}</h1>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-xl font-medium tabular-nums">{rs(variant.pricePaisa)}</span>
          {onSale && <s className="text-base text-[#555] tabular-nums">{rs(variant.compareAtPaisa!)}</s>}
        </p>
      </div>

      <hr className="border-line" />

      {product.variants.length > 1 && (
        <fieldset>
          <legend className="mb-3 text-sm">
            Option: <span className="font-semibold">{variant.title}</span>
          </legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
            {product.variants.map((v) => (
              <label
                key={v.id}
                className={`btn flex min-h-11 cursor-pointer items-center justify-center border px-3 py-2 text-center text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${v.id === variantId ? 'border-black bg-black text-white' : 'border-line bg-white hover:border-black'} ${v.available ? '' : 'cursor-not-allowed text-muted line-through opacity-60'}`}
              >
                <input type="radio" name="variant" className="sr-only" checked={v.id === variantId} disabled={!v.available} onChange={() => setVariantId(v.id)} />
                {v.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {variant.available ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Quantity label="Quantity" value={qty} max={variant.maxQuantity} onChange={setQuantity} />
            <button
              type="button"
              className="btn flex min-h-11 flex-1 items-center justify-center border border-black bg-white px-4 text-sm font-medium transition-colors hover:bg-black hover:text-white"
              onClick={() =>
                addToCart({
                  variantId: variant.id,
                  quantity: qty,
                  handle: product.handle,
                  title: product.title,
                  variantTitle: variant.title,
                  pricePaisa: variant.pricePaisa,
                  image: product.images[0] ?? null,
                  maxQuantity: variant.maxQuantity,
                })
              }
            >
              Add to cart
            </button>
          </div>
          {variant.maxQuantity <= 3 && <p className="text-sm text-[#b42318]">Only {variant.maxQuantity} left in stock</p>}
        </div>
      ) : (
        <p className="text-sm font-medium text-[#b42318]">Sold out</p>
      )}

      {store.codForm.enabled ? (
        <CodOrderForm
          config={store.codForm}
          subtotalPaisa={variant.pricePaisa * qty}
          shippingFeePaisa={store.shippingFeePaisa}
          freeShippingOverPaisa={store.freeShippingOverPaisa}
          disabledReason={variant.available ? null : 'Sold out'}
          onSubmit={(values) => placeOrder(values, [{ variantId: variant.id, quantity: qty }], 'cod_form')}
        />
      ) : (
        variant.available && <p className="text-sm text-muted">Add to cart, then check out with Cash on Delivery.</p>
      )}

      {theme.trustItems.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 rounded-[4px] bg-sand-100 p-4">
          {theme.trustItems.map((t, i) => (
            <li key={i} className="flex items-center gap-2.5 text-xs leading-snug text-[#29251f]">
              <TrustGlyph icon={t.icon} className="h-6 w-6 shrink-0" />
              <span>{t.title}</span>
            </li>
          ))}
        </ul>
      )}

      {theme.deliveryEstimate && (
        <div className="flex items-center gap-3 border border-sand-400 px-4 py-3 text-sm">
          <TrustGlyph icon="truck" className="h-6 w-6 shrink-0" />
          {theme.deliveryEstimate}
        </div>
      )}

      {product.description && (
        <div className="border-t border-line pt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em]">Description</h2>
          <div className="whitespace-pre-line text-sm leading-7 text-[#333]">{product.description}</div>
        </div>
      )}
    </div>
  );
}
