/** Creates (or resets the password of) the first Super Admin from the environment. */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/crypto';
import { requireEnv } from './env';

async function main() {
  const db = new PrismaClient({ datasourceUrl: requireEnv('PLATFORM_DATABASE_URL') });
  const email = requireEnv('PLATFORM_ADMIN_EMAIL').toLowerCase();
  const passwordHash = hashPassword(requireEnv('PLATFORM_ADMIN_PASSWORD'));
  await db.platformAdmin.upsert({
    where: { email },
    create: { email, name: 'Super Admin', passwordHash },
    update: { passwordHash },
  });
  await db.$disconnect();
  console.log(`Super Admin ready: ${email}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
