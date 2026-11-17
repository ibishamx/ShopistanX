'use client';

import { Button, Input, Notice, api } from '@shopistan/ui';
import Link from 'next/link';
import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/login', { body: { email, password } });
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-xl font-semibold">Sign in to your store</h1>
      {error && <Notice>{error}</Notice>}
      <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <Button type="submit" busy={busy} className="w-full">Sign in</Button>
      <p className="text-center text-sm text-muted">
        New to Shopistan? <Link href="/signup" className="font-medium text-brand-700 hover:underline">Create a store</Link>
      </p>
    </form>
  );
}
