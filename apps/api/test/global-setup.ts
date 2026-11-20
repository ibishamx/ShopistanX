import { execSync } from 'child_process';
import { resolve } from 'path';
import './setup-env';

/**
 * Prepares the test database before any test runs: migrations, roles, the
 * RLS check, then empties every table. Data must not carry over between runs,
 * because the shared risk score reads every store's history for a phone number.
 */
export default function globalSetup() {
  const cwd = resolve(__dirname, '..');
  const run = (cmd: string) => execSync(cmd, { cwd, env: process.env, stdio: 'pipe' });
  if (!/_test(\?|$)/.test(new URL(process.env.DATABASE_URL!).pathname + '?')) {
    throw new Error('Refusing to empty a database whose name does not end in _test');
  }
  run('pnpm exec prisma migrate deploy');
  run('pnpm exec tsx scripts/setup-roles.ts');
  run('pnpm exec tsx scripts/check-rls.ts');
  run('pnpm exec tsx test/truncate.ts');
}
