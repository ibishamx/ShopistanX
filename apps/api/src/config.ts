import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

loadEnv({ path: resolve(__dirname, '../../../.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const env = (name: string, fallback: string) => process.env[name] || fallback;

export const config = {
  port: Number(env('API_PORT', '4000')),
  appDatabaseUrl: required('APP_DATABASE_URL'),
  platformDatabaseUrl: required('PLATFORM_DATABASE_URL'),
  encryptionKey: required('ENCRYPTION_KEY'),
  cookieSecure: env('COOKIE_SECURE', 'false') === 'true',
  storefrontRootDomain: env('STOREFRONT_ROOT_DOMAIN', 'localhost'),
  storefrontProtocol: env('STOREFRONT_PROTOCOL', 'http'),
  storefrontPort: env('STOREFRONT_PORT', ''),
  apiUrl: env('API_URL', 'http://localhost:4000'),
  whatsappGraphUrl: env('WHATSAPP_GRAPH_URL', 'https://graph.facebook.com'),
  whatsappGraphVersion: env('WHATSAPP_GRAPH_VERSION', 'v23.0'),
};

export function storefrontHostname(slug: string): string {
  return `${slug}.${config.storefrontRootDomain}`;
}

export function storefrontUrl(hostname: string): string {
  const port = config.storefrontPort ? `:${config.storefrontPort}` : '';
  return `${config.storefrontProtocol}://${hostname}${port}`;
}
