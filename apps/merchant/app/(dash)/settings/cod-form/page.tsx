'use client';

import { Button, Card, CodOrderForm, Input, Notice, Toggle } from '@shopistan/ui';
import { LoadError, Loading, PageHeader } from '@/components/page';
import { useSettings } from '@/lib/use-settings';

export default function CodFormSettingsPage() {
  const s = useSettings();
  if (s.loading) return <Loading />;
  if (s.error || !s.draft) return <LoadError error={s.error!} />;
  const form = s.draft.codForm;
  const set = (patch: object) => s.update({ codForm: { ...form, ...patch } });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        s.save();
      }}
    >
      <PageHeader title="COD form">
        <Button type="submit" busy={s.busy}>Save</Button>
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          {s.saveError && <Notice>{s.saveError.message}</Notice>}
          {s.saved && <Notice tone="green">COD form saved. Your store is updated.</Notice>}
          <Card title="Where it appears">
            <Toggle
              label="Show the order form on product pages"
              hint="Customers order in one step without going through the cart. The cart checkout always uses this form."
              checked={form.enabled}
              onChange={(enabled) => set({ enabled })}
            />
          </Card>
          <Card title="Wording">
            <div className="space-y-4">
              <Input label="Heading" required maxLength={80} value={form.headline} onChange={(e) => set({ headline: e.target.value })} />
              <Input label="Line under the heading" maxLength={160} value={form.subheadline} onChange={(e) => set({ subheadline: e.target.value })} />
              <Input label="Button text" required maxLength={40} value={form.buttonText} onChange={(e) => set({ buttonText: e.target.value })} hint="The order total is added after it" />
            </div>
          </Card>
          <Card title="Fields">
            <div className="space-y-4">
              <p className="text-sm text-muted">Name, mobile number, city and address are always asked.</p>
              <Toggle label="Ask for email (optional field)" checked={form.showEmail} onChange={(showEmail) => set({ showEmail })} />
              <Toggle label="Allow order notes" checked={form.showNotes} onChange={(showNotes) => set({ showNotes })} />
            </div>
          </Card>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Preview with a Rs 2,500 product</p>
          <div style={{ ['--accent' as any]: s.draft.theme.accentColor }}>
            <CodOrderForm
              preview
              config={form}
              subtotalPaisa={250_000}
              shippingFeePaisa={s.draft.shippingFeePaisa}
              freeShippingOverPaisa={s.draft.freeShippingOverPaisa}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
