'use client';

import { Button, Card, Field, Input, Notice, Textarea, Toggle, api, inputClass, rs } from '@shopistan/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { PageHeader } from './page';

type Rule = { field: string; relation: string; value: string };

const FIELDS: [string, string][] = [['tag', 'Product tag'], ['type', 'Product type'], ['vendor', 'Vendor'], ['title', 'Product title'], ['price', 'Price'], ['compare_at_price', 'Original price']];
const TEXT: [string, string][] = [['equals', 'is equal to'], ['not_equals', 'is not equal to'], ['contains', 'contains'], ['not_contains', 'does not contain'], ['starts_with', 'starts with']];
const NUMBER: [string, string][] = [['less_than', 'is less than'], ['greater_than', 'is greater than'], ['equals', 'is equal to'], ['not_equals', 'is not equal to']];
const SORTS: [string, string][] = [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['price_asc', 'Price, low to high'], ['price_desc', 'Price, high to low'], ['title_asc', 'Title, A–Z'], ['manual', 'In the order I choose']];
const numeric = (f: string) => f === 'price' || f === 'compare_at_price';

function relationsFor(field: string): [string, string][] {
  if (field === 'compare_at_price') return [['is_set', 'is set (product is on sale)'], ...NUMBER];
  return numeric(field) ? NUMBER : TEXT;
}

