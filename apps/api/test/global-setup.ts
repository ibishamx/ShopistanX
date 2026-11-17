import { execSync } from 'child_process';
import { resolve } from 'path';
import './setup-env';

/** Applies migrations, roles and the RLS check to the test database before any test runs. */
export default function globalSetup() {
  const cwd = resolve(__dirname, '..');
  const run = (cmd: string) => execSync(cmd, { cwd, env: process.env, stdio: 'pipe' });
  run('pnpm exec prisma migrate deploy');
  run('pnpm exec tsx scripts/setup-roles.ts');
  run('pnpm exec tsx scripts/check-rls.ts');
}
