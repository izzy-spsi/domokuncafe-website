# Domo Cafe shop server

Small Node service that the static site cannot run on GitHub Pages. It creates Stripe Checkout Sessions, holds inventory so two buyers cannot take the last set, and listens for Stripe webhooks.

Run **one** copy. Inventory is a JSON file. Two replicas will oversell.

Do not put this on the GitHub Pages site. `main` publishes www.domokuncafe.com from Pages, which only serves files. Host this process on Railway as its **own service**, separate from `domokuncafe-staging` and `domokuncafe-dev` (those deploy the marketing site from the repo root).

## What it sells

Domo Cafe Keycap Keychains, $12.99 each. Prices are set in `catalog.js`, not by the browser.

| Variant id | Set | Stock |
| --- | --- | --- |
| `pink-classic` | 4 classic Domo keycaps on a white strip, pink caps | 50 ship (`home`) and 50 cafe pickup (`cafe`) |
| `white-chef` | 3 chef-hat Domo keycaps + 1 Domo Cafe logo keycap | 50 ship and 50 cafe pickup |

Shipping is USPS Ground Advantage, United States only:

- $4.95 when the order has 1 item
- free when the order has 2 or more items
- free cafe pickup at 8340 La Palma Ave Ste R, Buena Park, CA 90620

Ship orders decrement `home`. Pickup orders decrement `cafe`. Checkout collects a US address, email, and phone. Card wallets (Apple Pay, Google Pay, Link) show up when they are enabled on the Stripe account. Guest checkout only. There are no shop accounts.

Stock is reserved when the Checkout Session is created, confirmed on `checkout.session.completed`, released on expiry or a failed async payment, and restored on `charge.refunded`.

## Env vars

Secrets come only from the environment. Copy `.env.example` to `.env` for local runs. `.env` is gitignored. Never commit keys.

| Variable | Required | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | yes, to take payment | Stripe secret key. Use `sk_test_...`. A live key refuses to boot unless `STRIPE_ALLOW_LIVE=true`. |
| `STRIPE_WEBHOOK_SECRET` | yes, to trust webhooks | Signing secret from the Stripe webhook (`whsec_...`). |
| `PUBLIC_SITE_URL` | yes | Origin of the shop pages, no path and no trailing slash. Success and cancel URLs are built from this. Local: `http://127.0.0.1:3710`. After the shop is on the cafe domain: `https://domokuncafe.com`. |
| `STRIPE_AUTOMATIC_TAX` | no | Default on. Set `false` if Stripe Tax is not ready yet. |
| `INVENTORY_PATH` | on Railway | File for stock and reservations. Local default: `shop-server/data/inventory.json`. On Railway: `/data/inventory.json`. |
| `NOTIFY_PATH` | on Railway | Sold-out emails. Local default: `shop-server/data/notify.json`. On Railway: `/data/notify.json`. |
| `PORT` | no | Default `3710`. Railway sets this. |
| `SERVE_STATIC` | local only | `true` serves the repo (the cafe site plus `/shop`) from this process. Leave unset on the API-only Railway service. |
| `ALLOW_CHECKOUT_PREVIEW` | no | `true` enables `/shop/success/?session_id=cs_test_preview` as a sample paid order. Keep `false` in production. |
| `CORS_ORIGINS` | no | Extra browser origins, comma-separated. `https://domokuncafe.com` and `https://www.domokuncafe.com` are already allowed. |
| `STRIPE_ALLOW_LIVE` | no | Set `true` only when you mean to charge real cards. |

The browser learns the API origin from `shop/config.js` (`window.DOMO_SHOP_API_BASE`). That value is public. Leave it empty when this server also serves the pages. On GitHub Pages, set it to this service’s Railway origin.

## Run locally

From `shop-server/`, with Node 20+:

```bash
npm install
cp .env.example .env
# edit .env and put your Stripe test secret in STRIPE_SECRET_KEY
SERVE_STATIC=true ALLOW_CHECKOUT_PREVIEW=true npm start
```

Open http://127.0.0.1:3710/shop/

`npm test` covers inventory, shipping amounts, the US-only Checkout payload, oversell refusal, webhook signature checks, refunds, and the notify-me list. Tests do not call Stripe’s network.

Forward webhooks to your machine with the Stripe CLI (the CLI prints a `whsec_` value; put that in `STRIPE_WEBHOOK_SECRET`):

