'use client';

import { Badge, Card, dateTime, rs } from '@shopistan/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LoadError, Loading, PageHeader } from '@/components/page';
import { useApi } from '@/lib/use-api';

const MATCH: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'gray'; help: string }> = {
  MATCHED: { label: 'Matched', tone: 'green', help: 'Paid in full' },
  AMOUNT_MISMATCH: { label: 'Wrong amount', tone: 'red', help: 'Paid a different amount from the order total' },
  NOT_DELIVERED: { label: 'Not marked delivered', tone: 'amber', help: 'The courier paid for it; mark the order delivered if it was' },
  UNKNOWN_TRACKING: { label: 'Unknown tracking', tone: 'amber', help: 'No order in your store has this tracking number' },
  DUPLICATE: { label: 'Already paid', tone: 'gray', help: 'This order was already paid in this or an earlier report' },
};

export default function SettlementPage() {
  const { id } = useParams<{ id: string }>();
  const { data: s, error, loading } = useApi(`/admin/reconciliation/settlements/${id}`);
  if (loading) return <Loading />;
  if (error || !s) return <LoadError error={error!} />;
  const counts = s.lines.reduce((acc: Record<string, number>, l: any) => ({ ...acc, [l.match]: (acc[l.match] ?? 0) + 1 }), {});

  return (
    <>
      <PageHeader title={`${s.courierName} · ${s.reference}`} back={{ href: '/cod-payments', label: 'COD payments' }} />
      <p className="-mt-3 mb-5 text-sm text-muted">Imported {dateTime(s.createdAt)}{s.fileName ? ` from ${s.fileName}` : ''} · {s.lines.length} lines · {rs(s.totalPaisa)}</p>
      <div className="mb-5 flex flex-wrap gap-2">
        {Object.entries(MATCH).filter(([k]) => counts[k]).map(([k, m]) => (
          <Badge key={k} tone={m.tone}>{counts[k]} {m.label.toLowerCase()}</Badge>
        ))}
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">Tracking</th>
                <th className="py-2 pr-3 font-medium">Result</th>
                <th className="py-2 pr-3 font-medium">Order</th>
                <th className="py-2 pr-3 text-right font-medium">Order total</th>
                <th className="py-2 text-right font-medium">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.lines.map((l: any) => (
                <tr key={l.id}>
                  <td className="py-2.5 pr-3">{l.trackingNumber}</td>
                  <td className="py-2.5 pr-3"><Badge tone={MATCH[l.match].tone}>{MATCH[l.match].label}</Badge><span className="block text-xs text-muted">{MATCH[l.match].help}</span></td>
                  <td className="py-2.5 pr-3">{l.order ? <Link href={`/orders/${l.order.id}`} className="text-brand-700 hover:underline">#{l.order.number} {l.order.customerName}</Link> : '—'}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{l.order ? rs(l.order.totalPaisa) : '—'}</td>
                  <td className={`py-2.5 text-right tabular-nums ${l.match === 'AMOUNT_MISMATCH' ? 'font-semibold text-red-700' : ''}`}>{rs(l.amountPaisa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
