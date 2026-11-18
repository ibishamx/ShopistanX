'use client';

import { Button, Logo, Notice, api } from '@shopistan/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Loading } from '@/components/page';
import { useApi } from '@/lib/use-api';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/orders', label: 'Orders' },
  { href: '/products', label: 'Products' },
  { href: '/customers', label: 'Customers' },
  { href: '/settings', label: 'Store settings' },
  { href: '/settings/design', label: 'Storefront design' },
  { href: '/settings/cod-form', label: 'COD form' },
  { href: '/settings/whatsapp', label: 'WhatsApp' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: me, error, loading } = useApi('/auth/me');

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  if (loading) return <div className="p-8"><Loading /></div>;
  if (error || !me) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-8">
        <Logo />
        <Notice tone={error?.code === 'STORE_SUSPENDED' ? 'amber' : 'red'}>{error?.message ?? 'Could not load your store.'}</Notice>
        <Button variant="secondary" onClick={logout}>Sign out</Button>
      </main>
    );
  }

  const active = (href: string) =>
    href === '/' ? pathname === '/' : href === '/settings' ? pathname === '/settings' : pathname.startsWith(href);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
      <aside className="border-b border-line bg-white md:min-h-screen md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <Logo />
          <p className="truncate text-sm text-muted md:mt-4 md:font-medium md:text-ink">{me.store.name}</p>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:block md:space-y-0.5 md:pb-0">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item.href) ? 'page' : undefined}
              className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active(item.href) ? 'bg-brand-50 font-medium text-brand-700' : 'text-muted hover:bg-canvas hover:text-ink'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden space-y-1 border-t border-line px-2 py-3 md:mt-4 md:block">
          {me.store.url && (
            <a href={me.store.url} target="_blank" rel="noreferrer" className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-canvas hover:text-ink">
              View store ↗
            </a>
          )}
          <button onClick={logout} className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-canvas hover:text-ink">
            Sign out
          </button>
          <p className="truncate px-3 pt-1 text-xs text-muted">{me.user.email}</p>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
        {children}
        <div className="mt-8 flex gap-4 text-sm md:hidden">
          {me.store.url && <a href={me.store.url} target="_blank" rel="noreferrer" className="text-brand-700">View store ↗</a>}
          <button onClick={logout} className="text-muted">Sign out</button>
        </div>
      </main>
    </div>
  );
}
