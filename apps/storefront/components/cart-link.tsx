'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart';

export function CartLink() {
  const count = useCart().reduce((n, l) => n + l.quantity, 0);
  return (
    <Link href="/cart" className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-canvas">
      Cart{count > 0 && <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-xs text-white" style={{ background: 'var(--accent)' }}>{count}</span>}
    </Link>
  );
}
