import { config } from 'dotenv';
import { resolve } from 'path';

// Tests run against a separate database: same server and roles, "<name>_test".
config({ path: resolve(__dirname, '../../../.env') });

export function toTestUrl(url: string): string {
  const u = new URL(url);
  if (!u.pathname.endsWith('_test')) u.pathname += '_test';
  return u.toString();
}

for (const name of ['DATABASE_URL', 'APP_DATABASE_URL', 'PLATFORM_DATABASE_URL']) {
  process.env[name] = toTestUrl(process.env[name]!);
}
process.env.STOREFRONT_ROOT_DOMAIN = 'shopistan.test';
process.env.STOREFRONT_PORT = '';
process.env.WHATSAPP_GRAPH_URL = 'https://graph.example';
