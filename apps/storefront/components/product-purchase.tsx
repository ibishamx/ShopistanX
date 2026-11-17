'use client';

import { CodOrderForm, rs } from '@shopistan/ui';
import Link from 'next/link';
import { useState } from 'react';
import { addToCart } from '@/lib/cart';
import type { Product, Store } from '@/lib/store';
import { placeOrder } from './place-order';
import { Quantity } from './quantity';

export function ProductPurchase({ product, store }: { product: Product; store: Store }) {
  const [variantId, setVariantId] = useState((product.variants.find((v) => v.available) ?? product.variants[0]).id);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const variant = product.variants.find((v) => v.id === variantId)!;
  const qty = Math.min(quantity, Math.max(variant.maxQuantity, 1));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{product.title}</h1>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{rs(variant.pricePaisa)}</span>
          {variant.compareAtPaisa != null && variant.compareAtPaisa > variant.pricePaisa && (
            <>
              <s className="text-muted">{rs(variant.compareAtPaisa)}</s>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                Save {Math.round((1 - variant.pricePaisa / variant.compareAtPaisa) * 100)}%
              </span>
            </>
          )}
        </p>
      </div>

      {product.variants.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Choose an option</legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => (
              <label
                key={v.id}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 ${v.id === variantId ? 'border-ink bg-ink text-white' : 'border-line bg-white'} ${v.available ? '' : 'opacity-50 line-through'}`}
              >
                <input
                  type="radio"
                  name="variant"
                  className="sr-only"
                  checked={v.id === variantId}
                  disabled={!v.available}
                  onChange={() => {
                    setVariantId(v.id);
                    setAdded(false);
                  }}
                />
                {v.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {variant.available ? (
        <div className="flex flex-wrap items-center gap-3">
          <Quantity label="Quantity" value={qty} max={variant.maxQuantity} onChange={setQuantity} />
          <button
            type="button"
            className="cursor-pointer rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-canvas"
            onClick={() => {
              addToCart({
                variantId: variant.id,
                quantity: qty,
                handle: product.handle,
                title: product.title,
                variantTitle: variant.title,
                pricePaisa: variant.pricePaisa,
                image: product.images[0] ?? null,
                maxQuantity: variant.maxQuantity,
              });
              setAdded(true);
            }}
          >
            Add to cart
          </button>
          {variant.maxQuantity <= 3 && <span className="text-sm text-red-700">Only {variant.maxQuantity} left</span>}
          {added && (
            <span role="status" className="text-sm">
              Added. <Link href="/cart" className="font-medium underline">View cart</Link>
            </span>
          )}
        </div>
      ) : (
        <p className="font-medium text-red-700">Out of stock</p>
      )}

      {store.codForm.enabled ? (
        <CodOrderForm
          config={store.codForm}
          subtotalPaisa={variant.pricePaisa * qty}
          shippingFeePaisa={store.shippingFeePaisa}
          freeShippingOverPaisa={store.freeShippingOverPaisa}
          disabledReason={variant.available ? null : 'Out of stock'}
          onSubmit={(values) => placeOrder(values, [{ variantId: variant.id, quantity: qty }], 'cod_form')}
        />
      ) : (
        variant.available && <p className="text-sm text-muted">Add to cart, then check out with Cash on Delivery.</p>
      )}

      {product.description && <div className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{product.description}</div>}
    </div>
  );
}
