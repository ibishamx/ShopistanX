import Link from 'next/link';
import type { Theme } from '@/lib/store';
import { TrustGlyph } from './icons';
import { Scroller } from './scroller';

export function Hero({ theme }: { theme: Theme }) {
  return (
    <section className="relative">
      <div className={`relative overflow-hidden ${theme.heroImageUrl ? 'aspect-[4/5] sm:aspect-[16/9] lg:aspect-[21/9]' : 'min-h-[360px] sm:min-h-[460px]'} bg-gradient-to-br from-[#3a2f28] via-[#5b4636] to-[#a67c52]`}>
        {theme.heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={theme.heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 pb-8 text-white sm:flex-row sm:items-end sm:justify-between sm:pb-12">
          <div className="max-w-xl">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[40px]">{theme.heroHeading}</h1>
            {theme.heroSubheading && <p className="mt-2 text-sm text-white/85 sm:text-base">{theme.heroSubheading}</p>}
          </div>
          <Link href="/products" className="btn shrink-0 border border-white px-7 py-3 text-sm font-medium hover:bg-white hover:text-black transition-colors">
            {theme.heroButtonText}
          </Link>
        </div>
      </div>
    </section>
  );
}

export function CollectionMarquee({ large, small }: { large: string[]; small: string[] }) {
  if (!large.length && !small.length) return null;
  return (
    <section className="bg-[linear-gradient(100deg,#d8b78e,#c98578)] py-1 text-[#fffaf3]" aria-label="Highlights">
      {large.length > 0 && (
        <Scroller
          items={large}
          separator="✦"
          seconds={35}
          itemClassName="sf-display inline-flex items-center gap-4 whitespace-nowrap px-3 text-[32px] font-semibold sm:gap-6 sm:text-[clamp(30px,4.3vw,76px)] [&>span]:font-sans [&>span]:text-[0.48em]"
        />
      )}
      {small.length > 0 && (
        <Scroller
          items={small}
          separator="•"
          seconds={38}
          direction="right"
          itemClassName="inline-flex items-center gap-4 whitespace-nowrap px-3 py-1 text-[10px] font-bold uppercase tracking-[2px] sm:gap-6 sm:px-[18px] sm:text-xs sm:tracking-[3px]"
        />
      )}
    </section>
  );
}

export function TrustBar({ items }: { items: Theme['trustItems'] }) {
  if (!items.length) return null;
  const cols = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[items.length as 1 | 2 | 3 | 4];
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <ul className={`grid grid-cols-2 gap-x-3 gap-y-6 text-center ${cols}`}>
        {items.map((item, i) => (
          <li key={i} className="flex flex-col items-center gap-2 text-[#29251f]">
            <TrustGlyph icon={item.icon} className="h-8 w-8 sm:h-[38px] sm:w-[38px]" />
            <h3 className="text-sm font-semibold sm:text-[15px]">{item.title}</h3>
            {item.text && <p className="text-xs leading-normal text-[#625d55] sm:text-[13px]">{item.text}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SectionHeading({ title, href, linkLabel = 'View all' }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 className="text-[23px] font-semibold leading-tight tracking-tight sm:text-[28px]">{title}</h2>
      {href && <Link href={href} className="shrink-0 border-b border-current pb-0.5 text-xs tracking-[0.12em] uppercase">{linkLabel}</Link>}
    </div>
  );
}

export function Faq({ items, whatsappNumber }: { items: Theme['faq']; whatsappNumber: string | null }) {
  if (!items.length) return null;
  return (
    <section className="px-5 py-14 text-cocoa">
      <div className="mx-auto max-w-[850px]">
        <div className="mb-9 text-center">
          <p className="sf-eyebrow mb-3 text-[#ad7960]">Need help?</p>
          <h2 className="sf-display text-[clamp(34px,5vw,48px)]">Frequently Asked Questions</h2>
        </div>
        <div className="border-t border-sand-400">
          {items.map((item, i) => (
            <details key={i} className="sf-faq border-b border-sand-400">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-[15px] font-semibold">
                {item.question}
                <span aria-hidden className="sf-faq-icon grid h-[25px] w-[25px] shrink-0 place-items-center rounded-full border border-[#cbb8a4] text-lg font-normal text-sand-700 transition-transform">+</span>
              </summary>
              <p className="whitespace-pre-line pb-5 pr-9 text-sm leading-7 text-taupe">{item.answer}</p>
            </details>
          ))}
        </div>
        {whatsappNumber && (
          <p className="mt-9 text-center text-sm leading-7 text-taupe">
            Still have a question?{' '}
            <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" className="font-bold text-[#8b5945] underline underline-offset-4">Message us on WhatsApp</a>
          </p>
        )}
      </div>
    </section>
  );
}
