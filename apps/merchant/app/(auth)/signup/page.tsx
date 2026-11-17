'use client';

import { Button, Input, Notice, api } from '@shopistan/ui';
import Link from 'next/link';
import { useState } from 'react';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export default function SignupPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', storeName: '', slug: '' });
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const slug = slugEdited ? form.slug : slugify(form.storeName);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  const fieldError = (field: string) => (error?.field === field ? error.message : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/register', { body: { ...form, slug } });
      window.location.href = '/';
    } catch (err: any) {
      setError({ message: err.message, field: err.field });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Create your store</h1>
        <p className="mt-1 text-sm text-muted">Your store goes live on its own address as soon as you sign up.</p>
      </div>
      {error && !error.field && <Notice>{error.message}</Notice>}
      <Input label="Your name" autoComplete="name" required value={form.name} onChange={set('name')} error={fieldError('name')} />
      <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={fieldError('email')} />
      <Input label="Password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters" value={form.password} onChange={set('password')} error={fieldError('password')} />
      <Input label="Store name" required value={form.storeName} onChange={set('storeName')} error={fieldError('storeName')} placeholder="Khaadi Corner" />
      <Input
        label="Store address"
        required
        value={slug}
        onChange={(e) => {
          setSlugEdited(true);
          setForm({ ...form, slug: slugify(e.target.value) });
        }}
        error={fieldError('slug')}
        hint={slug ? `Your store will open at ${slug}.shopistan.pk` : 'Letters, numbers and dashes'}
      />
      <Button type="submit" busy={busy} className="w-full">Create store</Button>
      <p className="text-center text-sm text-muted">
        Already have a store? <Link href="/login" className="font-medium text-brand-700 hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
