'use client';

import { CodOrderForm, rs } from '@shopistan/ui';
import Link from 'next/link';
import { clearCart, setQuantity, useCart } from '@/lib/cart';
import type { Store } from '@/lib/store';
import { placeOrder } from './place-order';
import { Quantity } from './quantity';

export function CartCheckout({ store }: { store: Store }) {
  const lines = useCart();
  const subtotalPaisa = lines.reduce((sum, l) => sum + l.pricePaisa * l.quantity, 0);

  if (!lines.length) {
    return (
      <div className="border border-dashed border-line bg-white px-6 py-14 text-center">
        <p className="font-medium">Your cart is empty</p>
        <Link href="/products" className="btn mt-4 inline-block border border-black px-6 py-2.5 text-sm">Continue shopping</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <ul className="divide-y divide-line self-start border-y border-line bg-white">
        {lines.map((l) => (
          <li key={l.variantId} className="flex gap-4 py-4">
            {l.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.image} alt="" className="aspect-[3/4] w-20 shrink-0 bg-sand-100 object-cover" />
            ) : (
              <span className="aspect-[3/4] w-20 shrink-0 bg-sand-100" />
            )}
            <div className="min-w-0 flex-1">
              <Link href={`/products/${l.handle}`} className="font-medium hover:underline">{l.title}</Link>
              {l.variantTitle !== 'Default' && <p className="text-sm text-muted">{l.variantTitle}</p>}
              <p className="text-sm tabular-nums">{rs(l.pricePaisa)}</p>
              <div className="mt-2 flex items-center gap-3">
                <Quantity label={`Quantity of ${l.title}`} value={l.quantity} max={l.maxQuantity} onChange={(q) => setQuantity(l.variantId, q)} />
                <button type="button" className="cursor-pointer text-sm text-muted underline hover:text-ink" onClick={() => setQuantity(l.variantId, 0)}>Remove</button>
              </div>
            </div>
            <p className="font-medium tabular-nums">{rs(l.pricePaisa * l.quantity)}</p>
          </li>
        ))}
      </ul>
      <CodOrderForm
        config={store.codForm}
        subtotalPaisa={subtotalPaisa}
        shippingFeePaisa={store.shippingFeePaisa}
        freeShippingOverPaisa={store.freeShippingOverPaisa}
        onSubmit={async (values) => {
          await placeOrder(values, lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), 'cart');
          clearCart();
        }}
      />
    </div>
  );
}
