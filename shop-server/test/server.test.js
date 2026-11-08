const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const Stripe = require('stripe');
const { Inventory } = require('../inventory');
const { NotifyList } = require('../notify');
const { createApp } = require('../server');

function tempPaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domo-shop-http-'));
  return {
    inventory: new Inventory(path.join(dir, 'inventory.json')),
    notify: new NotifyList(path.join(dir, 'notify.json')),
  };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function request(server, method, urlPath, body, headers) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path: urlPath,
      method,
      headers: Object.assign({
        'Content-Type': payload ? 'application/json' : 'text/plain',
        'Content-Length': payload ? Buffer.byteLength(payload) : 0,
      }, headers || {}),
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch (error) { json = null; }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('shipping is 4.95 for one set, free for two, free for pickup, and US-only', async () => {
  const stores = tempPaths();
  const created = [];
  const stripe = {
    checkout: {
      sessions: {
        async create(params) {
          created.push(params);
          return { id: 'cs_test_' + created.length, url: 'https://checkout.stripe.com/c/pay/cs_test_' + created.length };
        },
        async retrieve(id) {
          return { id, status: 'open', url: 'https://checkout.stripe.com/c/pay/' + id, payment_status: 'unpaid', metadata: {} };
        },
        async expire() { return { status: 'expired' }; },
      },
    },
  };
  const { app } = createApp({
    inventory: stores.inventory,
    notify: stores.notify,
    stripe,
    automaticTax: true,
    publicSiteUrl: 'http://127.0.0.1:3710',
    serveStatic: false,
  });
  const server = await listen(app);
  try {
    const one = await request(server, 'POST', '/api/checkout', {
      fulfillment: 'ship',
      cartToken: 'cart-token-1',
      items: [{ variantId: 'pink-classic', qty: 1 }],
    });
    assert.equal(one.status, 200);
    assert.equal(created[0].shipping_options[0].shipping_rate_data.fixed_amount.amount, 495);
    assert.equal(created[0].shipping_options[0].shipping_rate_data.display_name, 'USPS Ground Advantage');
    assert.deepEqual(created[0].shipping_address_collection.allowed_countries, ['US']);
    assert.equal(created[0].phone_number_collection.enabled, true);
    assert.equal(created[0].automatic_tax.enabled, true);
    assert.equal(created[0].line_items[0].price_data.unit_amount, 1299);
    assert.equal(stores.inventory.publicStock().variants['pink-classic'].home, 49);
    assert.equal(stores.inventory.publicStock().variants['pink-classic'].cafe, 50);

    const two = await request(server, 'POST', '/api/checkout', {
      fulfillment: 'ship',
      cartToken: 'cart-token-2',
      items: [{ variantId: 'pink-classic', qty: 1 }, { variantId: 'white-chef', qty: 1 }],
    });
    assert.equal(two.status, 200);
    assert.equal(created[1].shipping_options[0].shipping_rate_data.fixed_amount.amount, 0);
    assert.match(created[1].shipping_options[0].shipping_rate_data.display_name, /free on 2 or more/);

    const pickup = await request(server, 'POST', '/api/checkout', {
      fulfillment: 'pickup',
      cartToken: 'cart-token-3',
      items: [{ variantId: 'white-chef', qty: 1 }],
    });
    assert.equal(pickup.status, 200);
    assert.equal(created[2].shipping_options[0].shipping_rate_data.fixed_amount.amount, 0);
    assert.match(created[2].shipping_options[0].shipping_rate_data.display_name, /8340 La Palma Ave Ste R/);
    assert.equal(created[2].metadata.location, 'cafe');
    assert.equal(stores.inventory.publicStock().variants['white-chef'].cafe, 49);
    assert.equal(stores.inventory.publicStock().variants['white-chef'].home, 49);
  } finally {
    server.close();
  }
});

test('checkout refuses to oversell and restores stock when Stripe fails', async () => {
  const stores = tempPaths();
  await stores.inventory.reserve({
    items: [{ variantId: 'pink-classic', qty: 50 }],
    location: 'home',
    cartToken: 'drain',
  });
  const stripe = {
    checkout: {
      sessions: {
        async create() { throw new Error('Stripe Tax origin address is not set'); },
        async retrieve() { throw new Error('missing'); },
        async expire() { return {}; },
      },
    },
  };
  const { app } = createApp({
    inventory: stores.inventory,
    notify: stores.notify,
    stripe,
    automaticTax: true,
    serveStatic: false,
  });
  const server = await listen(app);
  try {
    const blocked = await request(server, 'POST', '/api/checkout', {
      fulfillment: 'ship',
      cartToken: 'cart-token-blocked',
      items: [{ variantId: 'pink-classic', qty: 1 }],
    });
    assert.equal(blocked.status, 409);
    assert.match(blocked.json.error, /Not enough Pink classic/);
    assert.equal(stores.inventory.publicStock().variants['pink-classic'].home, 0);

    const tax = await request(server, 'POST', '/api/checkout', {
      fulfillment: 'pickup',
      cartToken: 'cart-token-tax',
      items: [{ variantId: 'pink-classic', qty: 1 }],
    });
    assert.equal(tax.status, 502);
    assert.match(tax.json.error, /Stripe Tax/);
    assert.equal(stores.inventory.publicStock().variants['pink-classic'].cafe, 50);
  } finally {
    server.close();
  }
});

