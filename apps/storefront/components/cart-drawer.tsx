'use client';

import { rs } from '@shopistan/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { setCartDrawer, setQuantity, useCart, useCartDrawer } from '@/lib/cart';
import { CloseIcon } from './icons';
import { Quantity } from './quantity';

export function CartDrawer() {
  const open = useCartDrawer();
  const lines = useCart();
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const subtotal = lines.reduce((sum, l) => sum + l.pricePaisa * l.quantity, 0);

  useEffect(() => setCartDrawer(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCartDrawer(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={() => setCartDrawer(false)} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Cart"
        tabIndex={-1}
        className="sf-drawer absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">Cart{lines.length > 0 && ` (${lines.reduce((n, l) => n + l.quantity, 0)})`}</h2>
          <button type="button" aria-label="Close cart" className="-mr-2 grid h-10 w-10 place-items-center" onClick={() => setCartDrawer(false)}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {lines.length === 0 ? (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div>
              <p className="text-base">Your cart is empty</p>
              <Link href="/products" className="btn mt-4 inline-block border border-black px-6 py-2.5 text-sm">Continue shopping</Link>
            </div>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
              {lines.map((l) => (
                <li key={l.variantId} className="flex gap-4 py-4">
                  {l.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.image} alt="" className="aspect-[3/4] w-20 shrink-0 bg-sand-100 object-cover" />
                  ) : (
                    <span className="aspect-[3/4] w-20 shrink-0 bg-sand-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${l.handle}`} className="text-sm hover:underline">{l.title}</Link>
                    {l.variantTitle !== 'Default' && <p className="text-xs text-muted">{l.variantTitle}</p>}
                    <p className="mt-1 text-sm tabular-nums">{rs(l.pricePaisa)}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <Quantity label={`Quantity of ${l.title}`} value={l.quantity} max={l.maxQuantity} onChange={(q) => setQuantity(l.variantId, q)} />
                      <button type="button" className="text-xs text-muted underline hover:text-ink" onClick={() => setQuantity(l.variantId, 0)}>Remove</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-4">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span className="font-semibold tabular-nums">{rs(subtotal)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">Delivery charge shown at checkout. Pay cash on delivery.</p>
              <Link
                href="/cart"
                className="btn mt-4 flex w-full items-center justify-center py-3.5 text-sm font-medium text-white"
                style={{ background: 'var(--accent)' }}
              >
                Checkout · Cash on Delivery
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
