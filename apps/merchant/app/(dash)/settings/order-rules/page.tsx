'use client';

import { Button, Card, Input, Notice, Toggle, fromPaisa, toPaisa } from '@shopistan/ui';
import { useEffect, useState } from 'react';
import { LoadError, Loading, PageHeader } from '@/components/page';
import { useSettings } from '@/lib/use-settings';

export default function OrderRulesPage() {
  const s = useSettings();
  const [limit, setLimit] = useState('');
  const [limitOn, setLimitOn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const loaded = !!s.draft;

  useEffect(() => {
    if (!s.draft) return;
    const value = s.draft.orderRules.holdNewOverPaisa;
    setLimitOn(value != null);
    setLimit(value != null ? fromPaisa(value) : '10000');
    // Only when settings first load or are saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, s.saved]);

  if (s.loading) return <Loading />;
  if (s.error || !s.draft) return <LoadError error={s.error!} />;
  const rules = s.draft.orderRules;
  const set = (patch: object) => s.update({ orderRules: { ...rules, ...patch } });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    let holdNewOverPaisa: number | null = null;
    if (limitOn) {
      holdNewOverPaisa = toPaisa(limit);
      if (holdNewOverPaisa == null) return setLocalError('Enter the order amount in rupees, e.g. 10000');
    }
    s.save({ orderRules: { ...rules, holdNewOverPaisa } });
  }

  return (
    <form onSubmit={submit}>
      <PageHeader title="Order rules">
        <Button type="submit" busy={s.busy}>Save</Button>
      </PageHeader>
      <div className="space-y-5">
        {(localError || s.saveError) && <Notice>{localError ?? s.saveError!.message}</Notice>}
        {s.saved && <Notice tone="green">Order rules saved. They apply to new orders.</Notice>}

        <Card title="How customers are scored">
          <p className="text-sm text-muted">
            Every COD order is checked against the customer’s mobile number across all Shopistan stores: how many parcels they
            accepted and how many they refused. You see totals only; other stores are never named, and other stores never see your orders.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li><strong>High return risk:</strong> refused 2 or more parcels, and refused at least as many as they accepted.</li>
            <li><strong>Trusted:</strong> accepted 2 or more parcels and refused no more than 1 in 10.</li>
            <li><strong>New:</strong> no delivered or returned parcels on Shopistan yet.</li>
          </ul>
        </Card>

        <Card title="Rules">
          <div className="space-y-5">
            <Toggle
              label="Hold orders from high-risk customers"
              hint="The order waits for you instead of going ahead when the customer confirms. Call them first, or ask for the delivery charge in advance."
              checked={rules.holdRisky}
              onChange={(holdRisky) => set({ holdRisky })}
            />
            <div>
              <Toggle
                label="Hold large first orders"
                hint="New customers with an order at or above this amount are held for a call."
                checked={limitOn}
                onChange={setLimitOn}
              />
              {limitOn && (
                <div className="ml-7 mt-3 max-w-56">
                  <Input label="Order amount (Rs)" inputMode="decimal" required value={limit} onChange={(e) => setLimit(e.target.value)} />
                </div>
              )}
            </div>
            <Toggle
              label="Confirm trusted customers automatically"
              hint="Orders from customers with a clean delivery record are confirmed straight away and skip the confirmation message."
              checked={rules.autoConfirmTrusted}
              onChange={(autoConfirmTrusted) => set({ autoConfirmTrusted })}
            />
          </div>
        </Card>
        <p className="text-xs text-muted">Asking for an advance payment or deposit automatically will be added with JazzCash and Easypaisa.</p>
      </div>
    </form>
  );
}
