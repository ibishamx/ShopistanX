import { Logo } from '@shopistan/ui';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Logo className="mb-6 text-lg" />
        <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">{children}</div>
      </div>
    </main>
  );
}
