'use client';

import * as React from 'react';
import { ApiError } from './api';
import { Button, Input, Notice, Textarea } from './components';
import { rs } from './format';

export interface CodFormConfig {
  enabled: boolean;
  headline: string;
  subheadline: string;
  buttonText: string;
  showEmail: boolean;
  showNotes: boolean;
}

export interface CodFormValues {
  name: string;
  phone: string;
  city: string;
  addressLine: string;
  email: string;
  notes: string;
}

export const PK_CITIES = [
  'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Gujranwala', 'Sialkot',
  'Hyderabad', 'Bahawalpur', 'Sargodha', 'Sukkur', 'Abbottabad', 'Gujrat', 'Sahiwal', 'Mardan', 'Rahim Yar Khan', 'Sheikhupura',
  'Jhelum', 'Okara', 'Kasur', 'Dera Ghazi Khan', 'Larkana', 'Mirpur', 'Muzaffarabad', 'Wah Cantt', 'Mingora', 'Nawabshah',
];

const PK_MOBILE = /^(?:0092|92|0)?3\d{9}$/;
const EMPTY: CodFormValues = { name: '', phone: '', city: '', addressLine: '', email: '', notes: '' };

/**
 * The Cash on Delivery order form. Used on product pages and the cart, and as
 * the live preview in Merchant Admin (with `preview`).
 */
export function CodOrderForm({
  config,
  subtotalPaisa,
  shippingFeePaisa,
  freeShippingOverPaisa,
  disabledReason,
  preview,
  onSubmit,
}: {
  config: CodFormConfig;
  subtotalPaisa: number;
  shippingFeePaisa: number;
  freeShippingOverPaisa: number | null;
  /** When set, the button is disabled and this explains why (e.g. "Out of stock"). */
  disabledReason?: string | null;
  preview?: boolean;
  onSubmit?: (values: CodFormValues) => Promise<void>;
}) {
  const [values, setValues] = React.useState<CodFormValues>(EMPTY);
  const [errors, setErrors] = React.useState<Partial<Record<keyof CodFormValues, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();

  const freeShipping = freeShippingOverPaisa != null && subtotalPaisa >= freeShippingOverPaisa;
  const shippingPaisa = freeShipping ? 0 : shippingFeePaisa;
  const totalPaisa = subtotalPaisa + shippingPaisa;

  const set = (key: keyof CodFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
  };

  function validate(): boolean {
    const next: typeof errors = {};
    if (values.name.trim().length < 2) next.name = 'Enter your full name';
    if (!PK_MOBILE.test(values.phone.replace(/[^\d]/g, ''))) next.phone = 'Enter a valid mobile number, e.g. 0300 1234567';
    if (values.city.trim().length < 2) next.city = 'Enter your city';
    if (values.addressLine.trim().length < 8) next.addressLine = 'Enter your complete address with house and street';
    if (config.showEmail && values.email && !/^\S+@\S+\.\S+$/.test(values.email)) next.email = 'Enter a valid email or leave it empty';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preview || !onSubmit) return;
    setFormError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      await onSubmit(values);
    } catch (err) {
      const field = err instanceof ApiError ? (err.field as keyof CodFormValues | undefined) : undefined;
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      if (field && field in EMPTY) setErrors({ [field]: message });
      else setFormError(message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate data-cod-form className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-lg font-semibold tracking-tight">{config.headline}</h2>
      {config.subheadline && <p className="mt-1 text-sm text-muted">{config.subheadline}</p>}

      <dl className="mt-4 space-y-1 rounded-xl bg-canvas p-3 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{rs(subtotalPaisa)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums">{shippingPaisa ? rs(shippingPaisa) : 'Free'}</dd></div>
        <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Pay on delivery</dt><dd className="tabular-nums">{rs(totalPaisa)}</dd></div>
      </dl>

      <div className="mt-4 space-y-3">
        <Input label="Full name" autoComplete="name" value={values.name} onChange={set('name')} error={errors.name} />
        <Input label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="0300 1234567" value={values.phone} onChange={set('phone')} error={errors.phone} hint="We will confirm your order on this number" />
        <Input label="City" list={`${id}-cities`} autoComplete="address-level2" value={values.city} onChange={set('city')} error={errors.city} />
        <datalist id={`${id}-cities`}>
          {PK_CITIES.map((c) => <option key={c} value={c} />)}
        </datalist>
        <Textarea label="Complete address" rows={2} autoComplete="street-address" placeholder="House, street, area" value={values.addressLine} onChange={set('addressLine')} error={errors.addressLine} />
        {config.showEmail && <Input label="Email (optional)" type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} />}
        {config.showNotes && <Textarea label="Order notes (optional)" rows={2} value={values.notes} onChange={set('notes')} />}
      </div>

      {formError && <div className="mt-4"><Notice>{formError}</Notice></div>}

      <Button
        type="submit"
        busy={busy}
        disabled={!!disabledReason}
        className="mt-4 w-full !py-3 !text-base"
        style={{ background: 'var(--accent, var(--color-brand-600))' }}
      >
        {disabledReason ?? `${config.buttonText} · ${rs(totalPaisa)}`}
      </Button>
      <p className="mt-2 text-center text-xs text-muted">Cash on Delivery. No advance payment needed.</p>
    </form>
  );
}
