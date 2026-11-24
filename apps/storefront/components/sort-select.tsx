'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const OPTIONS: [string, string][] = [['', 'Featured'], ['newest', 'Newest'], ['price_asc', 'Price, low to high'], ['price_desc', 'Price, high to low'], ['title_asc', 'Alphabetically, A–Z']];

export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Sort by</span>
      <select
        className="border border-line bg-white px-2 py-1.5 text-sm"
        value={params.get('sort') ?? ''}
        onChange={(e) => router.push(e.target.value ? `${pathname}?sort=${e.target.value}` : pathname, { scroll: false })}
      >
        {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
