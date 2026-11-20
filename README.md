# Shopistan

A multi-tenant e-commerce platform for Pakistan, built around Cash on Delivery:
a one-step COD order form and WhatsApp order confirmation are part of the
platform, not paid add-ons.

See [PROGRESS.md](PROGRESS.md) for what is done, what is verified and what is
blocked, and [DEPLOY.md](DEPLOY.md) to put it on a server.

## Apps

| App | Path | Dev URL | What it is |
| --- | --- | --- | --- |
| API | `apps/api` | http://localhost:4000 | NestJS + Prisma + PostgreSQL. The only thing that touches the database. |
| Marketing site | `apps/web` | http://localhost:3000 | Landing page, links to signup. |
| Merchant Admin | `apps/merchant` | http://localhost:3001 | Signup, products, orders, customers, COD form and WhatsApp settings. |
| Storefront | `apps/storefront` | http://`<store>`.localhost:3002 | Serves every store; the store is chosen by hostname. |
| Super Admin | `apps/admin` | http://localhost:3003 | Platform staff: list, suspend and reactivate stores; audit log. |

`packages/ui` holds the shared components, including the COD order form used
by the storefront and by the live preview in Merchant Admin.

## Run it locally

Needs Node 22, pnpm 10 and PostgreSQL 16 (`docker compose up -d` starts one).

```bash
cp .env.example .env
```

Set `ENCRYPTION_KEY` (`openssl rand -hex 32`) and `PLATFORM_ADMIN_PASSWORD` in `.env`, then:

```bash
pnpm install
```

```bash
pnpm db:setup
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

`db:setup` applies migrations, creates the two runtime database roles and
checks that every tenant table has a row-level security policy. `db:seed`
creates the first Super Admin from `.env`.

Open http://localhost:3001/signup, create a store called for example `demo`,
add a product, then visit http://demo.localhost:3002.

## Tests

```bash
pnpm test
```

Runs against a separate `<database>_test` database on the same server (create
it once: `createdb shopistan_test`). The suites cover tenant isolation, the COD
order flow, WhatsApp confirmation (Meta's API is mocked) and Super Admin.

## Tenant isolation

- Every merchant-owned table has a non-null `tenant_id`, forced row-level
  security and a policy comparing it to the per-transaction setting
  `app.tenant_id`. Without the setting, queries fail instead of returning rows.
- The API uses two database roles. `shopistan_app` cannot bypass row-level
  security and has no access to staff tables or the audit log.
  `shopistan_platform` bypasses it and is used only by `/platform` routes.
- The tenant comes from the session (Merchant Admin) or the request host
  (storefront), never from an ID the client sends.
- Foreign keys between tenant tables are composite on `(tenant_id, id)`.
- `pnpm --filter @shopistan/api db:check-rls` fails if any table has
  `tenant_id` but no policy. It runs in `db:setup` and in the test suite.

## COD form

The form (name, mobile, city, address; optional email and notes) appears on
every product page and on the cart page. Merchants edit its wording and fields
under **COD form** in Merchant Admin with a live preview. Orders are created by
`POST /storefront/orders`; prices, delivery charge and totals are computed on
the server, and stock is reserved atomically so the last unit cannot be sold
twice.

## WhatsApp order confirmation

Two mechanisms; the first needs no credentials.

1. **Click-to-chat (`wa.me`).** After ordering, the shopper sees "Confirm on
   WhatsApp", which opens a chat with the store's WhatsApp number with the
   order details pre-written. On each order, the merchant gets "Message on
   WhatsApp", which opens a chat with the customer containing a confirmation
   link (`/orders/<token>`) where the customer can confirm or cancel.
2. **WhatsApp Business Cloud API** with the merchant's own Meta credentials
   (stored AES-256-GCM encrypted). When a COD order is placed, the platform
   sends an approved template with Confirm / Cancel quick-reply buttons.
   Replies arrive at `POST /webhooks/whatsapp/<tenantId>`, are checked against
   the merchant's app secret (`X-Hub-Signature-256`) and update the order. A
   typed "yes"/"no" also works. The integration shows **Verified** only after
   Meta has accepted a real send.

The template to create in WhatsApp Manager is shown on the WhatsApp settings
page: four body variables (customer name, order number, store name, total) and
two quick-reply buttons (Confirm order, Cancel order).

## Return-to-origin protection

- **Shared risk score.** When a COD order is placed, the API counts the
  phone number's delivered and refused parcels in this store and in all other
  stores (`src/risk/risk.service.ts`). That is the only cross-store read in the
  merchant API: it runs on the Super Admin connection and returns totals, never
  rows or store names.
- **Order rules** (Merchant Admin → Order rules) hold risky customers and
  large first orders for a call, or confirm trusted customers automatically.
  When a held customer confirms, the confirmation is recorded and the order
  waits for the merchant.
- **Returns (RTO)** breaks returned parcels down by city, product, courier,
  ad campaign, hour and risk level. Ad source comes from `utm_*` parameters or
  Facebook / TikTok / Google click IDs on the landing link.
- **COD payments** imports a courier's payment report (CSV, any layout: the
  merchant picks the tracking and amount columns) and matches it to orders by
  tracking number, and lists delivered orders the courier has not paid for.

## Migrations

Tenant tables carry hand-written row-level security policies and
`<table>_tenant_fk` foreign keys that Prisma does not know about. When you
generate a migration, delete any `DROP CONSTRAINT "..._tenant_fk"` lines Prisma
adds, and add the RLS policy for new tenant tables (see
`prisma/migrations/*_risk_rules_reconciliation`). `pnpm db:setup` and the test
suite fail if either is missing.

## Production notes

- Point a wildcard DNS record and certificate at the storefront app and set
  `STOREFRONT_ROOT_DOMAIN` (stores are `<slug>.<root domain>`), with
  `STOREFRONT_PROTOCOL=https` and an empty `STOREFRONT_PORT`.
- Each Next.js app proxies `/api/*` to `API_URL`, so cookies stay on that
  app's host. Set `API_URL` for each app and `NEXT_PUBLIC_MERCHANT_URL` for
  the marketing site. Set `COOKIE_SECURE=true`.
- The API should be reachable only from the apps and from Meta's webhook, and
  `API_URL` in the API's environment must be its public URL (it is shown to
  merchants as the webhook address).
