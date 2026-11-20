'use client';

import { Badge, Button, Card, Field, Input, Notice, api, dateTime, inputClass, rs } from '@shopistan/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LoadError, Loading, PageHeader } from '@/components/page';
import { amountToPaisa, guessColumn, parseCsv } from '@/lib/csv';
import { useApi } from '@/lib/use-api';

interface Parsed {
  fileName: string;
  headers: string[];
  rows: string[][];
}

function ImportReport({ onDone }: { onDone: (id: string) => void }) {
  const [file, setFile] = useState<Parsed | null>(null);
  const [tracking, setTracking] = useState(-1);
  const [amount, setAmount] = useState(-1);
  const [courierName, setCourierName] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5_000_000) return setError('That file is larger than 5 MB. Split it into smaller reports.');
    const rows = parseCsv(await f.text());
    if (rows.length < 2) return setError('That file has no data rows. Export the report from the courier portal as CSV.');
    const [headers, ...data] = rows;
    setFile({ fileName: f.name, headers, rows: data });
    setTracking(guessColumn(headers, [/track/i, /^cn\b|consignment|cn ?no/i, /booking/i]));
    setAmount(guessColumn(headers, [/cod.*(amount|collected)/i, /collected/i, /cod/i, /amount/i]));
    if (!courierName) setCourierName(/postex/i.test(f.name) ? 'PostEx' : /leopard/i.test(f.name) ? 'Leopards' : /tcs/i.test(f.name) ? 'TCS' : /trax/i.test(f.name) ? 'Trax' : '');
    if (!reference) setReference(f.name.replace(/\.[^.]+$/, ''));
  }

  const lines = file && tracking >= 0 && amount >= 0
    ? file.rows.map((r) => ({ trackingNumber: r[tracking] ?? '', amountPaisa: amountToPaisa(r[amount] ?? '') }))
    : [];
  const bad = lines.filter((l) => !l.trackingNumber || l.amountPaisa == null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError('Choose the courier’s payment report first.');
    if (tracking < 0 || amount < 0) return setError('Choose which columns hold the tracking number and the amount.');
    if (bad.length) return setError(`${bad.length} row${bad.length === 1 ? ' has' : 's have'} no tracking number or an amount that is not a number. Check the columns you chose.`);
    setBusy(true);
    try {
      const res = await api('/admin/reconciliation/settlements', {
        body: { courierName, reference, fileName: file.fileName, lines: lines.map((l) => ({ trackingNumber: l.trackingNumber, amountPaisa: l.amountPaisa! })) },
      });
      onDone(res.id);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  const columnSelect = (label: string, value: number, onChange: (v: number) => void) => (
    <Field label={label}>
      <select className={inputClass} value={value} onChange={(e) => onChange(Number(e.target.value))} required>
        <option value={-1}>Choose a column</option>
        {file!.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </Field>
  );

  return (
    <Card title="Import a courier payment report">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">Download the COD payment or settlement report from your courier portal as a CSV file. Each line is matched to your orders by tracking number.</p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Report file (CSV)</span>
          <input type="file" accept=".csv,text/csv,text/plain" onChange={choose} className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-sm" />
        </label>
        {file && (
          <>
            <p className="text-sm">{file.rows.length} rows in <strong>{file.fileName}</strong></p>
            <div className="grid gap-4 sm:grid-cols-2">
              {columnSelect('Tracking number column', tracking, setTracking)}
              {columnSelect('Amount paid to you (COD) column', amount, setAmount)}
              <Input label="Courier" list="couriers" required value={courierName} onChange={(e) => setCourierName(e.target.value)} />
              <Input label="Payment reference or date" required value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <datalist id="couriers">{['PostEx', 'Leopards', 'TCS', 'Trax', 'M&P', 'Call Courier'].map((c) => <option key={c} value={c} />)}</datalist>
            {lines.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-xs">
                  <caption className="px-3 py-2 text-left text-xs text-muted">First rows as they will be imported</caption>
                  <thead className="border-y border-line text-muted"><tr><th className="px-3 py-1.5 font-medium">Tracking</th><th className="px-3 py-1.5 text-right font-medium">Amount</th></tr></thead>
                  <tbody>
                    {lines.slice(0, 4).map((l, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="px-3 py-1.5">{l.trackingNumber || <span className="text-red-700">missing</span>}</td>
                        <td className="px-3 py-1.5 text-right">{l.amountPaisa == null ? <span className="text-red-700">not a number</span> : rs(l.amountPaisa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {error && <Notice>{error}</Notice>}
        <Button type="submit" busy={busy} disabled={!file}>Import and match</Button>
      </form>
    </Card>
  );
}

export default function CodPaymentsPage() {
  const router = useRouter();
  const { data: unpaid, error, loading } = useApi('/admin/reconciliation/unpaid');
  const { data: reports } = useApi<any[]>('/admin/reconciliation/settlements');
  if (loading) return <Loading />;
  if (error || !unpaid) return <LoadError error={error!} />;
  const late = unpaid.orders.filter((o: any) => o.late);

  return (
    <>
      <PageHeader title="COD payments" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Not yet paid by couriers', rs(unpaid.outstandingPaisa), `${unpaid.orders.length} delivered order${unpaid.orders.length === 1 ? '' : 's'}`],
          [`Late (over ${unpaid.lateAfterDays} days)`, String(late.length), rs(late.reduce((n: number, o: any) => n + o.totalPaisa, 0))],
          ['Paid by couriers', rs(unpaid.remittedPaisa), 'From imported reports'],
          ['Paid short', rs(unpaid.shortfallPaisa), 'Less than the order total'],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-xl border border-line bg-white p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
            <p className="text-xs text-muted">{note}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <ImportReport onDone={(id) => router.push(`/cod-payments/${id}`)} />
        <Card title="Imported reports">
          {!reports?.length ? (
            <p className="text-sm text-muted">No reports imported yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {reports.map((r) => (
                <li key={r.id} className="py-2.5">
                  <Link href={`/cod-payments/${r.id}`} className="flex items-center justify-between gap-3 hover:underline">
                    <span>
                      <span className="font-medium">{r.courierName}</span> · {r.reference}
                      <span className="block text-xs text-muted">{dateTime(r.createdAt)} · {r.lineCount} lines</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="tabular-nums">{rs(r.totalPaisa)}</span>
                      {r.lineCount - r.counts.MATCHED > 0 ? <Badge tone="amber">{r.lineCount - r.counts.MATCHED} to check</Badge> : <Badge tone="green">All matched</Badge>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Delivered orders not yet paid" className="mt-5">
        {unpaid.orders.length === 0 ? (
          <p className="text-sm text-muted">Every delivered order has been paid by a courier report.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Order</th>
                  <th className="py-2 pr-3 font-medium">Courier · tracking</th>
                  <th className="py-2 pr-3 font-medium">Delivered</th>
                  <th className="py-2 text-right font-medium">To receive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {unpaid.orders.map((o: any) => (
                  <tr key={o.id}>
                    <td className="py-2.5 pr-3"><Link href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">#{o.number}</Link> <span className="text-muted">{o.customerName}</span></td>
                    <td className="py-2.5 pr-3">{o.courierName} · {o.trackingNumber}</td>
                    <td className="py-2.5 pr-3">
                      {o.daysSinceDelivery == null ? '—' : o.daysSinceDelivery === 0 ? 'Today' : `${o.daysSinceDelivery} day${o.daysSinceDelivery === 1 ? '' : 's'} ago`}
                      {o.late && <> <Badge tone="red">Late</Badge></>}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{rs(o.totalPaisa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
