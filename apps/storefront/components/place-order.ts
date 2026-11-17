import { CodFormValues, api } from '@shopistan/ui';

/** Places the COD order and moves the shopper to their order page. */
export async function placeOrder(values: CodFormValues, items: { variantId: string; quantity: number }[], source: 'cod_form' | 'cart') {
  const { token } = await api<{ token: string }>('/storefront/orders', { body: { ...values, items, source } });
  window.location.assign(`/orders/${token}?placed=1`);
}
