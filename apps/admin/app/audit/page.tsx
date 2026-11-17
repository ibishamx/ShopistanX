'use client';

import { dateTime } from '@shopistan/ui';
import { Shell, useAdminApi } from '../shell';

interface Log {
  id: string;
  actorEmail: string;
  action: string;
  detail: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const { data: logs, error } = useAdminApi<Log[]>('/platform/audit-logs');
  return (
    <Shell title="Audit log" error={error} loading={!logs}>
      {logs?.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center text-sm text-muted">No staff actions recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Staff</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs?.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{dateTime(l.createdAt)}</td>
                  <td className="px-4 py-3">{l.actorEmail}<span className="block text-xs text-muted">{l.ip}</span></td>
                  <td className="px-4 py-3"><code className="text-xs">{l.action}</code></td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {l.detail && Object.entries(l.detail).map(([k, v]) => <span key={k} className="mr-3 inline-block">{k}: <span className="text-ink">{String(v)}</span></span>)}
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
