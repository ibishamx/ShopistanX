import { amountToPaisa, parseCsv } from './csv';

/**
 * Converts Shopify's product CSV export (Products → Export → "Plain CSV
 * file") into Shopistan products. Shopify writes one row per variant and one
 * per extra image; rows after the first for a product repeat only the Handle.
 */

export interface ImportedProduct {
  handle: string;
  title: string;
  description: string;
  status: 'ACTIVE' | 'DRAFT';
  productType: string;
  vendor: string;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  images: string[];
  variants: { title: string; sku: string | null; pricePaisa: number; compareAtPaisa: number | null; stock: number; trackInventory: boolean }[];
}

export interface ConvertResult {
  products: ImportedProduct[];
  warnings: string[];
}

const REQUIRED = ['Handle', 'Title', 'Variant Price'];

/** Shopify descriptions are HTML; the storefront shows plain text with line breaks. */
export function htmlToText(html: string): string {
  if (!html.trim()) return '';
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent ?? '')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function convertShopifyCsv(text: string): ConvertResult {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('That file has no product rows.');
  const headers = rows[0].map((h) => h.trim());
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(`This does not look like a Shopify product export: the ${missing.join(', ')} column${missing.length > 1 ? 's are' : ' is'} missing. In Shopify, go to Products → Export and choose “Plain CSV file”.`);
  }
  const col = (row: string[], name: string) => {
    const i = headers.indexOf(name);
    return i >= 0 ? (row[i] ?? '').trim() : '';
  };

  const warnings: string[] = [];
  const warned = new Set<string>(); // one message per product
  const byHandle = new Map<string, { product: ImportedProduct; images: { src: string; position: number }[]; optionNames: string[] }>();
  for (const [index, row] of rows.slice(1).entries()) {
    const line = index + 2;
    const handle = col(row, 'Handle');
    if (!handle) continue;
    let entry = byHandle.get(handle);
    if (!entry) {
      const title = col(row, 'Title');
      if (!title) {
        warnings.push(`Row ${line}: “${handle}” has no title on its first row, so it was skipped.`);
        continue;
      }
      const status = col(row, 'Status').toLowerCase();
      const published = col(row, 'Published').toLowerCase();
      entry = {
        product: {
          handle,
          title,
          description: htmlToText(col(row, 'Body (HTML)')),
          status: status === 'active' && published !== 'false' ? 'ACTIVE' : status === '' && published !== 'false' ? 'ACTIVE' : 'DRAFT',
          productType: col(row, 'Type'),
          vendor: col(row, 'Vendor'),
          tags: col(row, 'Tags').split(',').map((t) => t.trim()).filter(Boolean),
          seoTitle: col(row, 'SEO Title') || null,
          seoDescription: col(row, 'SEO Description') || null,
          images: [],
          variants: [],
        },
        images: [],
        optionNames: [1, 2, 3].map((n) => col(row, `Option${n} Name`)),
      };
      byHandle.set(handle, entry);
    }

    const src = col(row, 'Image Src');
    if (src) entry.images.push({ src, position: Number(col(row, 'Image Position')) || entry.images.length + 1 });
    const variantImage = col(row, 'Variant Image');
    if (variantImage) entry.images.push({ src: variantImage, position: 1000 + entry.images.length });

    const priceText = col(row, 'Variant Price');
    if (!priceText) continue; // an image-only row
    const pricePaisa = amountToPaisa(priceText);
    if (pricePaisa == null) {
      warnings.push(`Row ${line}: “${entry.product.title}” has a price that is not a number (${priceText}), so ${entry.product.variants.length ? 'that variant' : 'it'} was skipped.`);
      warned.add(handle);
      continue;
    }
    const compare = col(row, 'Variant Compare At Price');
    const compareAtPaisa = compare ? amountToPaisa(compare) : null;
    const values = [1, 2, 3].map((n) => col(row, `Option${n} Value`)).filter(Boolean);
    const title = values.length === 0 || (values.length === 1 && values[0] === 'Default Title') ? 'Default' : values.join(' / ');
    const tracked = col(row, 'Variant Inventory Tracker').toLowerCase() === 'shopify';
    const qty = Number(col(row, 'Variant Inventory Qty'));
    entry.product.variants.push({
      title: title.slice(0, 80),
      sku: col(row, 'Variant SKU') || null,
      pricePaisa,
      compareAtPaisa: compareAtPaisa != null && compareAtPaisa > pricePaisa ? compareAtPaisa : null,
      stock: tracked && Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 0,
      trackInventory: tracked,
    });
  }

  const products: ImportedProduct[] = [];
  for (const { product, images } of byHandle.values()) {
    if (!product.variants.length) {
      if (!warned.has(product.handle)) warnings.push(`“${product.title}” has no variant with a price, so it was skipped.`);
      continue;
    }
    const seen = new Set<string>();
    product.images = images
      .sort((a, b) => a.position - b.position)
      .map((i) => i.src)
      .filter((src) => /^https?:\/\//.test(src) && !seen.has(src) && seen.add(src))
      .slice(0, 30);
    // SKUs must be unique within a product; keep the first.
    const skus = new Set<string>();
    for (const v of product.variants) {
      if (v.sku && skus.has(v.sku)) v.sku = null;
      else if (v.sku) skus.add(v.sku);
    }
    products.push(product);
  }
  return { products, warnings };
}
