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

if (require.main === module) {
  const db = new PrismaClient({ datasourceUrl: requireEnv('DATABASE_URL') });
  findUnprotectedTables(db)
    .then(async (bad) => {
      await db.$disconnect();
      if (bad.length) {
        console.error(`Tables with tenant_id but no row-level security policy: ${bad.join(', ')}`);
        process.exit(1);
      }
      console.log('RLS check passed: every tenant table is protected.');
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
