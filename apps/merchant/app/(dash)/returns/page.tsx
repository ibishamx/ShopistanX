'use client';

import { Card, rs } from '@shopistan/ui';
import Link from 'next/link';
import { useState } from 'react';
import { Empty, LoadError, Loading, PageHeader } from '@/components/page';
import { useApi } from '@/lib/use-api';

interface Row {
  key: string;
  delivered: number;
  returned: number;
  returnRate: number | null;
  returnedValuePaisa: number;
}

const DIMENSIONS = ['city', 'product', 'courier', 'campaign', 'hour', 'risk'] as const;
const RANGES = [30, 90, 365];
const pct = (rate: number | null) => (rate == null ? '—' : `${Math.round(rate * 100)}%`);

function RateBar({ rate, overall }: { rate: number | null; overall: number | null }) {
  if (rate == null) return null;
  const worse = overall != null && rate > overall;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-canvas" aria-hidden>
      <span className={`block h-full rounded-full ${worse ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${Math.max(rate * 100, 2)}%` }} />
    </span>
  );
}

export default function ReturnsPage() {
  const [days, setDays] = useState(90);
  const [dim, setDim] = useState<(typeof DIMENSIONS)[number]>('city');
  const { data, error, loading } = useApi(`/admin/analytics/rto?days=${days}`);

  return (
    <>
      <PageHeader title="Returns (RTO)">
        <div role="group" aria-label="Period" className="flex rounded-lg border border-line bg-white p-0.5">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`cursor-pointer rounded-md px-3 py-1 text-sm ${days === d ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
            >
              {d === 365 ? '1 year' : `${d} days`}
            </button>
          ))}
        </div>
      </PageHeader>
      {loading && !data ? <Loading /> : error || !data ? <LoadError error={error!} /> : data.totals.delivered + data.totals.returned === 0 ? (
        <Empty title="No delivered or returned parcels in this period">
          Mark orders as delivered or returned on the order page and this report fills in. <Link href="/orders?filter=shipped" className="text-brand-700 underline">Shipped orders</Link>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Return rate', pct(data.totals.returnRate)],
              ['Parcels returned', data.totals.returned],
              ['Parcels delivered', data.totals.delivered],
              ['Value of returned orders', rs(data.totals.returnedValuePaisa)],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl border border-line bg-white p-4">
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Orders placed in the last {days} days that were delivered or returned. Open orders are not counted.</p>

          <Card className="mt-5">
            <div role="tablist" aria-label="Break down by" className="-mt-1 mb-4 flex gap-1 overflow-x-auto">
              {DIMENSIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={dim === d}
                  onClick={() => setDim(d)}
                  className={`cursor-pointer whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${dim === d ? 'bg-ink text-white' : 'border border-line text-muted hover:text-ink'}`}
                >
                  {data.breakdowns[d].label}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto" role="tabpanel">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-line text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">{data.breakdowns[dim].label}</th>
                    <th className="w-40 py-2 pr-3 font-medium">Return rate</th>
                    <th className="py-2 pr-3 text-right font-medium">Returned</th>
                    <th className="py-2 pr-3 text-right font-medium">Delivered</th>
                    <th className="py-2 text-right font-medium">Returned value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.breakdowns[dim].rows.map((r: Row) => (
                    <tr key={r.key}>
                      <td className="py-2.5 pr-3">{dim === 'risk' ? r.key.replace(/^\w/, (c) => c.toUpperCase()) : r.key}</td>
                      <td className="py-2.5 pr-3">
                        <span className="flex items-center gap-2">
                          <span className="w-10 tabular-nums">{pct(r.returnRate)}</span>
                          <RateBar rate={r.returnRate} overall={data.totals.returnRate} />
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{r.returned}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{r.delivered}</td>
                      <td className="py-2.5 text-right tabular-nums">{rs(r.returnedValuePaisa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">
              Red bars are worse than your overall return rate.
              {dim === 'campaign' && ' Campaigns come from utm_source and utm_campaign in your ad links; Facebook, TikTok and Google click IDs are recognised too.'}
              {dim === 'hour' && ' Hour the order was placed, Pakistan time.'}
              {dim === 'product' && ' An order with several products counts once for each product.'}
            </p>
          </Card>
        </>
      )}
    </>
  );
}
