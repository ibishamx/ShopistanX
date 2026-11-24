'use client';

import { Button, Card, Notice, api, rs } from '@shopistan/ui';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page';
import { ConvertResult, convertShopifyCsv } from '@/lib/shopify-csv';

const BATCH = 100;

interface Outcome {
  created: number;
  updated: number;
  failed: { handle: string; error?: string }[];
}

export default function ImportProductsPage() {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setParsed(null);
    setOutcome(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 25_000_000) return setError('That file is larger than 25 MB. Export fewer products at a time.');
    setFileName(f.name);
    try {
      const result = convertShopifyCsv(await f.text());
      if (!result.products.length) return setError('No products could be read from that file.');
      setParsed(result);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function run() {
    if (!parsed) return;
    setError(null);
    const total: Outcome = { created: 0, updated: 0, failed: [] };
    try {
      for (let i = 0; i < parsed.products.length; i += BATCH) {
        setProgress(i);
        const res = await api<Outcome>('/admin/products/import', { body: { products: parsed.products.slice(i, i + BATCH) } });
        total.created += res.created;
        total.updated += res.updated;
        total.failed.push(...res.failed);
      }
      setOutcome(total);
    } catch (err: any) {
      setError(`The import stopped: ${err.message}. Products already imported are saved; run the same file again to finish (it updates instead of duplicating).`);
      setOutcome(total);
    }
    setProgress(null);
  }

  const p = parsed?.products ?? [];
  const variantCount = p.reduce((n, x) => n + x.variants.length, 0);
  const untracked = p.filter((x) => x.variants.every((v) => !v.trackInventory)).length;

  return (
    <>
      <PageHeader title="Import products" back={{ href: '/products', label: 'Products' }} />
      <div className="space-y-5">
        <Card title="1. Export from Shopify">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>In your Shopify admin, open <strong>Products</strong> and click <strong>Export</strong>.</li>
            <li>Choose <strong>All products</strong> and <strong>Plain CSV file</strong>, then export. Shopify emails you the file.</li>
          </ol>
          <p className="mt-3 text-sm text-muted">
            Titles, descriptions, prices, sale prices, SKUs, stock, variants, types, vendors, tags, photos and SEO titles all come across. Product addresses stay the same (<code>/products/…</code>), so links from ads and WhatsApp keep working. Collections are not in Shopify’s export; recreate them under <Link href="/collections" className="text-brand-700 underline">Collections</Link>.
          </p>
        </Card>

        <Card title="2. Upload the file">
          <input type="file" accept=".csv,text/csv" onChange={choose} aria-label="Shopify product CSV" className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-sm" />
          {error && <div className="mt-4"><Notice>{error}</Notice></div>}
          {parsed && !outcome && (
            <div className="mt-5 space-y-4">
              <p className="text-sm">
                <strong>{p.length} products</strong> with {variantCount} variant{variantCount === 1 ? '' : 's'} in {fileName}.
                {untracked > 0 && ` ${untracked} do not track stock in Shopify; they stay on sale here too.`}
                {' '}Products already in your store with the same address are updated, not duplicated.
              </p>
              {parsed.warnings.length > 0 && (
                <Notice tone="amber">
                  <p className="font-medium">{parsed.warnings.length} row{parsed.warnings.length === 1 ? '' : 's'} could not be used:</p>
                  <ul className="mt-1 list-disc pl-5">{parsed.warnings.slice(0, 8).map((w) => <li key={w}>{w}</li>)}</ul>
                  {parsed.warnings.length > 8 && <p className="mt-1">…and {parsed.warnings.length - 8} more.</p>}
                </Notice>
              )}
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <caption className="px-3 py-2 text-left text-xs text-muted">First products in the file</caption>
                  <thead className="border-y border-line text-xs text-muted"><tr><th className="px-3 py-1.5 font-medium">Product</th><th className="px-3 py-1.5 font-medium">Type</th><th className="px-3 py-1.5 text-right font-medium">Price</th><th className="px-3 py-1.5 text-right font-medium">Photos</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {p.slice(0, 5).map((x) => (
                      <tr key={x.handle}>
                        <td className="px-3 py-2"><span className="line-clamp-1">{x.title}</span><span className="block text-xs text-muted">{x.status === 'DRAFT' ? 'Draft · ' : ''}{x.tags.slice(0, 4).join(', ')}</span></td>
                        <td className="px-3 py-2 text-muted">{x.productType || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{rs(Math.min(...x.variants.map((v) => v.pricePaisa)))}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{x.images.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button onClick={run} busy={progress != null}>
                {progress != null ? `Importing… ${progress} of ${p.length}` : `Import ${p.length} products`}
              </Button>
            </div>
          )}
          {outcome && (
            <div className="mt-5 space-y-3">
              <Notice tone={outcome.failed.length ? 'amber' : 'green'}>
                {outcome.created} product{outcome.created === 1 ? '' : 's'} added, {outcome.updated} updated{outcome.failed.length ? `, ${outcome.failed.length} could not be imported` : ''}.
              </Notice>
              {outcome.failed.length > 0 && (
                <ul className="list-disc pl-5 text-sm">{outcome.failed.slice(0, 20).map((f) => <li key={f.handle}><code>{f.handle}</code>: {f.error}</li>)}</ul>
              )}
              <Link href="/products" className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">View products</Link>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
