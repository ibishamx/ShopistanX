/**
 * Creates the two runtime database roles and their grants. Idempotent; run
 * after every migration (pnpm db:setup does this).
 *
 *  - app role:      no BYPASSRLS. Tenant tables are reachable only through the
 *                   row-level security policy. Limited access to platform
 *                   tables needed for signup, login and host lookup.
 *  - platform role: BYPASSRLS. Used only by Super Admin routes.
 */
import { PrismaClient } from '@prisma/client';
import { requireEnv } from './env';

const ident = (s: string) => '"' + s.replace(/"/g, '""') + '"';
const literal = (s: string) => "'" + s.replace(/'/g, "''") + "'";

async function main() {
  const owner = new PrismaClient({ datasourceUrl: requireEnv('DATABASE_URL') });
  const app = new URL(requireEnv('APP_DATABASE_URL'));
  const platform = new URL(requireEnv('PLATFORM_DATABASE_URL'));
  const run = (sql: string) => owner.$executeRawUnsafe(sql);

  const ensureRole = async (url: URL, options: string) => {
    const name = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const exists = await owner.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM pg_roles WHERE rolname = ${literal(name)}`,
    );
    await run(
      `${exists.length ? 'ALTER' : 'CREATE'} ROLE ${ident(name)} LOGIN ${options} PASSWORD ${literal(password)}`,
    );
    return ident(name);
  };

  const appRole = await ensureRole(app, 'NOSUPERUSER NOBYPASSRLS');
  const platformRole = await ensureRole(platform, 'NOSUPERUSER BYPASSRLS');

  await run(`GRANT USAGE ON SCHEMA public TO ${appRole}, ${platformRole}`);
  await run(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${appRole}, ${platformRole}`);

  // Platform role: everything except migrations bookkeeping.
  await run(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${platformRole}`);
  await run(`REVOKE ALL ON "_prisma_migrations" FROM ${platformRole}`);

  // App role: tenant tables (guarded by RLS)…
  const tenantTables = await owner.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'tenant_id'`,
  );
  for (const { table_name } of tenantTables) {
    await run(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${ident(table_name)} TO ${appRole}`);
  }
  // …plus the minimum of the platform tables needed for signup, login and
  // resolving a storefront host. No access to platform staff or the audit log.
  await run(`GRANT SELECT, INSERT ON tenants, domains, memberships TO ${appRole}`);
  await run(`GRANT SELECT, INSERT, UPDATE ON users TO ${appRole}`);
  await run(`GRANT UPDATE (name) ON tenants TO ${appRole}`);
  await run(`GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO ${appRole}`);

  await owner.$disconnect();
  console.log(`Roles ready: ${appRole} (RLS enforced), ${platformRole} (Super Admin)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
