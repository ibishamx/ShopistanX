# Progress log

Last updated: 17 Nov 2026

## Done and verified

Verified means covered by the automated suite (`pnpm test`, 40 tests against
real PostgreSQL) and exercised in a browser against the running apps.

| Area | State |
| --- | --- |
| Monorepo, four Next.js apps, NestJS API, shared UI package | Builds and typechecks |
| Database schema, migrations, forced row-level security on all 10 tenant tables | Verified |
| Two-tenant isolation suite (API and direct database) | Verified, runs in CI |
| Merchant signup, login, sessions, instant `<slug>` subdomain | Verified |
| Products with variants, stock, SKU, prices in PKR (stored as paisa) | Verified |
| Storefront: home, product page, cart | Verified |
| **COD form** on product page and cart, merchant-editable with live preview | Verified |
| COD orders: server-side totals, atomic stock reservation, per-store order numbers | Verified |
| Order flow: confirm, cancel (restock), ship with courier and tracking number, delivered, returned (restock) | Verified |
| Customers created from orders, with delivered/returned history shown on each order | Verified |
| **WhatsApp click-to-chat confirmation** (shopper → store, merchant → customer, confirmation link) | Verified |
| Dashboard: order counts, booked sales, cash collected, delivery rate, top products | Verified |
| Super Admin: separate staff login and database role, store list, suspend, reactivate | Verified |
| Suspended store stops serving storefront and admin | Verified |
| Append-only audit log of staff actions | Verified |

## Built, not verified against the real service

| Area | Why |
| --- | --- |
| **WhatsApp Cloud API**: automatic template send, webhook replies, delivery receipts | Tested only against a mocked Meta API. Needs a Meta Business account, a WhatsApp Business number and an approved template. The admin shows "Saved, not verified" until Meta accepts a real send. The Graph API version defaults to `v23.0` (`WHATSAPP_GRAPH_VERSION`); check it is still supported when you connect. |
| Deployment | Nothing is deployed; hosting is not chosen. No Dockerfiles yet. |

## Differences from the architecture document

- Sessions and the WhatsApp send queue are in PostgreSQL, not Redis. WhatsApp
  sends run in the API process after the order commits; a failed send is
  recorded on the order and can be resent by hand, but is not retried
  automatically. BullMQ on Redis is still the plan once couriers are added.
- Prisma lives in `apps/api/prisma` rather than `packages/db`.
- Plain pnpm workspaces; Turborepo not added.
- Product images are links; there is no upload or S3 storage yet.
- Inventory is a stock number per variant (no locations table).
- Theme: one theme with editable announcement, hero text and accent colour.
  The JSON section model and draft/publish are not built.

## Not built yet

Collections · product options matrix (variants are entered as rows) · bank
transfer · image upload · custom domains · staff roles · Urdu / right-to-left ·
discounts · pixels · rate limiting on public endpoints · password reset and
email verification · courier booking (PostEx, Leopards) · settlement
reconciliation · JazzCash / Easypaisa · PKR billing.

## Blocked on you

- Meta Business account and WhatsApp Business number, to verify the Cloud API.
- Hosting choice and domain (the code assumes `shopistan.pk` only in one
  signup hint).
- Courier and payment gateway merchant accounts for milestones 2 and 3.
