'use client';

import { Button, Card, Input, Notice, PK_CITIES, Textarea, Toggle, api, inputClass, rs, toPaisa } from '@shopistan/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/page';
import { TagsInput } from '@/components/tags-input';
import { useApi } from '@/lib/use-api';

const CHANNELS: [string, string][] = [
  ['whatsapp', 'WhatsApp'],
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['tiktok', 'TikTok'],
  ['phone', 'Phone call'],
  ['walk_in', 'In person'],
  ['other', 'Other'],
];

interface Line {
  variantId: string;
  title: string;
  variantTitle: string;
  pricePaisa: number;
  quantity: number;
  max: number | null; // null: stock not tracked
}

const PK_MOBILE = /^(?:0092|92|0)?3\d{9}$/;

export default function NewOrderPage() {
  const router = useRouter();
  const { data: settings } = useApi('/admin/settings');
  const { data: whatsapp } = useApi('/admin/whatsapp');
  const { data: orderTags } = useApi<{ tag: string }[]>('/admin/orders/tags');
  const [channel, setChannel] = useState('whatsapp');
  const [c, setC] = useState({ phone: '', name: '', city: '', addressLine: '', landmark: '', email: '' });
  const [returning, setReturning] = useState<{ orders: number; delivered: number; returned: number } | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [customDelivery, setCustomDelivery] = useState(false);
  const [delivery, setDelivery] = useState('');
  const [discount, setDiscount] = useState('');
  const [confirmed, setConfirmed] = useState(true);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [note, setNote] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const { data: results } = useApi<any[]>(debounced ? `/admin/products?status=ACTIVE&q=${encodeURIComponent(debounced)}` : null);

  // Fill in a returning customer's details from their phone number.
  async function lookup() {
    const digits = c.phone.replace(/[^\d]/g, '');
    if (!PK_MOBILE.test(digits)) return setReturning(null);
    const found = await api(`/admin/customers/lookup?phone=${encodeURIComponent(c.phone)}`).catch(() => null);
    if (!found || !found.name) return setReturning(null);
    setReturning({ orders: found.orders, delivered: found.delivered, returned: found.returned });
    setC((prev) => ({
      ...prev,
      name: prev.name || found.name,
      city: prev.city || found.city || '',
      addressLine: prev.addressLine || found.addressLine || '',
      landmark: prev.landmark || found.landmark || '',
      email: prev.email || found.email || '',
    }));
  }

  const subtotal = lines.reduce((n, l) => n + l.pricePaisa * l.quantity, 0);
  const storeDelivery = useMemo(() => {
    if (!settings) return 0;
    const free = settings.freeShippingOverPaisa != null && subtotal >= settings.freeShippingOverPaisa;
    return free ? 0 : settings.shippingFeePaisa;
  }, [settings, subtotal]);
  const deliveryPaisa = customDelivery ? toPaisa(delivery || '0') : storeDelivery;
  const discountPaisa = discount.trim() ? toPaisa(discount) : 0;
  const total = subtotal + (deliveryPaisa ?? 0) - (discountPaisa ?? 0);
  const whatsappReady = whatsapp && whatsapp.status !== 'NOT_CONFIGURED';

  function add(product: any, variant: any) {
    setLines((ls) => {
      const existing = ls.find((l) => l.variantId === variant.id);
      const max = variant.trackInventory ? variant.stock : null;
      if (existing) return ls.map((l) => (l === existing ? { ...l, quantity: max == null ? l.quantity + 1 : Math.min(l.quantity + 1, max) } : l));
      return [...ls, { variantId: variant.id, title: product.title, variantTitle: variant.title, pricePaisa: variant.pricePaisa, quantity: 1, max }];
    });
  }
  const setQty = (id: string, q: number) => setLines((ls) => ls.flatMap((l) => (l.variantId !== id ? [l] : q <= 0 ? [] : [{ ...l, quantity: l.max == null ? Math.min(q, 500) : Math.min(q, l.max) }])));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!lines.length) return setError({ message: 'Add at least one product.' });
    if (deliveryPaisa == null) return setError({ message: 'Enter the delivery charge in rupees, e.g. 250.', field: 'shippingPaisa' });
    if (discountPaisa == null) return setError({ message: 'Enter the discount in rupees, e.g. 500.', field: 'discountPaisa' });
    if (total < 0) return setError({ message: 'The discount is more than the order total.', field: 'discountPaisa' });
    setBusy(true);
    try {
      const res = await api('/admin/orders', {
        body: {
          ...c,
          email: c.email.trim() || undefined,
          landmark: c.landmark.trim() || undefined,
          notes: customerNote.trim() || undefined,
          channel,
          items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          shippingPaisa: customDelivery ? deliveryPaisa : null,
          discountPaisa,
          alreadyConfirmed: confirmed,
          sendConfirmation: !confirmed && sendWhatsapp,
          merchantNote: note.trim() || undefined,
          tags,
        },
      });
      router.push(`/orders/${res.id}`);
    } catch (err: any) {
      setError({ message: err.message, field: err.field });
      setBusy(false);
    }
  }

  const fieldError = (f: string) => (error?.field === f ? error.message : null);
  const set = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setC({ ...c, [k]: e.target.value });

  return (
    <form onSubmit={submit}>
      <PageHeader title="Create order" back={{ href: '/orders', label: 'Orders' }} />
      <p className="-mt-3 mb-5 text-sm text-muted">For orders taken in a chat, on the phone or in person. Stock, order numbers and returns tracking work the same as store orders.</p>
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card title="Where did this order come from?">
            <div role="radiogroup" aria-label="Channel" className="flex flex-wrap gap-2">
              {CHANNELS.map(([value, label]) => (
                <label key={value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 ${channel === value ? 'border-brand-600 bg-brand-50 font-medium text-brand-700' : 'border-line hover:bg-canvas'}`}>
                  <input type="radio" name="channel" className="sr-only" checked={channel === value} onChange={() => setChannel(value)} />
                  {label}
                </label>
              ))}
            </div>
          </Card>

          <Card title="Products">
            <Input label="Find a product" type="search" placeholder="Search by name, SKU or tag" value={search} onChange={(e) => setSearch(e.target.value)} />
            {debounced && results && (
              <ul className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-line" aria-label="Search results">
                {results.length === 0 && <li className="px-3 py-2 text-sm text-muted">No active products found</li>}
                {results.flatMap((p) =>
                  p.variants.map((v: any) => {
                    const out = v.trackInventory && v.stock <= 0;
                    return (
                      <li key={v.id} className="flex items-center gap-3 border-b border-line px-3 py-2 text-sm last:border-0">
                        {p.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.images[0].url} alt="" className="h-9 w-9 rounded border border-line object-cover" />
                        ) : <span className="h-9 w-9 rounded border border-line bg-canvas" />}
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-1">{p.title}{v.title !== 'Default' && <span className="text-muted"> · {v.title}</span>}</span>
                          <span className="text-xs text-muted">{rs(v.pricePaisa)} · {v.trackInventory ? (out ? 'Out of stock' : `${v.stock} in stock`) : 'Stock not tracked'}</span>
                        </span>
                        <Button type="button" variant="secondary" disabled={out} onClick={() => add(p, v)} aria-label={`Add ${p.title}${v.title !== 'Default' ? ` ${v.title}` : ''}`}>Add</Button>
                      </li>
                    );
                  }),
                )}
              </ul>
            )}
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
              {lines.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No products yet. Search above to add them.</li>}
              {lines.map((l) => (
                <li key={l.variantId} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    {l.title}{l.variantTitle !== 'Default' && <span className="text-muted"> · {l.variantTitle}</span>}
                    <span className="block text-xs text-muted">{rs(l.pricePaisa)} each{l.max != null ? ` · ${l.max} in stock` : ''}</span>
                  </span>
                  <span className="inline-flex items-center rounded-lg border border-line">
                    <button type="button" className="grid h-8 w-8 cursor-pointer place-items-center" aria-label={`One less ${l.title}`} onClick={() => setQty(l.variantId, l.quantity - 1)}>−</button>
                    <span className="w-8 text-center tabular-nums" aria-live="polite">{l.quantity}</span>
                    <button type="button" className="grid h-8 w-8 cursor-pointer place-items-center disabled:opacity-30" aria-label={`One more ${l.title}`} disabled={l.max != null && l.quantity >= l.max} onClick={() => setQty(l.variantId, l.quantity + 1)}>+</button>
                  </span>
                  <span className="w-24 text-right tabular-nums">{rs(l.pricePaisa * l.quantity)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Customer">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Mobile number" type="tel" required placeholder="0300 1234567" value={c.phone} onChange={set('phone')} onBlur={lookup} error={fieldError('phone')} hint="Enter this first: a returning customer’s details fill in." />
              <Input label="Name" required value={c.name} onChange={set('name')} error={fieldError('name')} />
              {returning && (
                <div className="sm:col-span-2">
                  <Notice tone={returning.returned > 0 ? 'amber' : 'green'}>
                    Returning customer: {returning.orders} earlier order{returning.orders === 1 ? '' : 's'}, {returning.delivered} delivered, {returning.returned} returned. Details filled in from their last order.
                  </Notice>
                </div>
              )}
              <Input label="City" required list="pk-cities" value={c.city} onChange={set('city')} error={fieldError('city')} />
              <datalist id="pk-cities">{PK_CITIES.map((x) => <option key={x} value={x} />)}</datalist>
              <Input label="Nearby landmark" value={c.landmark} onChange={set('landmark')} />
              <div className="sm:col-span-2">
                <Textarea label="Delivery address" required rows={2} value={c.addressLine} onChange={set('addressLine')} error={fieldError('addressLine')} />
              </div>
              <Input label="Email (optional)" type="email" value={c.email} onChange={set('email')} />
              <Input label="Customer’s instructions (optional)" value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} hint="Shown on the order like a note from the customer" />
            </div>
          </Card>

          <Card title="Confirmation">
            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="radio" name="confirmed" className="mt-1 accent-brand-600" checked={confirmed} onChange={() => setConfirmed(true)} />
                <span><span className="block text-sm font-medium">The customer already confirmed in the chat</span><span className="block text-xs text-muted">The order is ready to ship straight away.</span></span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input type="radio" name="confirmed" className="mt-1 accent-brand-600" checked={!confirmed} onChange={() => setConfirmed(false)} />
                <span><span className="block text-sm font-medium">Not confirmed yet</span><span className="block text-xs text-muted">Send the customer the confirmation link from the order page, or a WhatsApp message. Your order rules apply.</span></span>
              </label>
              {!confirmed && (
                <div className="ml-7">
                  {whatsappReady ? (
                    <Toggle label="Send the WhatsApp confirmation message now" checked={sendWhatsapp} onChange={setSendWhatsapp} />
                  ) : (
                    <p className="text-xs text-muted">Connect WhatsApp Business in Settings → WhatsApp to send it automatically.</p>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card title="Tags and notes">
            <div className="space-y-4">
              <TagsInput placeholder="Eid, VIP" value={tags} onChange={setTags} suggestions={orderTags?.map((t) => t.tag) ?? []} />
              <Textarea label="Notes" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} hint="Only you and your staff see these." />
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card title="Summary">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{rs(subtotal)}</dd></div>
              <div>
                <div className="flex justify-between">
                  <dt className="text-muted">Delivery</dt>
                  <dd className="tabular-nums">{deliveryPaisa == null ? '—' : deliveryPaisa ? rs(deliveryPaisa) : 'Free'}</dd>
                </div>
                <label className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" className="accent-brand-600" checked={customDelivery} onChange={(e) => { setCustomDelivery(e.target.checked); if (e.target.checked && !delivery) setDelivery(String(storeDelivery / 100)); }} />
                  Set a different delivery charge
                </label>
                {customDelivery && <Input label="Delivery charge (Rs)" inputMode="decimal" value={delivery} onChange={(e) => setDelivery(e.target.value)} error={fieldError('shippingPaisa')} />}
              </div>
              <Input label="Discount (Rs)" inputMode="decimal" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} error={fieldError('discountPaisa')} />
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>To collect on delivery</dt><dd className="tabular-nums">{rs(Math.max(total, 0))}</dd></div>
            </dl>
            {error && !['phone', 'name', 'city', 'addressLine', 'shippingPaisa', 'discountPaisa'].includes(error.field ?? '') && <div className="mt-4"><Notice>{error.message}</Notice></div>}
            <Button type="submit" busy={busy} className="mt-4 w-full">Create order</Button>
          </Card>
        </div>
      </div>
    </form>
  );
}