test('missing Stripe key does not decrement stock', async () => {
  const stores = tempPaths();
  const { app } = createApp({
    inventory: stores.inventory,
    notify: stores.notify,
    stripe: null,
    serveStatic: false,
  });
  const server = await listen(app);
  try {
    const health = await request(server, 'GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.stripe, false);
    const checkout = await request(server, 'POST', '/api/checkout', {
      fulfillment: 'ship',
      cartToken: 'cart-token-x',
      items: [{ variantId: 'white-chef', qty: 1 }],
    });
    assert.equal(checkout.status, 503);
    assert.equal(stores.inventory.publicStock().variants['white-chef'].home, 50);
  } finally {
    server.close();
  }
});

test('webhook expiry restores stock and a bad signature is rejected', async () => {
  const stores = tempPaths();
  const held = await stores.inventory.reserve({
    items: [{ variantId: 'pink-classic', qty: 2 }],
    location: 'home',
    cartToken: 'webhook-cart',
  });
  await stores.inventory.attachSession(held.id, 'cs_test_expire', 'https://checkout.stripe.com/c/pay/cs_test_expire');
  const secret = 'whsec_test_secret';
  const stripe = new Stripe('sk_test_dummy', { telemetry: false });
  const { app } = createApp({
    inventory: stores.inventory,
    notify: stores.notify,
    stripe,
    webhookSecret: secret,
    serveStatic: false,
  });
  const server = await listen(app);
  try {
    const event = {
      id: 'evt_expire_1',
      object: 'event',
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_test_expire',
          object: 'checkout.session',
          payment_status: 'unpaid',
          status: 'expired',
          metadata: { reservation_id: held.id },
        },
      },
    };
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const raw = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: server.address().port,
        path: '/api/webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Stripe-Signature': signature,
        },
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    assert.equal(raw.status, 200);
    assert.equal(stores.inventory.publicStock().variants['pink-classic'].home, 50);

    const bad = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: server.address().port,
        path: '/api/webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 't=1,v1=nope',
        },
      }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    assert.equal(bad, 400);
  } finally {
    server.close();
  }
});

test('paid webhook keeps stock down and refund puts it back', async () => {
  const stores = tempPaths();
  const held = await stores.inventory.reserve({
    items: [{ variantId: 'white-chef', qty: 1 }],
    location: 'cafe',
    cartToken: 'paid-cart',
  });
  const { handleStripeEvent } = createApp({
    inventory: stores.inventory,
    notify: stores.notify,
    stripe: {
      paymentIntents: {
        async retrieve() {
          return { metadata: { reservation_id: held.id } };
        },
      },
    },
    serveStatic: false,
  });
  await handleStripeEvent({
    id: 'evt_paid',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_paid',
        payment_status: 'paid',
        metadata: { reservation_id: held.id },
      },
    },
  });
  assert.equal(stores.inventory.publicStock().variants['white-chef'].cafe, 49);
  await handleStripeEvent({
    id: 'evt_refund',
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_test',
        amount: 1299,
        amount_refunded: 1299,
        payment_intent: 'pi_test',
        metadata: {},
      },
    },
  });
  assert.equal(stores.inventory.publicStock().variants['white-chef'].cafe, 50);
});

test('notify-me accepts an email only when the variant is sold out', async () => {
  const stores = tempPaths();
  const { app } = createApp({
    inventory: stores.inventory,
    notify: stores.notify,
    stripe: null,
    serveStatic: false,
  });
  const server = await listen(app);
  try {
    const early = await request(server, 'POST', '/api/notify', {
      email: 'fan@example.com',
      variantId: 'pink-classic',
    });
    assert.equal(early.status, 400);
    await stores.inventory.reserve({
      items: [{ variantId: 'pink-classic', qty: 50 }],
      location: 'home',
      cartToken: 'drain-home',
    });
    await stores.inventory.reserve({
      items: [{ variantId: 'pink-classic', qty: 50 }],
      location: 'cafe',
      cartToken: 'drain-cafe',
    });
    const saved = await request(server, 'POST', '/api/notify', {
      email: 'fan@example.com',
      variantId: 'pink-classic',
    });
    assert.equal(saved.status, 200);
    const again = await request(server, 'POST', '/api/notify', {
      email: 'Fan@example.com',
      variantId: 'pink-classic',
    });
    assert.equal(again.status, 200);
    const list = stores.notify.read();
    assert.equal(list.length, 1);
  } finally {
    server.close();
  }
});