export function CollectionForm({ collection }: { collection?: any }) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: collection?.title ?? '',
    handle: collection?.handle ?? '',
    description: collection?.description ?? '',
    imageUrl: collection?.imageUrl ?? '',
    kind: (collection?.kind ?? 'SMART') as 'SMART' | 'MANUAL',
    matchAll: collection?.matchAll ?? true,
    sortOrder: collection?.sortOrder ?? 'newest',
    published: collection?.published ?? true,
    showInMenu: collection?.showInMenu ?? false,
    menuPosition: String(collection?.menuPosition ?? 0),
    seoTitle: collection?.seoTitle ?? '',
    seoDescription: collection?.seoDescription ?? '',
  });
  const [rules, setRules] = useState<Rule[]>(collection?.rules?.length ? collection.rules : [{ field: 'tag', relation: 'equals', value: '' }]);
  const [picked, setPicked] = useState<{ id: string; title: string; image: string | null }[]>(
    collection?.kind === 'MANUAL' ? collection.products.map((p: any) => ({ id: p.id, title: p.title, image: p.image })) : [],
  );
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<{ count: number; sample: { id: string; title: string }[] } | null>(null);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const { data: facets } = useApi<{ types: string[]; vendors: string[]; tags: string[] }>('/admin/products/facets');
  const { data: results } = useApi<any[]>(form.kind === 'MANUAL' && search.trim() ? `/admin/products?q=${encodeURIComponent(search.trim())}` : null);

  const set = (patch: Partial<typeof form>) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...patch }));
  };
  const setRule = (i: number, patch: Partial<Rule>) => {
    setSaved(false);
    setRules((rs) => rs.map((r, j) => {
      if (j !== i) return r;
      const next = { ...r, ...patch };
      if (patch.field && patch.field !== r.field) {
        // Keep the condition only when moving between two text fields; otherwise
        // start from the new field's most common one (e.g. "is on sale").
        const keep = !numeric(patch.field) && !numeric(r.field);
        if (!keep || !relationsFor(patch.field).some(([k]) => k === next.relation)) next.relation = relationsFor(patch.field)[0][0];
      }
      if (next.relation === 'is_set') next.value = '';
      return next;
    }));
  };

  // Live count of products the rules would include.
  useEffect(() => {
    if (form.kind !== 'SMART') return;
    const complete = rules.filter((r) => r.relation === 'is_set' || r.value.trim());
    if (!complete.length || complete.length !== rules.length) return setPreview(null);
    const t = setTimeout(() => {
      api('/admin/collections/preview', { body: { rules, matchAll: form.matchAll } }).then(setPreview).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [rules, form.matchAll, form.kind]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy('save');
    const body = {
      ...form,
      handle: form.handle.trim() || undefined,
      imageUrl: form.imageUrl.trim() || null,
      menuPosition: Number(form.menuPosition) || 0,
      sortOrder: form.kind === 'SMART' && form.sortOrder === 'manual' ? 'newest' : form.sortOrder,
      rules: form.kind === 'SMART' ? rules : [],
      productIds: form.kind === 'MANUAL' ? picked.map((p) => p.id) : [],
      seoTitle: form.seoTitle.trim() || null,
      seoDescription: form.seoDescription.trim() || null,
    };
    try {
      if (collection) {
        await api(`/admin/collections/${collection.id}`, { method: 'PUT', body });
        setSaved(true);
      } else {
        const created = await api('/admin/collections', { body });
        router.push(`/collections/${created.id}`);
        return;
      }
    } catch (err: any) {
      setError({ message: err.message, field: err.field });
    }
    setBusy(null);
  }

  async function remove() {
    if (!window.confirm(`Delete the collection “${collection.title}”? Its products are not deleted.`)) return;
    setBusy('delete');
    await api(`/admin/collections/${collection.id}`, { method: 'DELETE' }).catch(() => {});
    router.push('/collections');
  }

  const move = (i: number, d: -1 | 1) => setPicked((list) => {
    const next = [...list];
    const j = i + d;
    if (j < 0 || j >= next.length) return list;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const suggestFor = (field: string) => (field === 'tag' ? facets?.tags : field === 'type' ? facets?.types : field === 'vendor' ? facets?.vendors : []) ?? [];

  return (
    <form onSubmit={save}>
      <PageHeader title={collection ? collection.title : 'Create collection'} back={{ href: '/collections', label: 'Collections' }}>
        {collection && <Button type="button" variant="danger" busy={busy === 'delete'} onClick={remove}>Delete</Button>}
        <Button type="submit" busy={busy === 'save'}>Save</Button>
      </PageHeader>
      <div className="space-y-5">
        {error && <Notice>{error.message}</Notice>}
        {saved && <Notice tone="green">Collection saved.</Notice>}
        <Card>
          <div className="space-y-4">
            <Input label="Title" required maxLength={255} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Winter Collection 2026" />
            <Textarea label="Description" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} hint="Shown at the top of the collection page" />
            <Input label="Image link" value={form.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} hint="Optional. Without one, the first product’s photo is used." />
          </div>
        </Card>

        <Card title="Products in this collection">
          {!collection && (
            <fieldset className="mb-5 grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Collection type</legend>
              {([
                ['SMART', 'Automatic', 'Products that match your conditions join and leave by themselves.'],
                ['MANUAL', 'Manual', 'You choose each product and its order.'],
              ] as const).map(([value, label, help]) => (
                <label key={value} className={`cursor-pointer rounded-lg border p-3 ${form.kind === value ? 'border-brand-600 bg-brand-50' : 'border-line'}`}>
                  <input type="radio" name="kind" className="mr-2 accent-brand-600" checked={form.kind === value} onChange={() => set({ kind: value })} />
                  <span className="text-sm font-medium">{label}</span>
                  <span className="mt-1 block text-xs text-muted">{help}</span>
                </label>
              ))}
            </fieldset>
          )}

          {form.kind === 'SMART' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>Products must match</span>
                <label className="flex items-center gap-1.5"><input type="radio" className="accent-brand-600" checked={form.matchAll} onChange={() => set({ matchAll: true })} /> all conditions</label>
                <label className="flex items-center gap-1.5"><input type="radio" className="accent-brand-600" checked={!form.matchAll} onChange={() => set({ matchAll: false })} /> any condition</label>
              </div>
              {rules.map((r, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.2fr_1fr_auto]">
                  <select aria-label={`Condition ${i + 1} field`} className={inputClass} value={r.field} onChange={(e) => setRule(i, { field: e.target.value })}>
                    {FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <select aria-label={`Condition ${i + 1} relation`} className={inputClass} value={r.relation} onChange={(e) => setRule(i, { relation: e.target.value })}>
                    {relationsFor(r.field).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  {r.relation === 'is_set' ? <span /> : (
                    <>
                      <input
                        aria-label={`Condition ${i + 1} value`}
                        className={inputClass}
                        list={`rule-${i}`}
                        inputMode={numeric(r.field) ? 'decimal' : undefined}
                        placeholder={numeric(r.field) ? 'Rs 3500' : 'Khaddar'}
                        value={r.value}
                        onChange={(e) => setRule(i, { value: e.target.value })}
                      />
                      <datalist id={`rule-${i}`}>{suggestFor(r.field).map((s) => <option key={s} value={s} />)}</datalist>
                    </>
                  )}
                  <Button type="button" variant="ghost" disabled={rules.length === 1} aria-label={`Remove condition ${i + 1}`} onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={() => setRules([...rules, { field: 'tag', relation: 'equals', value: '' }])}>Add condition</Button>
              {preview && (
                <p className="text-sm" aria-live="polite">
                  <strong>{preview.count} product{preview.count === 1 ? '' : 's'}</strong> match now{preview.sample.length ? `: ${preview.sample.slice(0, 4).map((p) => p.title).join(', ')}${preview.count > 4 ? '…' : ''}` : ''}.
                </p>
              )}
            </div>
          ) : (
            <div>
              <Input label="Add products" type="search" placeholder="Search by title, SKU or tag" value={search} onChange={(e) => setSearch(e.target.value)} />
              {search.trim() && results && (
                <ul className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-line">
                  {results.length === 0 && <li className="px-3 py-2 text-sm text-muted">No products found</li>}
                  {results.map((p) => {
                    const added = picked.some((x) => x.id === p.id);
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 text-sm last:border-0">
                        <span className="truncate">{p.title} <span className="text-muted">{rs(Math.min(...p.variants.map((v: any) => v.pricePaisa)))}</span></span>
                        <Button type="button" variant="secondary" disabled={added} onClick={() => setPicked([...picked, { id: p.id, title: p.title, image: p.images[0]?.url ?? null }])}>{added ? 'Added' : 'Add'}</Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <ol className="mt-4 divide-y divide-line rounded-lg border border-line">
                {picked.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No products yet. Search above to add them.</li>}
                {picked.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-6 text-right text-xs text-muted">{i + 1}</span>
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-9 w-9 rounded border border-line object-cover" />
                    ) : <span className="h-9 w-9 rounded border border-line bg-canvas" />}
                    <span className="min-w-0 flex-1 truncate">{p.title}</span>
                    <button type="button" aria-label={`Move ${p.title} up`} disabled={i === 0} className="cursor-pointer px-1 text-muted disabled:opacity-30" onClick={() => move(i, -1)}>↑</button>
                    <button type="button" aria-label={`Move ${p.title} down`} disabled={i === picked.length - 1} className="cursor-pointer px-1 text-muted disabled:opacity-30" onClick={() => move(i, 1)}>↓</button>
                    <button type="button" className="cursor-pointer text-xs text-muted underline hover:text-ink" onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}>Remove</button>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="mt-5 max-w-xs">
            <Field label="Sort products by">
              <select className={inputClass} value={form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })}>
                {SORTS.filter(([k]) => form.kind === 'MANUAL' || k !== 'manual').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="On your store">
          <div className="space-y-4">
            <Toggle label="Visible on the store" hint={form.handle ? `At /collections/${form.handle}` : 'A web address is made from the title'} checked={form.published} onChange={(published) => set({ published })} />
            <Toggle label="Show in the store’s menu" checked={form.showInMenu} onChange={(showInMenu) => set({ showInMenu })} />
            {form.showInMenu && (
              <div className="ml-7 max-w-40">
                <Input label="Menu position" inputMode="numeric" value={form.menuPosition} onChange={(e) => set({ menuPosition: e.target.value })} hint="Lower numbers come first" />
              </div>
            )}
            {collection && (
              <Input label="Web address" value={form.handle} onChange={(e) => set({ handle: e.target.value })} error={error?.field === 'handle' ? error.message : null} hint="Changing it breaks old links to this collection." />
            )}
          </div>
        </Card>

        <Card title="Search engine listing">
          <div className="space-y-4">
            <Input label="Page title" maxLength={120} value={form.seoTitle} onChange={(e) => set({ seoTitle: e.target.value })} hint="Leave empty to use the collection title" />
            <Textarea label="Meta description" rows={2} maxLength={320} value={form.seoDescription} onChange={(e) => set({ seoDescription: e.target.value })} />
          </div>
        </Card>
      </div>
    </form>
  );
}
