import '@fontsource-variable/inter';
import type { Metadata } from 'next';
import { CartDrawer } from '@/components/cart-drawer';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { Scroller } from '@/components/scroller';
import { CAPTURE_SCRIPT } from '@/lib/attribution';
import { getStore } from '@/lib/store';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStore();
  if (!store.ok) return { title: 'Store unavailable' };
  return {
    title: { default: store.data.name, template: `%s · ${store.data.name}` },
    icons: store.data.theme.logoUrl ? { icon: store.data.theme.logoUrl } : undefined,
  };
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
        <body className="sf">
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
  const { announcements } = store.theme;
  return (
    <html lang="en">
      <head>
        {/* Static script with no user data: records the ad link the shopper arrived from. */}
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_SCRIPT }} />
      </head>
      <body style={{ ['--accent' as string]: store.theme.accentColor }} className="sf flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
        {announcements.length > 0 && (
          <div className="bg-[#111] py-2.5 text-sm text-white" role="region" aria-label="Announcements">
            <Scroller items={announcements} separator="✦" seconds={25} itemClassName="inline-flex items-center gap-6 whitespace-nowrap px-3" />
          </div>
        )}
        <Header name={store.name} logoUrl={store.theme.logoUrl} menu={store.menu} />
        <main id="main" className="flex-1">{children}</main>
        <Footer store={store} />
        <CartDrawer />
      </body>
    </html>
  );
}
