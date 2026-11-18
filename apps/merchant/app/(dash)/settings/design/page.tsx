'use client';

import { Button, Card, Field, Input, Notice, Textarea, Toggle, inputClass } from '@shopistan/ui';
import { useEffect, useState } from 'react';
import { LoadError, Loading, PageHeader } from '@/components/page';
import { useApi } from '@/lib/use-api';
import { useSettings } from '@/lib/use-settings';

const ICONS = [
  ['truck', 'Delivery truck'],
  ['cash', 'Cash / card'],
  ['return', 'Returns'],
  ['shield', 'Shield (quality)'],
  ['whatsapp', 'WhatsApp'],
  ['box', 'Parcel'],
] as const;

type Trust = { icon: string; title: string; text: string };
type Faq = { question: string; answer: string };

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

function Lines({ label, hint, value, onChange, rows = 3 }: { label: string; hint: string; value: string[]; onChange: (v: string[]) => void; rows?: number }) {
  // Keep the raw text while typing so blank lines and trailing spaces are not eaten.
  const [text, setText] = useState(value.join('\n'));
  useEffect(() => {
    if (lines(text).join('\n') !== value.join('\n')) setText(value.join('\n'));
    // Only resync when the saved value changes from outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.join('\n')]);
  return (
    <Textarea
      label={label}
      hint={hint}
      rows={rows}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(lines(e.target.value));
      }}
    />
  );
}

