'use client';

import { Button, dateTime, pkPhone, rs } from '@shopistan/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LoadError, Loading } from '@/components/page';
import { useApi } from '@/lib/use-api';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'medium' }) + ' PKT';

/** Everything needed to dispute a refused or lost COD parcel with a courier, on one printable page. */
export default function DisputeRecordPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, error, loading } = useApi(`/admin/orders/${id}`);
  const { data: me } = useApi('/auth/me');
  if (loading) return <Loading />;
  if (error || !order) return <LoadError error={error!} />;

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[180px_1fr] gap-3 border-b border-line py-2 text-sm print:break-inside-avoid">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 print:p-0 sm:p-10">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/orders/${id}`} className="text-sm text-muted hover:text-ink">← Order #{order.number}</Link>
        <Button onClick={() => window.print()}>Print or save as PDF</Button>
      </div>
      <header className="mb-6">
        <p className="text-sm text-muted">{me?.store.name}</p>
        <h1 className="text-xl font-semibold">Order record #{order.number}</h1>
        <p className="text-xs text-muted">Generated {when(new Date().toISOString())}</p>
      </header>

      <h2 className="mb-1 mt-6 text-sm font-semibold">Order</h2>
      <dl>
        {row('Placed', when(order.createdAt))}
        {row('Payment', `Cash on Delivery · ${rs(order.totalPaisa)} to collect`)}
        {row('Items', order.items.map((i: any) => `${i.title}${i.variantTitle !== 'Default' ? ` (${i.variantTitle})` : ''} × ${i.quantity}`).join(', '))}
        {row('Courier', order.courierName ? `${order.courierName} · tracking ${order.trackingNumber}` : 'Not shipped')}
        {row('Status', `${order.status.toLowerCase()} · ${order.fulfillmentStatus.toLowerCase()}`)}
      </dl>

      <h2 className="mb-1 mt-6 text-sm font-semibold">Customer as entered at checkout</h2>
      <dl>
        {row('Name', order.customerName)}
        {row('Mobile', pkPhone(order.phone))}
        {row('Address', `${order.addressLine}${order.landmark ? `, near ${order.landmark}` : ''}, ${order.city}`)}
      </dl>

      <h2 className="mb-1 mt-6 text-sm font-semibold">Confirmation</h2>
      <dl>
        {row('Confirmed by', order.confirmedVia ? order.confirmedVia.replace(/_/g, ' ') : 'Not confirmed')}
        {order.customerConfirmedAt && row('Customer confirmed at', when(order.customerConfirmedAt))}
        {order.notifications.map((n: any) =>
          row(`WhatsApp message ${dateTime(n.createdAt)}`, `${n.status.toLowerCase()}${n.providerMessageId ? ` · message ID ${n.providerMessageId}` : ''}${n.error ? ` · ${n.error}` : ''}`),
        )}
      </dl>

      <h2 className="mb-1 mt-6 text-sm font-semibold">Timeline</h2>
      <ol className="text-sm">
        {order.events.map((e: any) => (
          <li key={e.id} className="grid grid-cols-[180px_1fr] gap-3 border-b border-line py-2 print:break-inside-avoid">
            <span className="text-muted">{when(e.createdAt)}</span>
            <span>{e.message} <span className="text-muted">({e.actor})</span></span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-muted">Times are Pakistan Standard Time, recorded by Shopistan when each event happened.</p>
    </div>
  );
}
