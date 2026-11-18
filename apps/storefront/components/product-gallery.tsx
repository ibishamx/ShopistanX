'use client';

import { useState } from 'react';

export function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  if (!images.length) {
    return <div className="grid aspect-[3/4] place-items-center bg-[#f3f3f3] text-sm text-muted">No photo</div>;
  }
  return (
    <div className="md:sticky md:top-24 md:grid md:grid-cols-[64px_1fr] md:gap-3">
      {images.length > 1 && (
        <div className="order-2 mt-3 flex gap-2 overflow-x-auto md:order-1 md:mt-0 md:flex-col" role="list">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              role="listitem"
              onClick={() => setActive(i)}
              aria-label={`Show image ${i + 1} of ${images.length}`}
              aria-current={i === active}
              className={`w-16 shrink-0 overflow-hidden border !rounded-none ${i === active ? 'border-black' : 'border-transparent opacity-70 hover:opacity-100'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="aspect-[3/4] w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className={`order-1 aspect-[3/4] overflow-hidden bg-[#f3f3f3] md:order-2 ${images.length > 1 ? '' : 'md:col-span-2'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[active]} alt={title} className="h-full w-full object-cover" fetchPriority="high" />
      </div>
    </div>
  );
}
