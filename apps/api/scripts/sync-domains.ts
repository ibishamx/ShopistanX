/**
 * Gives every store an address on the current STOREFRONT_ROOT_DOMAIN, so
 * moving the platform to a new domain keeps existing stores reachable.
 * Old addresses are left in place. Idempotent; runs in the setup step.
 */
import { PrismaClient } from '@prisma/client';
import { requireEnv } from './env';

async function main() {
  const root = (process.env.STOREFRONT_ROOT_DOMAIN || '').trim().toLowerCase();
  if (!root) {
    console.log('STOREFRONT_ROOT_DOMAIN not set; store addresses unchanged.');
    return;
  }
  const db = new PrismaClient({ datasourceUrl: requireEnv('PLATFORM_DATABASE_URL') });
  const tenants = await db.tenant.findMany({ select: { id: true, slug: true } });
  const { count } = await db.domain.createMany({
    data: tenants.map((t) => ({ hostname: `${t.slug}.${root}`, tenantId: t.id, type: 'SUBDOMAIN' as const, verified: true })),
    skipDuplicates: true,
  });
  await db.$disconnect();
  console.log(`Store addresses on ${root}: ${count} added, ${tenants.length - count} already present.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