export default function DesignPage() {
  const s = useSettings();
  const { data: me } = useApi('/auth/me');
  if (s.loading) return <Loading />;
  if (s.error || !s.draft) return <LoadError error={s.error!} />;
  const theme = s.draft.theme;
  const set = (patch: object) => s.update({ theme: { ...theme, ...patch } });
  const fieldError = (field: string) => (s.saveError?.field === `theme.${field}` || s.saveError?.field?.startsWith(`theme.${field}.`) ? s.saveError.message : null);

  const trust: Trust[] = theme.trustItems;
  const setTrust = (i: number, patch: Partial<Trust>) => set({ trustItems: trust.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const faq: Faq[] = theme.faq;
  const setFaq = (i: number, patch: Partial<Faq>) => set({ faq: faq.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        s.save();
      }}
    >
      <PageHeader title="Storefront design">
        {me?.store.url && (
          <a href={me.store.url} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-canvas">View store ↗</a>
        )}
        <Button type="submit" busy={s.busy}>Save</Button>
      </PageHeader>
      <div className="space-y-5">
        {s.saveError && <Notice>{s.saveError.message}</Notice>}
        {s.saved && <Notice tone="green">Design saved. Your store is updated.</Notice>}

        <Card title="Brand">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Logo image link" type="url" placeholder="https://…/logo.png" value={theme.logoUrl} onChange={(e) => set({ logoUrl: e.target.value })} error={fieldError('logoUrl')} hint="Leave empty to show your store name in the header" />
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Button colour</span>
              <span className="flex items-center gap-2">
                <input type="color" value={theme.accentColor} onChange={(e) => set({ accentColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-line bg-white" />
                <span className="text-sm text-muted">{theme.accentColor}</span>
              </span>
            </label>
          </div>
        </Card>

        <Card title="Announcement bar">
          <Lines label="Messages" hint="One per line. They scroll across the top of every page. Leave empty to hide the bar." value={theme.announcements} onChange={(announcements) => set({ announcements })} />
          {fieldError('announcements') && <p className="mt-1 text-xs text-red-700">{fieldError('announcements')}</p>}
        </Card>

        <Card title="Homepage banner">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Banner image link" type="url" placeholder="https://…/banner.jpg" value={theme.heroImageUrl} onChange={(e) => set({ heroImageUrl: e.target.value })} error={fieldError('heroImageUrl')} hint="A wide photo works best. Without one, a warm colour background is used." />
            </div>
            <Input label="Heading" required maxLength={80} value={theme.heroHeading} onChange={(e) => set({ heroHeading: e.target.value })} error={fieldError('heroHeading')} />
            <Input label="Button text" required maxLength={30} value={theme.heroButtonText} onChange={(e) => set({ heroButtonText: e.target.value })} error={fieldError('heroButtonText')} />
            <div className="sm:col-span-2">
              <Input label="Text under the heading" maxLength={200} value={theme.heroSubheading} onChange={(e) => set({ heroSubheading: e.target.value })} />
            </div>
          </div>
        </Card>

        <Card title="Runway">
          <div className="space-y-4">
            <Toggle label="Show the runway on the homepage" hint="Your product photos walk down a runway one after another, with a Shop now button. Uses the first 8 products that have a photo." checked={theme.showRunway} onChange={(showRunway) => set({ showRunway })} />
            {theme.showRunway && <Input label="Runway heading" maxLength={60} value={theme.runwayHeading} onChange={(e) => set({ runwayHeading: e.target.value })} />}
          </div>
        </Card>

        <Card title="Scrolling highlights">
          <div className="grid gap-4 sm:grid-cols-2">
            <Lines label="Large words" hint="One per line, shown big in the first row" value={theme.marqueeLarge} onChange={(marqueeLarge) => set({ marqueeLarge })} />
            <Lines label="Small text" hint="One per line, shown in the second row" value={theme.marqueeSmall} onChange={(marqueeSmall) => set({ marqueeSmall })} />
          </div>
          <p className="mt-2 text-xs text-muted">Leave both empty to hide this band.</p>
        </Card>

        <Card
          title="Trust badges"
          action={trust.length < 4 && <Button type="button" variant="secondary" onClick={() => set({ trustItems: [...trust, { icon: 'shield', title: '', text: '' }] })}>Add badge</Button>}
        >
          <p className="mb-4 text-sm text-muted">Shown on the homepage and under the order form. Only promise what your store really offers.</p>
          {trust.length === 0 && <p className="text-sm text-muted">No badges. The section is hidden.</p>}
          <div className="space-y-4">
            {trust.map((t, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-[170px_1fr_1.3fr_auto] sm:items-end">
                <Field label="Icon">
                  <select className={inputClass} value={t.icon} onChange={(e) => setTrust(i, { icon: e.target.value })}>
                    {ICONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Input label="Title" required maxLength={40} value={t.title} onChange={(e) => setTrust(i, { title: e.target.value })} />
                <Input label="Short text" maxLength={80} value={t.text} onChange={(e) => setTrust(i, { text: e.target.value })} />
                <Button type="button" variant="ghost" aria-label={`Remove badge ${i + 1}`} onClick={() => set({ trustItems: trust.filter((_, j) => j !== i) })}>Remove</Button>
              </div>
            ))}
          </div>
          {fieldError('trustItems') && <p className="mt-2 text-xs text-red-700">{fieldError('trustItems')}</p>}
        </Card>

        <Card title="Product page">
          <Input label="Delivery time" maxLength={80} placeholder="Delivery in 2–4 working days" value={theme.deliveryEstimate} onChange={(e) => set({ deliveryEstimate: e.target.value })} hint="Shown under the order form. Leave empty to hide." />
        </Card>

        <Card
          title="Questions and answers"
          action={faq.length < 12 && <Button type="button" variant="secondary" onClick={() => set({ faq: [...faq, { question: '', answer: '' }] })}>Add question</Button>}
        >
          {faq.length === 0 && <p className="text-sm text-muted">No questions. The section is hidden.</p>}
          <div className="space-y-5">
            {faq.map((f, i) => (
              <div key={i} className="space-y-2 border-b border-line pb-5 last:border-0 last:pb-0">
                <Input label={`Question ${i + 1}`} required maxLength={160} value={f.question} onChange={(e) => setFaq(i, { question: e.target.value })} />
                <Textarea label="Answer" required rows={2} maxLength={1000} value={f.answer} onChange={(e) => setFaq(i, { answer: e.target.value })} />
                <Button type="button" variant="ghost" onClick={() => set({ faq: faq.filter((_, j) => j !== i) })}>Remove question</Button>
              </div>
            ))}
          </div>
          {fieldError('faq') && <p className="mt-2 text-xs text-red-700">{fieldError('faq')}</p>}
        </Card>

        <Card title="Footer">
          <Textarea label="About your store" rows={3} maxLength={400} value={theme.footerText} onChange={(e) => set({ footerText: e.target.value })} hint="A sentence or two about your store, shown at the bottom of every page." />
        </Card>
      </div>
    </form>
  );
}
