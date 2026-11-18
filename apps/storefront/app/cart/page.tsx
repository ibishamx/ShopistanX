import type { Metadata } from 'next';
import { CartCheckout } from '@/components/cart-checkout';
import { getStore } from '@/lib/store';

export const metadata: Metadata = { title: 'Cart' };

export default async function CartPage() {
  const store = await getStore();
  if (!store.ok) return null;
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="sf-display mb-8 text-[clamp(30px,4vw,44px)]">Your cart</h1>
      <CartCheckout store={store.data} />
    </div>
  );
}
