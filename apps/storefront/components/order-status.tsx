'use client';

import { Notice, Spinner, api, rs } from '@shopistan/ui';
import { useState } from 'react';

export interface PublicOrder {
  number: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  fulfillmentStatus: 'UNFULFILLED' | 'SHIPPED' | 'DELIVERED' | 'RETURNED';
  customerName: string;
  phone: string;
  addressLine: string;
  city: string;
  subtotalPaisa: number;
  shippingPaisa: number;
  totalPaisa: number;
  courierName: string | null;
  trackingNumber: string | null;
  items: { title: string; variantTitle: string; quantity: number; unitPricePaisa: number }[];
  whatsappConfirmUrl: string | null;
}

function headline(o: PublicOrder, justPlaced: boolean): { title: string; text: string } {
  if (o.status === 'CANCELLED') return { title: 'This order was cancelled', text: 'Nothing will be delivered and nothing is owed.' };
  if (o.fulfillmentStatus === 'DELIVERED') return { title: 'Delivered', text: 'Thank you for shopping with us.' };
  if (o.fulfillmentStatus === 'RETURNED') return { title: 'Parcel returned', text: 'The courier could not deliver this parcel and returned it to the store.' };
  if (o.fulfillmentStatus === 'SHIPPED') return { title: 'Your order is on its way', text: `Shipped with ${o.courierName}, tracking number ${o.trackingNumber}.` };
  if (o.status === 'CONFIRMED') return { title: 'Order confirmed', text: 'We are preparing your parcel for dispatch.' };
  return {
    title: justPlaced ? `Thank you, ${o.customerName.split(' ')[0]}! Order received` : 'Please confirm your order',
    text: 'One last step: confirm your order so we can dispatch it.',
  };
}

export function OrderStatus({ token, initial, justPlaced }: { token: string; initial: PublicOrder; justPlaced: boolean }) {
  const [order, setOrder] = useState(initial);
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const h = headline(order, justPlaced);
  const pending = order.status === 'PENDING';
  const cancellable = order.status !== 'CANCELLED' && order.fulfillmentStatus === 'UNFULFILLED';

  async function act(action: 'confirm' | 'cancel') {
    if (action === 'cancel' && !window.confirm(`Cancel order #${order.number}?`)) return;
    setBusy(action);
    setError(null);
    try {
      setOrder(await api(`/storefront/orders/${token}/${action}`, { method: 'POST' }));
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(null);
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="rounded-2xl border border-line bg-white p-6 text-center">
        <p className="text-sm text-muted">Order #{order.number}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{h.title}</h1>
        <p className="mt-2 text-sm text-muted">{h.text}</p>

        {pending && (
          <div className="mt-5 space-y-2">
            {order.whatsappConfirmUrl && (
              <a
                href={order.whatsappConfirmUrl}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center rounded-lg bg-[#128c4b] px-4 py-3 text-base font-medium text-white hover:bg-[#0f7a41]"
              >
                Confirm on WhatsApp
              </a>
            )}
            <button
              type="button"
              disabled={!!busy}
              onClick={() => act('confirm')}
              className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-medium disabled:opacity-50 ${order.whatsappConfirmUrl ? 'border border-line bg-white hover:bg-canvas' : 'text-white'}`}
              style={order.whatsappConfirmUrl ? undefined : { background: 'var(--accent)' }}
            >
              {busy === 'confirm' && <Spinner />}
              {order.whatsappConfirmUrl ? 'Confirm here instead' : 'Confirm my order'}
            </button>
          </div>
        )}
        {error && <div className="mt-4 text-left"><Notice>{error}</Notice></div>}
      </div>

      <div className="rounded-2xl border border-line bg-white p-6">
        <h2 className="text-sm font-semibold">Order summary</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between gap-4 py-2">
              <span>
                {i.title}
                {i.variantTitle !== 'Default' && <span className="text-muted"> · {i.variantTitle}</span>}
                <span className="text-muted"> × {i.quantity}</span>
              </span>
              <span className="tabular-nums">{rs(i.unitPricePaisa * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{rs(order.subtotalPaisa)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{order.shippingPaisa ? rs(order.shippingPaisa) : 'Free'}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Pay on delivery</dt><dd className="tabular-nums">{rs(order.totalPaisa)}</dd></div>
        </dl>
        <h2 className="mt-5 text-sm font-semibold">Delivering to</h2>
        <p className="mt-1 text-sm">{order.customerName} · {order.phone}</p>
        <p className="text-sm text-muted">{order.addressLine}, {order.city}</p>
      </div>

      {cancellable && (
        <p className="text-center text-sm text-muted">
          Changed your mind?{' '}
          <button type="button" disabled={!!busy} onClick={() => act('cancel')} className="cursor-pointer underline hover:text-ink disabled:opacity-50">
            {busy === 'cancel' ? 'Cancelling…' : 'Cancel this order'}
          </button>
        </p>
      )}
    </div>
  );
}
