import { PrismaClient } from '@prisma/client';
import './setup-env';

// TRUNCATE skips row triggers, so the append-only audit log can be cleared here.
async function main() {
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
