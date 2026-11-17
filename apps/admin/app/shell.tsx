'use client';

import { ApiError, Logo, Notice, Spinner, api } from '@shopistan/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export function useAdminApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) window.location.href = '/login';
      else setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, reload };
}

export function Shell({ title, error, loading, children }: { title: string; error: string | null; loading: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const link = (href: string, label: string) => (
    <Link href={href} aria-current={pathname === href ? 'page' : undefined} className={`rounded-lg px-3 py-1.5 text-sm ${pathname === href ? 'bg-white/15 font-medium text-white' : 'text-white/70 hover:text-white'}`}>
      {label}
    </Link>
  );
  return (
    <div className="min-h-screen">
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Logo />
          <span className="rounded bg-white/15 px-2 py-0.5 text-xs font-medium">Super Admin</span>
          <nav aria-label="Main" className="flex gap-1">
            {link('/', 'Stores')}
            {link('/audit', 'Audit log')}
          </nav>
          <button
            className="ml-auto cursor-pointer text-sm text-white/70 hover:text-white"
            onClick={async () => {
              await api('/platform/auth/logout', { method: 'POST' }).catch(() => {});
              window.location.href = '/login';
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="mb-5 text-xl font-semibold tracking-tight">{title}</h1>
        {error ? <Notice>{error}</Notice> : loading ? <p className="flex items-center gap-2 text-sm text-muted"><Spinner /> Loading…</p> : children}
      </main>
    </div>
  );
}
