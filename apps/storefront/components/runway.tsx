'use client';

import { rs } from '@shopistan/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Product } from '@/lib/store';

const STEP_SECONDS = 3;

/**
 * Homepage feature: product photos walk down a runway towards the viewer,
 * and a caption names the product currently at the front.
 */
export function Runway({ storeName, heading, products }: { storeName: string; heading: string; products: Product[] }) {
  const looks = products.filter((p) => p.images[0]).slice(0, 8);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (looks.length < 2) return;
    const start = performance.now();
    const timer = setInterval(() => setIndex(Math.floor((performance.now() - start) / (STEP_SECONDS * 1000)) % looks.length), 500);
    return () => clearInterval(timer);
  }, [looks.length]);

  if (!looks.length) return null;
  // Model i runs 3i seconds ahead, so the one at the front (55% of its cycle) shifts back one every step.
  const n = looks.length;
  const front = looks[(((Math.round(n * 0.55) - index) % n) + n) % n];

  return (
    <section className="overflow-hidden bg-sand-100 pb-6 pt-10 text-[#292321]" aria-label={heading || 'Runway'}>
      <div className="px-4 text-center">
        <span className="text-xs font-bold uppercase tracking-[0.45em]">{storeName}</span>
        {heading && <h2 className="sf-display mt-2 text-[clamp(25px,4vw,48px)] uppercase tracking-[0.04em]">{heading}</h2>}
        <p className="text-[13px] tracking-[0.12em]">Discover your next favourite look</p>
      </div>
      <div className="relative isolate h-[410px] sm:h-[clamp(390px,52vw,660px)]">
        <div className="sf-runway-floor absolute inset-x-0 bottom-[4%] h-[42%] sm:inset-x-[8%]" aria-hidden />
        <div className="absolute inset-0 z-[1]" style={{ ['--sf-duration' as string]: `${looks.length * STEP_SECONDS}s` }}>
          {looks.map((p, i) => (
            <Link key={p.id} href={`/products/${p.handle}`} className="sf-runway-model" style={{ ['--i' as string]: i }} aria-label={`Shop ${p.title}`} tabIndex={-1}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.images[0]} alt="" loading="lazy" className="h-full w-full object-contain object-bottom drop-shadow-[5px_12px_9px_rgba(53,44,36,0.14)]" />
            </Link>
          ))}
        </div>
        <div className="absolute bottom-[2%] left-2.5 z-10 max-w-[160px] border border-[#e8e0d5] bg-sand-100/85 p-2.5 backdrop-blur sm:bottom-[12%] sm:left-[clamp(12px,5%,70px)] sm:max-w-[220px] sm:p-4" aria-live="polite">
          <p className="sf-display text-[13px] leading-snug sm:text-[17px]">{front.title}</p>
          <p className="my-1.5 text-[13px]">{rs(Math.min(...front.variants.map((v) => v.pricePaisa)))}</p>
          <Link href={`/products/${front.handle}`} className="mt-1 inline-block bg-[#292321] px-3 py-2.5 text-[11px] tracking-[0.1em] text-white">SHOP NOW ↗</Link>
        </div>
      </div>
      <div className="pt-2 text-center">
        <Link href="/products" className="border-b border-current pb-1 text-xs tracking-[0.16em]">EXPLORE COLLECTION →</Link>
      </div>
    </section>
  );
}
