import { Logo } from '@shopistan/ui';

const MERCHANT_URL = process.env.NEXT_PUBLIC_MERCHANT_URL || 'http://localhost:3001';

const FEATURES = [
  { title: 'One-step COD order form', text: 'Customers order from the product page with name, mobile number and address. No account, no long checkout.' },
  { title: 'WhatsApp order confirmation', text: 'Customers confirm on WhatsApp right after ordering. Connect WhatsApp Business to send confirmation requests automatically.' },
  { title: 'Fewer returned parcels', text: 'Every order shows the customer’s delivery history, so you can call before shipping to someone who refused a parcel before.' },
  { title: 'Your store, live in minutes', text: 'Sign up, name your store and it opens on its own address. Add products with variants, stock and prices in rupees.' },
  { title: 'Orders from placed to delivered', text: 'Confirm, ship with any courier and tracking number, then mark delivered or returned. Stock updates itself.' },
  { title: 'Priced in PKR', text: 'Prices, delivery charges and free-delivery thresholds are all in rupees.' },
];

export default function LandingPage() {
  const cta = 'inline-block rounded-lg bg-brand-600 px-5 py-3 text-base font-medium text-white hover:bg-brand-700';
  return (
    <>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Logo className="text-lg" />
        <nav className="flex items-center gap-4 text-sm">
          <a href={`${MERCHANT_URL}/login`} className="text-muted hover:text-ink">Sign in</a>
          <a href={`${MERCHANT_URL}/signup`} className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">Create store</a>
        </nav>
      </header>
      <main>
        <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">The online store built for Cash on Delivery</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
            Shopistan gives Pakistani sellers a store with a one-step COD order form and WhatsApp order confirmation built in.
          </p>
          <a href={`${MERCHANT_URL}/signup`} className={`${cta} mt-8`}>Create your store</a>
        </section>
        <section className="border-y border-line bg-canvas">
          <ul className="mx-auto grid max-w-5xl gap-5 px-4 py-14 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-xl border border-line bg-white p-5">
                <h2 className="font-semibold">{f.title}</h2>
                <p className="mt-2 text-sm text-muted">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Start selling today</h2>
          <a href={`${MERCHANT_URL}/signup`} className={`${cta} mt-6`}>Create your store</a>
        </section>
      </main>
      <footer className="border-t border-line px-4 py-6 text-center text-sm text-muted">© {new Date().getFullYear()} Shopistan</footer>
    </>
  );
}
