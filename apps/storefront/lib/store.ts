import { headers } from 'next/headers';
import { cache } from 'react';

const API_URL = process.env.API_URL || 'http://localhost:4000';

export interface Store {
  name: string;
  supportPhone: string | null;
  whatsappNumber: string | null;
  shippingFeePaisa: number;
  freeShippingOverPaisa: number | null;
  codForm: { enabled: boolean; headline: string; subheadline: string; buttonText: string; showEmail: boolean; showNotes: boolean };
  theme: { announcement: string; heroHeading: string; heroSubheading: string; accentColor: string };
}

export interface Variant {
  id: string;
  title: string;
  pricePaisa: number;
  compareAtPaisa: number | null;
  available: boolean;
  maxQuantity: number;
}

export interface Product {
  id: string;
  title: string;
  handle: string;
  description: string;
  images: string[];
  variants: Variant[];
}

export type Result<T> = { ok: true; data: T } | { ok: false; status: number };

/**
 * Server-side call to the API for the store this request's host belongs to.
 * The API resolves the tenant from the forwarded host; nothing else selects it.
 */
export async function storeFetch<T>(path: string): Promise<Result<T>> {
  const host = (await headers()).get('host') ?? '';
  try {
    const res = await fetch(`${API_URL}/storefront${path}`, { headers: { 'x-forwarded-host': host }, cache: 'no-store' });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 502 };
  }
}

export const getStore = cache(() => storeFetch<Store>('/store'));
