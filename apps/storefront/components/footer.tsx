import { pkPhone } from '@shopistan/ui';
import Link from 'next/link';
import type { Store } from '@/lib/store';

export function Footer({ store }: { store: Store }) {
  const { theme } = store;
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          {theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logoUrl} alt={store.name} className="h-14 w-auto object-contain" />
          ) : (
            <p className="sf-display text-xl uppercase tracking-[0.18em]">{store.name}</p>
          )}
          {theme.footerText && <p className="mt-4 max-w-sm whitespace-pre-line text-sm leading-relaxed text-muted">{theme.footerText}</p>}
        </div>
        <div>
          <h2 className="sf-eyebrow mb-4 text-[10px]">Shop</h2>
          <ul className="space-y-2.5 text-sm">
            <li><Link href="/" className="hover:underline">Home</Link></li>
            <li><Link href="/products" className="hover:underline">All products</Link></li>
            <li><Link href="/cart" className="hover:underline">Cart</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="sf-eyebrow mb-4 text-[10px]">Contact us</h2>
          <ul className="space-y-2.5 text-sm">
            {store.whatsappNumber && (
              <li><a href={`https://wa.me/${store.whatsappNumber}`} target="_blank" rel="noreferrer" className="hover:underline">WhatsApp {pkPhone(store.whatsappNumber)}</a></li>
            )}
            {store.supportPhone && <li><a href={`tel:${store.supportPhone.replace(/\s/g, '')}`} className="hover:underline">Call {store.supportPhone}</a></li>}
            <li className="text-muted">Cash on Delivery all over Pakistan</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-5 text-xs text-muted">
          <p>© {new Date().getFullYear()} {store.name}</p>
          <p>Powered by Shopistan</p>
        </div>
      </div>
    </footer>
  );
}
