import type { Metadata } from 'next';
import { CartCheckout } from '@/components/cart-checkout';
import { getStore } from '@/lib/store';

export const metadata: Metadata = { title: 'Cart' };

export default async function CartPage() {
  const store = await getStore();
  if (!store.ok) return null;
  return (
    <>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Your cart</h1>
      <CartCheckout store={store.data} />
    </>
  );
}
