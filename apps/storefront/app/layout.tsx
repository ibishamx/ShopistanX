import type { Metadata } from 'next';
import Link from 'next/link';
import { CartLink } from '@/components/cart-link';
import { getStore } from '@/lib/store';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStore();
  return store.ok ? { title: { default: store.data.name, template: `%s · ${store.data.name}` } } : { title: 'Store unavailable' };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const result = await getStore();

  if (!result.ok) {
    const message =
      result.status === 404
        ? { title: 'There is no store at this address', text: 'Check the address and try again.' }
        : result.status === 503
          ? { title: 'This store is currently unavailable', text: 'Please check back later.' }
          : { title: 'This store could not be loaded', text: 'Please try again in a moment.' };
    return (
      <html lang="en">
        <body>
          <main className="grid min-h-screen place-items-center px-4 text-center">
            <div>
              <h1 className="text-xl font-semibold">{message.title}</h1>
              <p className="mt-2 text-sm text-muted">{message.text}</p>
            </div>
          </main>
        </body>
      </html>
    );
  }

  const store = result.data;
  return (
    <html lang="en">
      <body style={{ ['--accent' as string]: store.theme.accentColor }} className="flex min-h-screen flex-col">
        {store.theme.announcement && (
          <p className="px-4 py-2 text-center text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>
            {store.theme.announcement}
          </p>
        )}
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">{store.name}</Link>
            <CartLink />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-line bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-2 px-4 py-6 text-sm text-muted">
            <p>© {new Date().getFullYear()} {store.name}</p>
            {store.supportPhone && <p>Help: <a className="underline" href={`tel:${store.supportPhone}`}>{store.supportPhone}</a></p>}
            <p>Powered by Shopistan</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
