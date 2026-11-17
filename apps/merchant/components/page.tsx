import { Notice, Spinner } from '@shopistan/ui';
import Link from 'next/link';

export function PageHeader({ title, back, children }: { title: string; back?: { href: string; label: string }; children?: React.ReactNode }) {
  return (
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="mb-1 inline-block text-sm text-muted hover:text-ink">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted">
      <Spinner /> Loading…
    </div>
  );
}

export function LoadError({ error }: { error: { message: string } }) {
  return <Notice>{error.message}</Notice>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}
