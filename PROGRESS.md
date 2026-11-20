# Progress log

Last updated: 20 Nov 2026

## Done and verified

Verified means covered by the automated suite (`pnpm test`, 56 tests against
real PostgreSQL) and exercised in a browser against the running apps.

| Area | State |
| --- | --- |
| Monorepo, four Next.js apps, NestJS API, shared UI package | Builds and typechecks |
| Database schema, migrations, forced row-level security on all 10 tenant tables | Verified |
| Two-tenant isolation suite (API and direct database) | Verified, runs in CI |
| Merchant signup, login, sessions, instant `<slug>` subdomain | Verified |
| Products with variants, stock, SKU, prices in PKR (stored as paisa) | Verified |
| Storefront: home, product page, cart | Verified |
| Storefront design modelled on the MC Store theme export: scrolling announcement bar, centred logo header, banner, product runway, 9:16 product cards with Sale badge, two-row marquee, trust badges, FAQ, cart drawer, product gallery, footer | Verified in desktop and mobile browsers |
| Merchant Admin "Storefront design" page for logo, banner, announcements, runway, marquee, trust badges, delivery time, FAQ, footer text, button colour | Verified |
| **COD form** on product page and cart, merchant-editable with live preview | Verified |
| COD orders: server-side totals, atomic stock reservation, per-store order numbers | Verified |
| Order flow: confirm, cancel (restock), ship with courier and tracking number, delivered, returned (restock) | Verified |
| Customers created from orders, with delivered/returned history shown on each order | Verified |
| **WhatsApp click-to-chat confirmation** (shopper → store, merchant → customer, confirmation link) | Verified |
| Dashboard: order counts, booked sales, cash collected, delivery rate, top products | Verified |
| Super Admin: separate staff login and database role, store list, suspend, reactivate | Verified |
| **Shared customer risk score**: each COD order scored by the phone number's delivered/refused parcels across all stores; totals only, other stores never named | Verified, including a test that no other store's name or id appears |
| **Order rules**: hold high-risk customers, hold large first orders over a set amount, auto-confirm trusted customers; held orders record the customer's confirmation but wait for the merchant | Verified |
| **Pakistan address form**: required nearby landmark (can be turned off), Pakistani mobile check | Verified |
| **RTO analytics** by city, product, courier, ad campaign (utm and Facebook/TikTok/Google click IDs), hour ordered and customer risk | Verified |
| **COD reconciliation**: import a courier payment CSV, choose columns, match by tracking number (matched, short-paid, not delivered, unknown, already paid); unpaid and late delivered orders | Verified with a sample file in a made-up PostEx layout |
| **Dispute record**: printable order record with confirmation, WhatsApp message IDs and timeline in PKT | Verified |
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
- Theme: one design with editable content. Sections can be hidden but not
  reordered; the JSON section model and draft/publish are not built.
- The MC Store theme's fixed "sold this month", "people viewing", star rating,
  countdown timer and hard-coded reviews were not recreated, since every store
  would show the same made-up numbers. Real reviews and real sales counts need
  their own data first.
- The theme's collection grid, video reels and search are not built (no
  collections, video or search in the platform yet).

## Feature list (Pakistan-first features doc, 21 Nov) not built, and why

| Feature | Why not yet |
| --- | --- |
| SMS / robocall fallback, phone OTP | Needs an SMS or voice provider account |
| Deposit or advance delivery charge for risky orders, prepaid discount, payment links | Needs JazzCash / Easypaisa / PayFast / Safepay merchant accounts. Rules currently hold the order instead |
| City and area lists matching courier coverage, uncovered-area warning | Needs courier coverage data from the courier accounts |
| Courier booking, labels, tracking sync, failed-delivery alerts, smart courier choice | Needs courier API accounts (PostEx first) |
| Real courier settlement formats | Import works with any CSV by choosing columns; each courier's real report should be tried once accounts exist |
| Upfront COD payouts | Needs a fintech or courier partner |
| Meta conversions on confirmed/delivered orders | Needs a Meta pixel and Conversions API token per store |
| FBR details, tax on orders, tax reports | Needs a tax adviser's rules first; the doc's caution about "online marketplace" status applies |
| WhatsApp catalog and broadcasts, loyalty points, verified-seller badge, video reviews | Later in the doc's order |
| Urdu / Roman Urdu | Not started |

## Needs a decision before launch

- **Shared risk score and privacy.** Delivery outcomes for a phone number are
  shared between stores as totals. Merchant terms and the storefront privacy
  notice must say so, and a lawyer should confirm it fits Pakistani data
  protection rules. Customers have no way yet to see or dispute their record.

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
