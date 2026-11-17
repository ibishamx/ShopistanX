'use client';

import { Badge, Button, Card, Input, Notice, api, dateTime, pkPhone, rs } from '@shopistan/ui';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { LoadError, Loading, PageHeader } from '@/components/page';
import { OrderBadge } from '@/components/status';
import { useApi } from '@/lib/use-api';

const NOTIFICATION_TONE: Record<string, 'gray' | 'green' | 'red' | 'blue'> = {
  QUEUED: 'gray', SENT: 'blue', DELIVERED: 'green', READ: 'green', FAILED: 'red',
};

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, error, loading, reload } = useApi(`/admin/orders/${id}`);
  const { data: wa } = useApi('/admin/whatsapp');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shipping, setShipping] = useState({ courierName: '', trackingNumber: '' });
  const [copied, setCopied] = useState(false);

  if (loading) return <Loading />;
  if (error || !order) return <LoadError error={error!} />;

  async function act(action: string, body?: unknown) {
    setBusy(action);
    setActionError(null);
    try {
      await api(`/admin/orders/${id}/${action}`, { method: 'POST', body });
    } catch (e: any) {
      setActionError(e.message);
    }
    await reload();
    setBusy(null);
  }

  const pending = order.status === 'PENDING';
  const toShip = order.status === 'CONFIRMED' && order.fulfillmentStatus === 'UNFULFILLED';
  const shipped = order.fulfillmentStatus === 'SHIPPED';
  const cloudApi = wa && wa.status !== 'NOT_CONFIGURED';
  const h = order.customerHistory;

  return (
    <>
      <PageHeader title={`Order #${order.number}`} back={{ href: '/orders', label: 'Orders' }}>
        <OrderBadge order={order} />
        <Badge>{order.paymentStatus === 'PAID' ? 'COD · cash collected' : 'COD · payment pending'}</Badge>
      </PageHeader>
      {actionError && <div className="mb-4"><Notice>{actionError}</Notice></div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {pending && (
            <Card title="Confirm with the customer">
              <p className="text-sm text-muted">Confirm COD orders before dispatch to avoid returned parcels.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={order.whatsapp.customerChatUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-lg bg-[#128c4b] px-4 py-2 text-sm font-medium text-white hover:bg-[#0f7a41]"
                >
                  Message on WhatsApp ↗
                </a>
                {cloudApi && (
                  <Button variant="secondary" busy={busy === 'whatsapp-confirmation'} onClick={() => act('whatsapp-confirmation')}>
                    {order.notifications.length ? 'Resend automatic request' : 'Send automatic request'}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(order.whatsapp.confirmationPageUrl);
                    setCopied(true);
                  }}
                >
                  {copied ? 'Link copied' : 'Copy confirmation link'}
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted">
                "Message on WhatsApp" opens a chat with {pkPhone(order.phone)} with the order details and confirmation link already written.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <Button busy={busy === 'confirm'} onClick={() => act('confirm')}>Mark as confirmed</Button>
                <Button variant="danger" busy={busy === 'cancel'} onClick={() => act('cancel')}>Cancel order</Button>
              </div>
            </Card>
          )}

          {toShip && (
            <Card title="Ship this order">
              <form
                className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  act('ship', shipping);
                }}
              >
                <Input label="Courier" list="couriers" required placeholder="PostEx" value={shipping.courierName} onChange={(e) => setShipping({ ...shipping, courierName: e.target.value })} />
                <datalist id="couriers">
                  {['PostEx', 'Leopards', 'TCS', 'Trax', 'M&P', 'Call Courier'].map((c) => <option key={c} value={c} />)}
                </datalist>
                <Input label="Tracking number" required value={shipping.trackingNumber} onChange={(e) => setShipping({ ...shipping, trackingNumber: e.target.value })} />
                <Button type="submit" busy={busy === 'ship'}>Mark as shipped</Button>
              </form>
              <div className="mt-4 border-t border-line pt-4">
                <Button variant="danger" busy={busy === 'cancel'} onClick={() => act('cancel')}>Cancel order</Button>
              </div>
            </Card>
          )}

          {shipped && (
            <Card title={`With ${order.courierName} · ${order.trackingNumber}`}>
              <div className="flex flex-wrap gap-2">
                <Button busy={busy === 'deliver'} onClick={() => act('deliver')}>Delivered, cash collected</Button>
                <Button variant="danger" busy={busy === 'return'} onClick={() => act('return')}>Returned to origin</Button>
              </div>
            </Card>
          )}

          <Card title="Items">
            <ul className="divide-y divide-line text-sm">
              {order.items.map((i: any) => (
                <li key={i.id} className="flex justify-between gap-4 py-2">
                  <span>
                    {i.title}
                    {i.variantTitle !== 'Default' && <span className="text-muted"> · {i.variantTitle}</span>}
                    <span className="text-muted"> × {i.quantity}</span>
                    {i.sku && <span className="block text-xs text-muted">SKU {i.sku}</span>}
                  </span>
                  <span className="tabular-nums">{rs(i.unitPricePaisa * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{rs(order.subtotalPaisa)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{order.shippingPaisa ? rs(order.shippingPaisa) : 'Free'}</dd></div>
              <div className="flex justify-between font-semibold"><dt>To collect on delivery</dt><dd className="tabular-nums">{rs(order.totalPaisa)}</dd></div>
            </dl>
          </Card>

          <Card title="Timeline">
            <ol className="space-y-3 text-sm">
              {order.events.map((e: any) => (
                <li key={e.id} className="flex gap-3">
                  <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  <span>
                    {e.message}
                    <span className="block text-xs text-muted">{dateTime(e.createdAt)} · {e.actor}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Customer">
            <p className="font-medium">{order.customerName}</p>
            <p className="mt-1 text-sm"><a className="text-brand-700 hover:underline" href={`tel:+${order.phone}`}>{pkPhone(order.phone)}</a></p>
            {order.email && <p className="text-sm text-muted">{order.email}</p>}
            <p className="mt-3 text-sm">{order.addressLine}</p>
            <p className="text-sm">{order.city}</p>
            {order.notes && <p className="mt-3 rounded-lg bg-canvas p-2 text-sm">"{order.notes}"</p>}
          </Card>
          <Card title="Order history">
            {h.total === 0 ? (
              <p className="text-sm text-muted">First order from this number.</p>
            ) : (
              <>
                <p className="text-sm">{h.total} earlier order{h.total === 1 ? '' : 's'}: {h.delivered} delivered, {h.returned} returned, {h.cancelled} cancelled.</p>
                {h.returned > 0 && <div className="mt-3"><Notice tone="amber">This customer has refused a parcel before. Confirm by phone before shipping.</Notice></div>}
              </>
            )}
          </Card>
          {order.notifications.length > 0 && (
            <Card title="WhatsApp messages">
              <ul className="space-y-2 text-sm">
                {order.notifications.map((n: any) => (
                  <li key={n.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span>Confirmation request</span>
                      <Badge tone={NOTIFICATION_TONE[n.status]}>{n.status.toLowerCase()}</Badge>
                    </div>
                    <p className="text-xs text-muted">{dateTime(n.createdAt)}</p>
                    {n.error && <p className="mt-1 text-xs text-red-700">{n.error}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
