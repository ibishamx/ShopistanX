'use client';

import { Button, Card, Input, Notice, fromPaisa, pkPhone, toPaisa } from '@shopistan/ui';
import { useEffect, useState } from 'react';
import { LoadError, Loading, PageHeader } from '@/components/page';
import { useSettings } from '@/lib/use-settings';

export default function SettingsPage() {
  const s = useSettings();
  const [money, setMoney] = useState({ fee: '', free: '' });
  const [phones, setPhones] = useState({ whatsapp: '', support: '' });
  const [localError, setLocalError] = useState<string | null>(null);
  const loaded = !!s.draft;

  useEffect(() => {
    if (!s.draft) return;
    setMoney({ fee: fromPaisa(s.draft.shippingFeePaisa), free: fromPaisa(s.draft.freeShippingOverPaisa) });
    setPhones({ whatsapp: s.draft.whatsappNumber ? pkPhone(s.draft.whatsappNumber) : '', support: s.draft.supportPhone ?? '' });
    // Only when settings first load or are saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, s.saved]);

  if (s.loading) return <Loading />;
  if (s.error || !s.draft) return <LoadError error={s.error!} />;
  const { draft } = s;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const shippingFeePaisa = toPaisa(money.fee);
    if (shippingFeePaisa == null) return setLocalError('Enter the delivery charge in rupees, e.g. 250. Use 0 for free delivery.');
    const freeShippingOverPaisa = money.free.trim() ? toPaisa(money.free) : null;
    if (money.free.trim() && freeShippingOverPaisa == null) return setLocalError('The free delivery amount is not a valid number.');
    s.save({ shippingFeePaisa, freeShippingOverPaisa, whatsappNumber: phones.whatsapp.trim() || null, supportPhone: phones.support.trim() || null });
  }

  return (
    <form onSubmit={submit}>
      <PageHeader title="Store settings">
        <Button type="submit" busy={s.busy}>Save</Button>
      </PageHeader>
      <div className="space-y-5">
        {(localError || (s.saveError && !s.saveError.field)) && <Notice>{localError ?? s.saveError!.message}</Notice>}
        {s.saved && <Notice tone="green">Settings saved.</Notice>}
        <Card title="Store">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Store name" required value={draft.storeName} onChange={(e) => s.update({ storeName: e.target.value })} />
            <Input label="Support phone" value={phones.support} onChange={(e) => setPhones({ ...phones, support: e.target.value })} hint="Shown in your store footer" />
            <Input
              label="Store WhatsApp number"
              type="tel"
              placeholder="0300 1234567"
              value={phones.whatsapp}
              onChange={(e) => setPhones({ ...phones, whatsapp: e.target.value })}
              error={s.saveError?.field === 'whatsappNumber' ? s.saveError.message : null}
              hint="Customers tap “Confirm on WhatsApp” after ordering to message this number"
            />
          </div>
        </Card>
        <Card title="Delivery charges">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Delivery charge (Rs)" inputMode="decimal" required value={money.fee} onChange={(e) => setMoney({ ...money, fee: e.target.value })} />
            <Input label="Free delivery on orders over (Rs)" inputMode="decimal" value={money.free} onChange={(e) => setMoney({ ...money, free: e.target.value })} hint="Leave empty to always charge delivery" />
          </div>
        </Card>
      </div>
    </form>
  );
}
