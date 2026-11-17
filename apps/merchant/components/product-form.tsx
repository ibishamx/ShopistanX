'use client';

import { Button, Card, Field, Input, Notice, Textarea, api, fromPaisa, inputClass, toPaisa } from '@shopistan/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from './page';

interface VariantRow {
  id?: string;
  title: string;
  sku: string;
  price: string;
  compareAt: string;
  stock: string;
}

const blankVariant = (title = ''): VariantRow => ({ title, sku: '', price: '', compareAt: '', stock: '0' });

export function ProductForm({ product }: { product?: any }) {
  const router = useRouter();
  const [title, setTitle] = useState<string>(product?.title ?? '');
  const [description, setDescription] = useState<string>(product?.description ?? '');
  const [status, setStatus] = useState<string>(product?.status ?? 'ACTIVE');
  const [images, setImages] = useState<string>((product?.images ?? []).map((i: any) => i.url).join('\n'));
  const [variants, setVariants] = useState<VariantRow[]>(
    product
      ? product.variants.map((v: any) => ({
          id: v.id,
          title: v.title,
          sku: v.sku ?? '',
          price: fromPaisa(v.pricePaisa),
          compareAt: fromPaisa(v.compareAtPaisa),
          stock: String(v.stock),
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
      if (!/^\d+$/.test(v.stock.trim())) return setError(`${label}: stock must be a whole number`);
      payloadVariants.push({ id: v.id, title: v.title.trim() || 'Default', sku: v.sku.trim() || null, pricePaisa, compareAtPaisa, stock: Number(v.stock) });
    }
    const body = {
      title,
      description,
      status,
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
              <div key={v.id ?? `new-${i}`} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_0.7fr_1fr_auto] sm:items-end">
                <Input label={variants.length > 1 ? 'Variant' : 'Variant name'} value={v.title} onChange={(e) => setVariant(i, { title: e.target.value })} placeholder="Medium / Red" />
                <Input label="Price (Rs)" inputMode="decimal" required value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} />
                <Input label="Original price" inputMode="decimal" value={v.compareAt} onChange={(e) => setVariant(i, { compareAt: e.target.value })} />
                <Input label="Stock" inputMode="numeric" required value={v.stock} onChange={(e) => setVariant(i, { stock: e.target.value })} />
                <Input label="SKU" value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={variants.length === 1}
                  aria-label={`Remove variant ${i + 1}`}
                  onClick={() => setVariants(variants.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Use variants for sizes or colours. "Original price" shows a crossed-out price next to the selling price.</p>
        </Card>
      </div>
    </form>
  );
}
