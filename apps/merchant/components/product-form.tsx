'use client';

import { Button, Card, Field, Input, Notice, Textarea, api, fromPaisa, inputClass, toPaisa } from '@shopistan/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApi } from '@/lib/use-api';
import { PageHeader } from './page';
import { TagsInput } from './tags-input';

interface VariantRow {
  id?: string;
  title: string;
  sku: string;
  price: string;
  compareAt: string;
  stock: string;
  track: boolean;
}

const blankVariant = (title = ''): VariantRow => ({ title, sku: '', price: '', compareAt: '', stock: '0', track: true });

export function ProductForm({ product }: { product?: any }) {
  const router = useRouter();
  const [title, setTitle] = useState<string>(product?.title ?? '');
  const [description, setDescription] = useState<string>(product?.description ?? '');
  const [status, setStatus] = useState<string>(product?.status ?? 'ACTIVE');
  const [images, setImages] = useState<string>((product?.images ?? []).map((i: any) => i.url).join('\n'));
  const [productType, setProductType] = useState<string>(product?.productType ?? '');
  const [vendor, setVendor] = useState<string>(product?.vendor ?? '');
  const [tags, setTags] = useState<string[]>(product?.tags ?? []);
  const [seoTitle, setSeoTitle] = useState<string>(product?.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState<string>(product?.seoDescription ?? '');
  const { data: facets } = useApi<{ types: string[]; vendors: string[]; tags: string[] }>('/admin/products/facets');
  const { data: me } = useApi('/auth/me');
  const [variants, setVariants] = useState<VariantRow[]>(
    product
      ? product.variants.map((v: any) => ({
          id: v.id,
          title: v.title,
          sku: v.sku ?? '',
          price: fromPaisa(v.pricePaisa),
          compareAt: fromPaisa(v.compareAtPaisa),
          stock: String(v.stock),
          track: v.trackInventory ?? true,
        }))
      : [blankVariant('Default')],
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  const setVariant = (index: number, patch: Partial<VariantRow>) =>
    setVariants((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const payloadVariants = [];
    for (const [i, v] of variants.entries()) {
      const label = variants.length > 1 ? `Variant ${i + 1}` : 'Product';
      const pricePaisa = toPaisa(v.price);
      if (pricePaisa == null) return setError(`${label}: enter a price in rupees, e.g. 2500`);
      const compareAtPaisa = v.compareAt.trim() ? toPaisa(v.compareAt) : null;
      if (v.compareAt.trim() && compareAtPaisa == null) return setError(`${label}: the original price is not a valid amount`);
      if (v.track && !/^\d+$/.test(v.stock.trim())) return setError(`${label}: stock must be a whole number`);
      payloadVariants.push({ id: v.id, title: v.title.trim() || 'Default', sku: v.sku.trim() || null, pricePaisa, compareAtPaisa, stock: v.track ? Number(v.stock) : 0, trackInventory: v.track });
    }
    const body = {
      title,
      description,
      status,
      productType,
      vendor,
      tags,
      seoTitle: seoTitle.trim() || null,
      seoDescription: seoDescription.trim() || null,
      images: images.split('\n').map((s) => s.trim()).filter(Boolean),
      variants: payloadVariants,
    };

    setBusy('save');
    try {
      if (product) {
        const updated = await api(`/admin/products/${product.id}`, { method: 'PUT', body });
        setVariants((rows) => rows.map((row, i) => ({ ...row, id: updated.variants[i]?.id })));
        setSaved(true);
      } else {
        await api('/admin/products', { body });
        router.push('/products');
      }
    } catch (err: any) {
      setError(err.message);
    }
    setBusy(null);
  }

  async function remove() {
    if (!window.confirm(`Delete "${product.title}"? This cannot be undone. Past orders keep their details.`)) return;
    setBusy('delete');
    try {
      await api(`/admin/products/${product.id}`, { method: 'DELETE' });
      router.push('/products');
    } catch (err: any) {
      setError(err.message);
      setBusy(null);
    }
  }

  return (
    <form onSubmit={save}>
      <PageHeader title={product ? product.title : 'Add product'} back={{ href: '/products', label: 'Products' }}>
        {product && <Button type="button" variant="danger" busy={busy === 'delete'} onClick={remove}>Delete</Button>}
        <Button type="submit" busy={busy === 'save'}>Save product</Button>
      </PageHeader>
      <div className="space-y-5">
        {error && <Notice>{error}</Notice>}
        {saved && <Notice tone="green">Product saved.</Notice>}
        <Card>
          <div className="space-y-4">
            <Input label="Title" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Embroidered lawn suit" />
            <Textarea label="Description" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
            <Field label="Visibility">
              <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ACTIVE">Active: visible in your store</option>
                <option value="DRAFT">Draft: hidden from your store</option>
              </select>
            </Field>
          </div>
        </Card>
        <Card title="Organisation">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Product type" list="product-types" value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="Khaddar 3 Piece" />
            <datalist id="product-types">{facets?.types.map((t) => <option key={t} value={t} />)}</datalist>
            <Input label="Vendor or brand" list="product-vendors" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            <datalist id="product-vendors">{facets?.vendors.map((t) => <option key={t} value={t} />)}</datalist>
            <div className="sm:col-span-2">
              <TagsInput value={tags} onChange={setTags} suggestions={facets?.tags ?? []} hint="Press Enter after each tag. Tags can put products into automatic collections." />
            </div>
          </div>
          {product?.collections?.length > 0 && (
            <p className="mt-4 text-sm">
              In collections:{' '}
              {product.collections.map((c: any, i: number) => (
                <span key={c.collection.id}>{i > 0 && ', '}<Link href={`/collections/${c.collection.id}`} className="text-brand-700 hover:underline">{c.collection.title}</Link></span>
              ))}
              <span className="block text-xs text-muted">Manual collections only. Automatic collections pick products by their rules.</span>
            </p>
          )}
        </Card>
        <Card title="Images">
          <Textarea
            label="Image links"
            rows={3}
            value={images}
            onChange={(e) => setImages(e.target.value)}
            placeholder="https://…/photo.jpg"
            hint="One link per line. The first image is the main photo."
          />
        </Card>
        <Card
          title="Price and stock"
          action={<Button type="button" variant="secondary" onClick={() => setVariants([...variants, blankVariant()])}>Add variant</Button>}
        >
          <div className="space-y-4">
            {variants.map((v, i) => (
              <div key={v.id ?? `new-${i}`} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_0.9fr_1fr_auto] sm:items-start">
                <Input label={variants.length > 1 ? 'Variant' : 'Variant name'} value={v.title} onChange={(e) => setVariant(i, { title: e.target.value })} placeholder="Medium / Red" />
                <Input label="Price (Rs)" inputMode="decimal" required value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} />
                <Input label="Original price" inputMode="decimal" value={v.compareAt} onChange={(e) => setVariant(i, { compareAt: e.target.value })} />
                <div>
                  <Input label="Stock" inputMode="numeric" required={v.track} disabled={!v.track} value={v.track ? v.stock : ''} placeholder={v.track ? '' : 'Not tracked'} onChange={(e) => setVariant(i, { stock: e.target.value })} />
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <input type="checkbox" className="accent-brand-600" checked={v.track} onChange={(e) => setVariant(i, { track: e.target.checked })} /> Track stock
                  </label>
                </div>
                <Input label="SKU" value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={variants.length === 1}
                  aria-label={`Remove variant ${i + 1}`}
                  className="sm:mt-6"
                  onClick={() => setVariants(variants.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Use variants for sizes or colours. "Original price" shows a crossed-out price next to the selling price. Turn off "Track stock" for made-to-order items: they stay on sale and orders do not reduce stock.</p>
        </Card>
        <Card title="Search engine listing">
          <div className="mb-4 rounded-lg border border-line p-3">
            <p className="text-xs text-muted">Preview on Google</p>
            <p className="mt-1 truncate text-lg text-[#1a0dab]">{seoTitle.trim() || title || 'Product title'}</p>
            <p className="truncate text-xs text-[#006621]">{me?.store.url ?? ''}/products/{product?.handle ?? '…'}</p>
            <p className="line-clamp-2 text-sm text-[#545454]">{seoDescription.trim() || description.replace(/<[^>]+>/g, ' ').slice(0, 160) || 'Add a description to show here.'}</p>
          </div>
          <div className="space-y-4">
            <Input label="Page title" maxLength={120} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} hint={`${seoTitle.length} of 70 characters used (longer titles are cut off by Google). Leave empty to use the product title.`} />
            <Textarea label="Meta description" rows={3} maxLength={320} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} hint={`${seoDescription.length} of 160 characters used. Leave empty to use the start of the description.`} />
          </div>
        </Card>
      </div>
    </form>
  );
}
