/**
 * Domo Cafe merch checkout.
 *
 * Static pages live in /shop and can ship on GitHub Pages. This process is the
 * piece Pages cannot run: Stripe Checkout Sessions, the webhook, and inventory.
 *
 * Secrets come from the environment only. Never commit them.
 *   STRIPE_SECRET_KEY       sk_test_... (live keys are refused unless STRIPE_ALLOW_LIVE=true)
 *   STRIPE_WEBHOOK_SECRET   whsec_...
 *   PUBLIC_SITE_URL         origin of the shop pages, no path (success and cancel URLs)
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const { Inventory } = require('./inventory');
const { NotifyList } = require('./notify');
const {
  PRICE_CENTS,
  VARIANTS,
  PICKUP_ADDRESS,
  shippingQuote,
  normalizeItems,
  sameItems,
} = require('./catalog');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CART_TOKEN_RE = /^[A-Za-z0-9_-]{8,80}$/;
const HOLD_WITHOUT_SESSION_MS = 15 * 60 * 1000;
const SWEEP_AFTER_MS = 40 * 60 * 1000;
const STALE_HOLD_MS = 26 * 60 * 60 * 1000;

function loadEnvFile() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function assertTestKey(key) {
  if (!key) return;
  if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) return;
  if (process.env.STRIPE_ALLOW_LIVE === 'true') {
    console.warn('STRIPE_ALLOW_LIVE is set. This process can charge real cards.');
    return;
  }
  console.error('STRIPE_SECRET_KEY is not a test key. Refusing to start. Use an sk_test_ key.');
  process.exit(1);
}

function httpError(status, message, extra) {
  const error = new Error(message);
  error.status = status;
  error.public = status < 500 || status === 502 || status === 503;
  if (extra) Object.assign(error, extra);
  return error;
}

function publicStripeMessage(error) {
  const msg = error && error.message ? error.message : 'Could not start checkout.';
  if (/automatic tax|origin address|Stripe Tax/i.test(msg)) {
    return 'Stripe Tax is not ready on this account. In the Stripe Dashboard (test mode), add an origin address and turn on Stripe Tax, or set STRIPE_AUTOMATIC_TAX=false on the shop server.';
  }
  return 'Could not start checkout. ' + msg;
}

function originAllowed(origin, publicSiteUrl) {
  if (!origin) return false;
  const fixed = [
    publicSiteUrl,
    'https://domokuncafe.com',
    'https://www.domokuncafe.com',
    'http://localhost:3710',
    'http://127.0.0.1:3710',
    'http://localhost:3700',
    'http://127.0.0.1:3700',
  ];
  if (fixed.includes(origin)) return true;
  const extra = (process.env.CORS_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  return extra.includes(origin);
}

function variantName(id) {
  return (VARIANTS[id] && VARIANTS[id].name) || 'Keychain';
}

function stockMessage(error) {
  const name = variantName(error.variantId);
  const where = error.location === 'cafe' ? 'for cafe pickup' : 'to ship';
  return 'Not enough ' + name + ' sets ' + where + '.';
}

function createApp(options = {}) {
  const publicSiteUrl = String(options.publicSiteUrl || process.env.PUBLIC_SITE_URL || 'http://127.0.0.1:3710').replace(/\/$/, '');
  const webhookSecret = options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '';
  const automaticTax = options.automaticTax != null
    ? options.automaticTax
    : process.env.STRIPE_AUTOMATIC_TAX !== 'false';
  const allowPreview = options.allowPreview != null
    ? options.allowPreview
    : process.env.ALLOW_CHECKOUT_PREVIEW === 'true';
  const serveStatic = options.serveStatic != null
    ? options.serveStatic
    : process.env.SERVE_STATIC === 'true';
  const inventory = options.inventory || new Inventory(process.env.INVENTORY_PATH || path.join(__dirname, 'data', 'inventory.json'));
  const notify = options.notify || new NotifyList(process.env.NOTIFY_PATH || path.join(__dirname, 'data', 'notify.json'));
  const stripe = options.stripe !== undefined
    ? options.stripe
    : (process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null);

  const cartChains = new Map();
  const app = express();

  function withCartToken(token, fn) {
    const prev = cartChains.get(token) || Promise.resolve();
    const run = prev.then(() => fn(), () => fn());
    cartChains.set(token, run.then(() => undefined, () => undefined));
    return run;
  }

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && originAllowed(origin, publicSiteUrl)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      stripe: Boolean(stripe),
      automaticTax,
      publicSiteUrl,
    });
  });

  app.get('/api/stock', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(inventory.publicStock());
  });

  app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !webhookSecret) {
      return res.status(503).send('Webhook is not configured.');
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
    } catch (error) {
      return res.status(400).send('Webhook signature verification failed.');
    }
    try {
      await handleStripeEvent(event);
      res.json({ received: true });
    } catch (error) {
      console.error('Webhook handler failed', event.type, error.message);
      res.status(500).json({ error: 'Webhook handler failed.' });
    }
  });

  app.use(express.json({ limit: '32kb' }));

  app.post('/api/notify', async (req, res, next) => {
    try {
      const email = String((req.body && req.body.email) || '').trim();
      const variantId = req.body && req.body.variantId;
      if (!EMAIL_RE.test(email) || email.length > 200) throw httpError(400, 'Enter a valid email.');
      if (!VARIANTS[variantId]) throw httpError(400, 'Unknown item.');
      const stock = inventory.publicStock().variants[variantId];
      if (!stock || stock.total > 0) throw httpError(400, 'These are still available.');
      await notify.add(email, variantId);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/checkout/session', async (req, res, next) => {
    try {
      const sessionId = String(req.query.session_id || '');
      if (allowPreview && sessionId === 'cs_test_preview') {
        return res.json(previewOrder());
      }
      if (!stripe) throw httpError(503, 'Checkout is not configured yet.');
      if (!sessionId.startsWith('cs_')) throw httpError(400, 'Missing order.');
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      res.set('Cache-Control', 'no-store');
      res.json(publicSession(session));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/checkout/abandon', async (req, res, next) => {
    try {
      const sessionId = req.body && req.body.sessionId;
      if (!sessionId || typeof sessionId !== 'string') throw httpError(400, 'Missing session.');
      if (!stripe) throw httpError(503, 'Checkout is not configured yet.');
      await abandonSession(sessionId);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/checkout', async (req, res, next) => {
    try {
      if (!stripe) throw httpError(503, 'Checkout is not configured yet. Set STRIPE_SECRET_KEY on the shop server.');
      const body = req.body || {};
      const fulfillment = body.fulfillment === 'pickup' ? 'pickup' : body.fulfillment === 'ship' ? 'ship' : null;
      if (!fulfillment) throw httpError(400, 'Choose shipping or cafe pickup.');
      const cartToken = body.cartToken;
      if (!CART_TOKEN_RE.test(cartToken || '')) throw httpError(400, 'Missing cart token.');
      const items = normalizeItems(body.items);
      const quote = shippingQuote(fulfillment, items.reduce((sum, item) => sum + item.qty, 0));
      const result = await withCartToken(cartToken, () => startCheckout({
        cartToken,
        items,
        fulfillment,
        quote,
        replaceSessionId: typeof body.replaceSessionId === 'string' ? body.replaceSessionId : '',
      }));
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  if (serveStatic) {
    const root = path.join(__dirname, '..');
    app.use((req, res, next) => {
      if (req.path.startsWith('/shop-server') || req.path.includes('.env')) return res.status(404).end();
      next();
    });
    app.use(express.static(root));
  }

  app.use((error, req, res, next) => {
    const status = error.status || 500;
    const tell = error.public || (error.status && error.status < 500);
    const payload = { error: tell ? error.message : 'Something went wrong.' };
    if (error.stock) payload.stock = error.stock;
    if (status >= 500 && !error.public) console.error(error);
    res.status(status).json(payload);
  });

  async function startCheckout({ cartToken, items, fulfillment, quote, replaceSessionId }) {
    const existing = inventory.findByCartToken(cartToken);
    if (existing && existing.sessionId && sameItems(existing, items, quote.location)) {
      const reused = await reuseOpenSession(existing);
      if (reused) return reused;
    } else if (existing && existing.sessionId) {
      await abandonSession(existing.sessionId);
    } else if (existing) {
      await inventory.release(existing.id, 'replaced');
    }
    if (replaceSessionId && (!existing || existing.sessionId !== replaceSessionId)) {
      await abandonSession(replaceSessionId);
    }

    let reservation;
    try {
      reservation = await inventory.reserve({ items, location: quote.location, cartToken });
    } catch (error) {
      if (error.status === 409) {
        error.message = stockMessage(error);
        error.public = true;
      }
      throw error;
    }

    try {
      const session = await stripe.checkout.sessions.create(sessionParams({
        reservation,
        items,
        fulfillment,
        quote,
      }));
      await inventory.attachSession(reservation.id, session.id, session.url);
      return { url: session.url, sessionId: session.id };
    } catch (error) {
      await inventory.release(reservation.id, 'stripe-create-failed');
      throw httpError(502, publicStripeMessage(error));
    }
  }

  function sessionParams({ reservation, items, fulfillment, quote }) {
    const imagesOk = publicSiteUrl.startsWith('https://');
    return {
      mode: 'payment',
      success_url: publicSiteUrl + '/shop/success/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: publicSiteUrl + '/shop/cancel/?session_id={CHECKOUT_SESSION_ID}',
      expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
      client_reference_id: reservation.id,
      phone_number_collection: { enabled: true },
      billing_address_collection: 'auto',
      shipping_address_collection: { allowed_countries: ['US'] },
      automatic_tax: { enabled: automaticTax },
      custom_text: {
        shipping_address: {
          message: fulfillment === 'pickup'
            ? 'Pickup is free at ' + PICKUP_ADDRESS + '. A US address is still required for the receipt.'
            : 'USPS Ground Advantage to the 50 US states. Ships within 2 business days. $4.95 for one set, free on two or more.',
        },
        submit: { message: 'Guest checkout for Domo Cafe merch. This is not a food order.' },
      },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: quote.cents, currency: 'usd' },
          display_name: quote.label,
          tax_behavior: 'exclusive',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: quote.estimate.minimum },
            maximum: { unit: 'business_day', value: quote.estimate.maximum },
          },
        },
      }],
      line_items: items.map((item) => {
        const variant = VARIANTS[item.variantId];
        const productData = {
          name: variant.productName + ' — ' + variant.name,
          description: variant.description,
          tax_code: 'txcd_99999999',
        };
        if (imagesOk) productData.images = [publicSiteUrl + variant.image];
        return {
          quantity: item.qty,
          price_data: {
            currency: 'usd',
            unit_amount: PRICE_CENTS,
            tax_behavior: 'exclusive',
            product_data: productData,
          },
        };
      }),
      metadata: {
        reservation_id: reservation.id,
        fulfillment,
        location: quote.location,
        items: JSON.stringify(items),
      },
      payment_intent_data: {
        description: 'Domo Cafe Keycap Keychains',
        metadata: {
          reservation_id: reservation.id,
          fulfillment,
          location: quote.location,
        },
      },
    };
  }

  async function reuseOpenSession(reservation) {
    const session = await stripe.checkout.sessions.retrieve(reservation.sessionId);
    if (session.payment_status === 'paid') {
      await inventory.fulfill(reservation.id, reservation.sessionId);
      throw httpError(409, 'That checkout was already paid.');
    }
    if (session.status === 'open' && session.url) {
      return { url: session.url, sessionId: session.id };
    }
    await inventory.release(reservation.id, 'session-' + (session.status || 'closed'));
    return null;
  }

  async function abandonSession(sessionId) {
    if (!sessionId || !stripe) return;
    const reservation = inventory.findBySession(sessionId);
    let session = null;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      if (reservation && reservation.status === 'held') await inventory.release(reservation.id, 'abandon-missing-session');
      return;
    }
    if (session.payment_status === 'paid') {
      const id = (session.metadata && session.metadata.reservation_id) || (reservation && reservation.id);
      if (id) await inventory.fulfill(id, sessionId);
      return;
    }
    if (session.status === 'open') {
      try {
        await stripe.checkout.sessions.expire(sessionId);
      } catch (error) {
        const again = await stripe.checkout.sessions.retrieve(sessionId);
        if (again.payment_status === 'paid') {
          const id = (again.metadata && again.metadata.reservation_id) || (reservation && reservation.id);
          if (id) await inventory.fulfill(id, sessionId);
          return;
        }
      }
    }
    const id = (session.metadata && session.metadata.reservation_id) || (reservation && reservation.id);
    if (id) {
      const result = await inventory.release(id, 'abandoned');
      if (result.missing) return;
    }
  }

  async function handleStripeEvent(event) {
    const object = event.data && event.data.object;
    if (!object) return;
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (object.payment_status !== 'paid' && object.payment_status !== 'no_payment_required') return;
      const result = await inventory.fulfill(object.metadata && object.metadata.reservation_id, object.id, event.id);
      if (result.missing) throw new Error('Reservation missing for ' + event.type);
      return;
    }
    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      const id = object.metadata && object.metadata.reservation_id;
      if (!id) return;
      await inventory.release(id, event.type, event.id);
      return;
    }
    if (event.type === 'charge.refunded') {
      const reservationId = await reservationIdFromCharge(object);
      if (!reservationId) return;
      const result = await inventory.restoreRefund(reservationId, {
        chargeId: object.id,
        amount: object.amount,
        amountRefunded: object.amount_refunded,
        eventId: event.id,
      });
      if (result.missing) throw new Error('Reservation missing for refund');
    }
  }

  async function reservationIdFromCharge(charge) {
    if (charge.metadata && charge.metadata.reservation_id) return charge.metadata.reservation_id;
    if (!charge.payment_intent || !stripe.paymentIntents) return null;
    const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent.id;
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent.metadata && paymentIntent.metadata.reservation_id;
  }

  async function sweep(now) {
    if (!stripe) return;
    const held = inventory.listHeld();
    for (const reservation of held) {
      const age = (now || Date.now()) - (reservation.createdAt || 0);
      if (!reservation.sessionId) {
        if (age > HOLD_WITHOUT_SESSION_MS) await inventory.release(reservation.id, 'abandoned-before-session');
        continue;
      }
      if (age < SWEEP_AFTER_MS) continue;
      try {
        const session = await stripe.checkout.sessions.retrieve(reservation.sessionId);
        if (session.payment_status === 'paid') {
          await inventory.fulfill(reservation.id, session.id);
        } else if (session.status === 'expired' || age > STALE_HOLD_MS) {
          await inventory.release(reservation.id, session.status === 'expired' ? 'expired' : 'stale');
        }
      } catch (error) {
        console.error('Sweep failed', reservation.id, error.message);
      }
    }
  }

  return { app, inventory, notify, sweep, handleStripeEvent, publicSiteUrl };
}

function publicSession(session) {
  let items = [];
  try {
    items = JSON.parse((session.metadata && session.metadata.items) || '[]');
  } catch (error) {
    items = [];
  }
  return {
    id: session.id,
    paymentStatus: session.payment_status,
    email: session.customer_details && session.customer_details.email || session.customer_email || '',
    phone: session.customer_details && session.customer_details.phone || '',
    fulfillment: session.metadata && session.metadata.fulfillment || '',
    items: items.map((item) => ({
      variantId: item.variantId,
      name: variantName(item.variantId),
      qty: item.qty,
    })),
    amountSubtotal: session.amount_subtotal || 0,
    amountShipping: session.total_details ? session.total_details.amount_shipping || 0 : 0,
    amountTax: session.total_details ? session.total_details.amount_tax || 0 : 0,
    amountTotal: session.amount_total || 0,
    currency: session.currency || 'usd',
    preview: false,
  };
}

function previewOrder() {
  return {
    id: 'cs_test_preview',
    paymentStatus: 'paid',
    email: 'preview@domokuncafe.com',
    phone: '',
    fulfillment: 'ship',
    items: [
      { variantId: 'pink-classic', name: 'Pink classic', qty: 1 },
      { variantId: 'white-chef', name: 'White Chef', qty: 1 },
    ],
    amountSubtotal: 2598,
    amountShipping: 0,
    amountTax: 0,
    amountTotal: 2598,
    currency: 'usd',
    preview: true,
  };
}

function main() {
  loadEnvFile();
  assertTestKey(process.env.STRIPE_SECRET_KEY || '');
  const port = Number(process.env.PORT || 3710);
  const { app, sweep } = createApp();
  app.listen(port, () => {
    console.log('Domo Cafe shop server on port ' + port);
  });
  setInterval(() => {
    sweep().catch((error) => console.error('Sweep failed', error.message));
  }, 5 * 60 * 1000).unref();
}

if (require.main === module) main();

module.exports = { createApp, loadEnvFile, assertTestKey, publicSession, previewOrder };
