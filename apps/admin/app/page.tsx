'use client';

import { Badge, Button, Input, Notice, api } from '@shopistan/ui';
import { useState } from 'react';
import { Shell, useAdminApi } from './shell';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  plan: string;
  createdAt: string;
  url: string | null;
  owner: { email: string; name: string } | null;
  orders: number;
  products: number;
}

const TONE = { TRIAL: 'blue', ACTIVE: 'green', SUSPENDED: 'red', DEACTIVATED: 'gray' } as const;

export default function StoresPage() {
  const { data: tenants, error, reload } = useAdminApi<Tenant[]>('/platform/tenants');
  const [suspending, setSuspending] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(id: string, action: 'suspend' | 'reactivate', body?: object) {
    setBusy(id);
    setActionError(null);
    try {
      await api(`/platform/tenants/${id}/${action}`, { method: 'POST', body: body ?? {} });
      setSuspending(null);
      setReason('');
      await reload();
    } catch (e: any) {
      setActionError(e.message);
    }
    setBusy(null);
  }

  return (
    <Shell title="Stores" error={error} loading={!tenants}>
      {actionError && <div className="mb-4"><Notice>{actionError}</Notice></div>}
      {tenants?.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center text-sm text-muted">No stores have signed up yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Store</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Products</th>
                <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tenants?.map((t) => (
                <tr key={t.id} className="align-top">
                  <td className="px-4 py-3">
                    <span className="font-medium">{t.name}</span>
                    {t.url && <a href={t.url} target="_blank" rel="noreferrer" className="block text-xs text-brand-700 hover:underline">{t.url.replace(/^https?:\/\//, '')}</a>}
                  </td>
                  <td className="px-4 py-3">{t.owner?.name ?? '—'}<span className="block text-xs text-muted">{t.owner?.email}</span></td>
                  <td className="px-4 py-3"><Badge tone={TONE[t.status]}>{t.status.toLowerCase()}</Badge></td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.products}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.orders}</td>
                  <td className="px-4 py-3 text-muted">{new Date(t.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-3 text-right">
                    {t.status === 'SUSPENDED' ? (
                      <Button variant="secondary" busy={busy === t.id} onClick={() => act(t.id, 'reactivate')}>Reactivate</Button>
                    ) : suspending === t.id ? (
                      <form
                        className="flex min-w-64 flex-col gap-2 text-left"
                        onSubmit={(e) => {
                          e.preventDefault();
                          act(t.id, 'suspend', { reason });
                        }}
                      >
                        <Input label={`Reason for suspending ${t.name}`} required minLength={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} hint="Recorded in the audit log. The storefront and admin stop working immediately." />
                        <div className="flex gap-2">
                          <Button type="submit" variant="danger" busy={busy === t.id}>Suspend store</Button>
                          <Button type="button" variant="ghost" onClick={() => setSuspending(null)}>Keep active</Button>
                        </div>
                      </form>
                    ) : (
                      <Button variant="danger" onClick={() => { setSuspending(t.id); setReason(''); }}>Suspend</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
