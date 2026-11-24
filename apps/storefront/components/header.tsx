'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { setCartDrawer, useCart } from '@/lib/cart';
import { BagIcon, CloseIcon, MenuIcon, SearchIcon } from './icons';

export function Header({ name, logoUrl, menu }: { name: string; logoUrl: string; menu: { title: string; handle: string }[] }) {
  const LINKS = [
    { href: '/', label: 'Home' },
    ...menu.map((m) => ({ href: `/collections/${m.handle}`, label: m.title })),
    { href: '/products', label: 'Shop all' },
  ];
  const count = useCart().reduce((n, l) => n + l.quantity, 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4 md:h-20">
        <div className="flex items-center gap-6">
          <button
            type="button"
            className="-ml-2 grid h-10 w-10 place-items-center md:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
          </button>
          <nav aria-label="Main" className="hidden flex-wrap gap-x-6 gap-y-1 md:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} aria-current={pathname === l.href ? 'page' : undefined} className="text-sm hover:underline underline-offset-4 aria-[current=page]:underline">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link href="/" className="flex items-center justify-center" aria-label={`${name} home`}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={name} className="h-[51px] w-auto max-w-[180px] object-contain md:h-[61px]" />
          ) : (
            <span className="sf-display text-center text-xl uppercase tracking-[0.18em] md:text-2xl">{name}</span>
          )}
        </Link>
        <div className="flex items-center justify-end gap-1">
          <Link href="/search" className="grid h-10 w-10 place-items-center" aria-label="Search">
            <SearchIcon className="h-[22px] w-[22px]" />
          </Link>
          <button type="button" onClick={() => setCartDrawer(true)} className="relative -mr-2 grid h-10 w-10 place-items-center" aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}>
            <BagIcon className="h-6 w-6" />
            {count > 0 && (
              <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-black px-1 text-[10px] font-semibold text-white">{count}</span>
            )}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav aria-label="Main" className="border-t border-line px-4 py-2 md:hidden">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="block py-3 text-base">{l.label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}
