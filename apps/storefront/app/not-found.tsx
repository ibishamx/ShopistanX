import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted">This product or order link does not exist in this store.</p>
      <Link href="/" className="mt-4 inline-block text-sm font-medium underline">Back to the store</Link>
    </div>
  );
}
