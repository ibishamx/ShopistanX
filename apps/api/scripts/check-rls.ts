/**
 * Refuses to pass if any table has a tenant_id column but is missing forced
 * row-level security or its tenant_isolation policy.
 */
import { PrismaClient } from '@prisma/client';
import { requireEnv } from './env';

export async function findUnprotectedTables(db: PrismaClient): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN pg_class cls ON cls.relname = c.table_name AND cls.relkind = 'r'
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace AND ns.nspname = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
      AND (
        NOT cls.relrowsecurity
        OR NOT cls.relforcerowsecurity
        OR NOT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = c.table_name
            AND p.policyname = 'tenant_isolation'
        )
      )
    ORDER BY 1`);
  return rows.map((r) => r.table_name);
}

/**
 * Tables whose tenant_id has no foreign key to tenants. Prisma does not know
 * about these hand-written constraints, so a generated migration may try to
 * drop them; this catches it.
 */
export async function findTablesWithoutTenantFk(db: PrismaClient): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        WHERE tc.table_schema = 'public' AND tc.table_name = c.table_name
          AND tc.constraint_type = 'FOREIGN KEY' AND tc.constraint_name = c.table_name || '_tenant_fk'
      )
    ORDER BY 1`);
  return rows.map((r) => r.table_name);
}

if (require.main === module) {
  const db = new PrismaClient({ datasourceUrl: requireEnv('DATABASE_URL') });
  Promise.all([findUnprotectedTables(db), findTablesWithoutTenantFk(db)])
    .then(async ([bad, noFk]) => {
      await db.$disconnect();
      if (bad.length) console.error(`Tables with tenant_id but no row-level security policy: ${bad.join(', ')}`);
      if (noFk.length) console.error(`Tables with tenant_id but no foreign key to tenants (a migration may have dropped it): ${noFk.join(', ')}`);
      if (bad.length || noFk.length) process.exit(1);
      console.log('RLS check passed: every tenant table is protected and tied to its tenant.');
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
