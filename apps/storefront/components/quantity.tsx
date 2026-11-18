'use client';

export function Quantity({ value, max, onChange, label }: { value: number; max: number; onChange: (v: number) => void; label: string }) {
  const button = 'grid h-9 w-9 place-items-center text-base disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed';
  return (
    <div role="group" aria-label={label} className="btn inline-flex items-center border border-line bg-white">
      <button type="button" className={button} aria-label="Decrease quantity" disabled={value <= 1} onClick={() => onChange(value - 1)}>−</button>
      <span aria-live="polite" className="w-7 text-center text-sm tabular-nums">{value}</span>
      <button type="button" className={button} aria-label="Increase quantity" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}