```bash
stripe listen --forward-to localhost:3710/api/webhook
```

Test card: `4242 4242 4242 4242`, any future expiry, any CVC, any US address.

## Railway

1. In the existing Domo Cafe Railway project, create a **new service**. Set the repo root directory to `shop-server` (not the repo root). One replica.
2. Generate a public domain. That hostname is the API origin.
3. Add a volume mounted at `/data`. Without it, a redeploy resets stock to 50/50 and deletes notify-me emails.
4. Set `INVENTORY_PATH=/data/inventory.json` and `NOTIFY_PATH=/data/notify.json`.
5. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `PUBLIC_SITE_URL`.
6. Do not set `SERVE_STATIC` on this service. The cafe site stays on GitHub Pages (and the existing Railway marketing services).
7. Health check: `GET /api/health`.

`railway.toml` in this folder sets the start command and health check. This service is not wired into `.github/workflows/deploy.yml` on purpose. That workflow deploys the marketing site. Deploy this service from the Railway dashboard (or `railway up` with the service root set to `shop-server`) so a docs change on `main` cannot silently republish checkout.

## Register the Stripe webhook

Stripe Dashboard → Developers → Webhooks → Add endpoint. Use **test mode** until you are ready to charge real cards.

Endpoint:

```text
https://YOUR-RAILWAY-DOMAIN/api/webhook
```

Events:

- `checkout.session.completed`
- `checkout.session.expired`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `charge.refunded`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy. The route checks the signature and rejects anything else.

Stripe Tax (so `automatic_tax` works): in test mode, turn on Stripe Tax and set the head-office origin address. If session creation fails with an origin-address error, fix that in the Dashboard or set `STRIPE_AUTOMATIC_TAX=false`.

Wallets: enable Apple Pay, Google Pay, and Link in the Stripe Dashboard (test mode). Checkout does not pin `payment_method_types` to card, so those wallets can appear. Add the shop domain where Apple Pay asks for a domain association file.

## Routes

| Method | Path | Role |
| --- | --- | --- |
| `GET` | `/api/health` | Process is up. Reports whether a Stripe key is set. Does not reveal the key. |
| `GET` | `/api/stock` | Counts left per variant, split into `home` (ship) and `cafe` (pickup). |
| `POST` | `/api/checkout` | Checks stock, reserves it, opens a Checkout Session. |
| `POST` | `/api/checkout/abandon` | Expires an open session and puts the hold back. The cancel page calls this. |
| `GET` | `/api/checkout/session?session_id=` | Receipt details for the success page. |
| `POST` | `/api/notify` | Saves an email when that variant’s total is 0. |
| `POST` | `/api/webhook` | Stripe events. Raw body, signed. |

Notify-me addresses are only in the notify file. Nothing sends mail yet. Read the file on the volume when you are ready to write those people.

## What Izzy configures

1. Create the Railway service described above. Do not merge this branch to `main` until the API is up and `shop/config.js` points at it. Merging `main` publishes www.
2. Stripe test secret → `STRIPE_SECRET_KEY`. Webhook signing secret → `STRIPE_WEBHOOK_SECRET`. Shop origin → `PUBLIC_SITE_URL`.
3. Volume at `/data`, plus `INVENTORY_PATH` and `NOTIFY_PATH`.
4. Register the webhook events listed above, on the Railway URL.
5. Turn on Stripe Tax (or set `STRIPE_AUTOMATIC_TAX=false`).
6. Turn on the wallets you want, and Apple Pay’s domain file if you use it.
7. Set `window.DOMO_SHOP_API_BASE` in `shop/config.js` to the Railway origin before the shop is served from GitHub Pages.
8. Replace `/shop/img/keychain-pink.jpg` and `/shop/img/keychain-white-chef.jpg` (see `shop/README.md`) and remove the placeholder labels.
9. Read the draft returns page (`/shop/returns/`) and the privacy page before calling them final. The returns page is marked draft in the UI.
10. USPS labels are not bought by this server. The checkout line is the customer-facing promise. Buy postage when you pack.
11. Keep a single replica. Hand-editing `inventory.json` while an order is in flight can race the next write. The first run starts at 50 cafe and 50 home per variant the first time the file is missing. Deleting the file resets stock.
12. Stay on test keys until a real card should be charged. Live mode needs `STRIPE_ALLOW_LIVE=true`, a live secret key, and a live webhook secret.
