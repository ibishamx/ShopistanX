'use client';

import { useSyncExternalStore } from 'react';

export interface CartLine {
  variantId: string;
  quantity: number;
  handle: string;
  title: string;
  variantTitle: string;
  pricePaisa: number;
  image: string | null;
  maxQuantity: number;
}

// The cart lives in this browser only, per store host. Prices here are for
// display; the server recomputes everything when the order is placed.
const KEY = 'shopistan-cart';
const EMPTY: CartLine[] = [];
const listeners = new Set<() => void>();
let cached: CartLine[] = EMPTY;
let cachedRaw: string | null = null;
let drawerOpen = false;

function read(): CartLine[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cached;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : EMPTY;
      cached = Array.isArray(parsed) ? parsed : EMPTY;
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

const notify = () => listeners.forEach((l) => l());

function write(lines: CartLine[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // Private mode: keep the cart in memory for this page.
    cached = lines;
    cachedRaw = null;
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function useCartDrawer(): boolean {
  return useSyncExternalStore(subscribe, () => drawerOpen, () => false);
}

export function setCartDrawer(open: boolean) {
  drawerOpen = open;
  notify();
}

/** Adds a line and opens the cart drawer. */
export function addToCart(line: CartLine) {
  const lines = read();
  const existing = lines.find((l) => l.variantId === line.variantId);
  write(
    existing
      ? lines.map((l) => (l === existing ? { ...line, quantity: Math.min(l.quantity + line.quantity, line.maxQuantity) } : l))
      : [...lines, line],
  );
  setCartDrawer(true);
}

export function setQuantity(variantId: string, quantity: number) {
  write(read().flatMap((l) => (l.variantId !== variantId ? [l] : quantity > 0 ? [{ ...l, quantity: Math.min(quantity, l.maxQuantity) }] : [])));
}

export function clearCart() {
  write([]);
}
