# Deploying Shopistan

Shopistan runs on one Linux server with Docker. Caddy in front serves every
app over HTTPS and gets certificates from Let's Encrypt automatically,
including one per store subdomain.

| Address | What |
| --- | --- |
| `https://<domain>` | Marketing site |
| `https://app.<domain>` | Merchant Admin (signup and login) |
| `https://admin.<domain>` | Super Admin |
| `https://<store>.<domain>` | Each store |
| `https://api.<domain>/webhooks/...` | WhatsApp webhooks only; the rest of the API is private |

## Quick start (one command)

1. **Create a server.** On DigitalOcean: Create → Droplets → Ubuntu 24.04,
   region Bangalore (closest to Pakistan), size 2 vCPU / 4 GB. Copy its IP
   address.
2. **Get a free address.** Sign in at duckdns.org, add a name (for example
   `mystores`), and paste the server's IP into it. Every store then gets an
   address like `shop1.mystores.duckdns.org` automatically.
3. **Run the installer.** Open the droplet's Console (Access → Launch
   Droplet Console) and paste, with your DuckDNS name:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/ibishamx/ShopistanX/claude/bold-ptolemy-2k1x3w/deploy/install.sh | DOMAIN=mystores.duckdns.org bash
   ```

   It installs everything, builds and starts Shopistan (about 10 minutes),
   and prints the addresses and the Super Admin login. Run the same command
   again later to update.

Skipping step 2 works too (leave out `DOMAIN=...`): the server then uses
`<its-ip>.sslip.io`. That address is shared with many other users, so
certificates for new store addresses can sometimes fail; use DuckDNS or
your own domain for real use. To move to your own domain later, point its
DNS at the server (below) and run the installer again with `DOMAIN=yourdomain.pk`.
Existing stores get an address on the new domain automatically.

The rest of this guide is the manual route and day-to-day operations.

## What you need

- A server with at least **2 CPU cores, 4 GB RAM and 40 GB disk**, Ubuntu
  24.04, with ports 80 and 443 open. Pick a region close to Pakistan for
  speed (for example Mumbai, Dubai or Singapore).
- A domain, with access to its DNS settings.

## 1. Point the domain at the server

Create two DNS records with your server's IP address:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` (the domain itself) | server IP |
| A | `*` (wildcard) | server IP |

The wildcard covers `app.`, `admin.`, `api.` and every store address.

## 2. Install Docker on the server

```bash
curl -fsSL https://get.docker.com | sh
```

## 3. Get the code and configure it

```bash
git clone https://github.com/ibishamx/ShopistanX.git shopistan
```

```bash
cd shopistan && git checkout claude/bold-ptolemy-2k1x3w
```

```bash
cp deploy/.env.production.example deploy/.env.production
```

Edit `deploy/.env.production` and fill in every value: your domain, an email
address for certificate notices, three database passwords, the encryption
key and the first Super Admin login. Each line says how to generate its
value. Keep a copy of `ENCRYPTION_KEY` somewhere safe.

## 4. Start it

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d --build
```

The first build takes a few minutes. On every start a setup step applies
database migrations, checks that every store's data is isolated, and creates
the Super Admin; the apps start only if it succeeds. Check that everything is
running:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production ps
```

Open `https://app.<domain>/signup` to create the first store, and
`https://admin.<domain>` to sign in as Super Admin. The first visit to each
address can take a few seconds while its certificate is issued.

## Updating

```bash
git pull && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d --build
```

## Backups

Back up the database every night, and copy the files off the server (for
example to object storage). One way, as a cron entry on the server:

```bash
0 2 * * * cd /root/shopistan && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production exec -T postgres pg_dump -U shopistan shopistan | gzip > /root/backups/shopistan-$(date +\%F).sql.gz
```

Test a restore before you rely on it.

## Logs

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production logs -f api
```

## WhatsApp webhooks

Merchants register `https://api.<domain>/webhooks/whatsapp/<their store id>`
in their Meta app; the WhatsApp settings page shows them the exact address.

## Notes

- Certificates are only issued for addresses that belong to a store, so the
  server cannot be used to request certificates for other names.
- `STOREFRONT_FALLBACK_SLUG` is for development and is not set by this setup.
  Leave it unset in production.
- Merchants' own custom domains (for example `www.theirstore.pk`) are not
  supported yet. The routing is ready for them: they need a CNAME to the
  server and a verified row in the `domains` table.
