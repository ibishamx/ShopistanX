'use client';

import { Button, Input, Logo, Notice, api } from '@shopistan/ui';
import { useState } from 'react';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/platform/auth/login', { body: { email, password } });
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-white p-6">
        <Logo />
        <h1 className="text-lg font-semibold">Platform staff sign in</h1>
        {error && <Notice>{error}</Notice>}
        <Input label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" busy={busy} className="w-full">Sign in</Button>
      </form>
    </main>
  );
}
