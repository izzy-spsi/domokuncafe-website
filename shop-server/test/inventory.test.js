const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Inventory, unitsForAmount } = require('../inventory');

function tempInventory() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domo-shop-'));
  return new Inventory(path.join(dir, 'inventory.json'));
}

test('unitsForAmount restores the full line on a full refund and floors partials', () => {
  assert.equal(unitsForAmount(4, 5196, 5196), 4);
  assert.equal(unitsForAmount(4, 5196, 5197), 4);
  assert.equal(unitsForAmount(4, 1000, 250), 1);
  assert.equal(unitsForAmount(4, 1000, 0), 0);
  assert.equal(unitsForAmount(1, 1299, 100), 0);
});

test('reserve decrements only the chosen location and blocks oversell', async () => {
  const inventory = tempInventory();
  const held = await inventory.reserve({
    items: [{ variantId: 'pink-classic', qty: 2 }],
    location: 'home',
    cartToken: 'token-one',
  });
  assert.equal(held.status, 'held');
  assert.equal(inventory.publicStock().variants['pink-classic'].home, 48);
  assert.equal(inventory.publicStock().variants['pink-classic'].cafe, 50);

  await assert.rejects(
    () => inventory.reserve({
      items: [{ variantId: 'pink-classic', qty: 49 }],
      location: 'home',
      cartToken: 'token-two',
    }),
    (error) => error.status === 409
  );
  assert.equal(inventory.publicStock().variants['pink-classic'].home, 48);
});

test('parallel reserves cannot oversell one location', async () => {
  const inventory = tempInventory();
  const attempts = await Promise.allSettled([
    inventory.reserve({ items: [{ variantId: 'white-chef', qty: 40 }], location: 'cafe', cartToken: 'a' }),
    inventory.reserve({ items: [{ variantId: 'white-chef', qty: 40 }], location: 'cafe', cartToken: 'b' }),
  ]);
  const ok = attempts.filter((item) => item.status === 'fulfilled');
  assert.equal(ok.length, 1);
  assert.equal(inventory.publicStock().variants['white-chef'].cafe, 10);
  assert.equal(inventory.publicStock().variants['white-chef'].home, 50);
});

test('release restores held stock once and fulfill keeps it decremented', async () => {
  const inventory = tempInventory();
  const held = await inventory.reserve({
    items: [{ variantId: 'white-chef', qty: 3 }],
    location: 'cafe',
    cartToken: 'pickup',
  });
  await inventory.attachSession(held.id, 'cs_test_1', 'https://checkout.stripe.com/c/pay/cs_test_1');
  const fulfilled = await inventory.fulfill(held.id, 'cs_test_1', 'evt_paid');
  assert.equal(fulfilled.fulfilled, true);
  assert.equal(inventory.publicStock().variants['white-chef'].cafe, 47);
  const again = await inventory.fulfill(held.id, 'cs_test_1', 'evt_paid_2');
  assert.equal(again.noop, true);
  assert.equal(inventory.publicStock().variants['white-chef'].cafe, 47);

  const released = await inventory.release(held.id, 'expired', 'evt_exp');
  assert.equal(released.noop, true);
  assert.equal(inventory.publicStock().variants['white-chef'].cafe, 47);
});

test('expiry releases a hold and a second expiry is a no-op', async () => {
  const inventory = tempInventory();
  const held = await inventory.reserve({
    items: [{ variantId: 'pink-classic', qty: 1 }, { variantId: 'white-chef', qty: 2 }],
    location: 'home',
    cartToken: 'ship',
  });
  const first = await inventory.release(held.id, 'expired', 'evt_1');
  assert.equal(first.released, true);
  assert.equal(inventory.publicStock().variants['pink-classic'].home, 50);
  assert.equal(inventory.publicStock().variants['white-chef'].home, 50);
  const second = await inventory.release(held.id, 'expired', 'evt_2');
  assert.equal(second.noop, true);
  assert.equal(inventory.publicStock().variants['pink-classic'].home, 50);
});

test('full refund restores once and a partial refund floors units', async () => {
  const inventory = tempInventory();
  const held = await inventory.reserve({
    items: [{ variantId: 'pink-classic', qty: 4 }],
    location: 'home',
    cartToken: 'refund',
  });
  await inventory.fulfill(held.id, 'cs_test_refund', 'evt_paid');
  const partial = await inventory.restoreRefund(held.id, {
    chargeId: 'ch_1',
    amount: 5196,
    amountRefunded: 1299,
    eventId: 'evt_partial',
  });
  assert.deepEqual(partial.restored, [{ variantId: 'pink-classic', qty: 1 }]);
  assert.equal(inventory.publicStock().variants['pink-classic'].home, 47);

  const replay = await inventory.restoreRefund(held.id, {
    chargeId: 'ch_1',
    amount: 5196,
    amountRefunded: 1299,
    eventId: 'evt_partial_replay',
  });
  assert.equal(replay.noop, true);
  assert.equal(inventory.publicStock().variants['pink-classic'].home, 47);

  const rest = await inventory.restoreRefund(held.id, {
    chargeId: 'ch_1',
    amount: 5196,
    amountRefunded: 5196,
    eventId: 'evt_full',
  });
  assert.equal(rest.restored[0].qty, 3);
  assert.equal(inventory.publicStock().variants['pink-classic'].home, 50);

  const extra = await inventory.restoreRefund(held.id, {
    chargeId: 'ch_1',
    amount: 5196,
    amountRefunded: 5196,
    eventId: 'evt_full_2',
  });
  assert.equal(extra.noop, true);
  assert.equal(inventory.publicStock().variants['pink-classic'].home, 50);
});

test('duplicate event ids do not restore twice', async () => {
  const inventory = tempInventory();
  const held = await inventory.reserve({
    items: [{ variantId: 'white-chef', qty: 1 }],
    location: 'home',
    cartToken: 'dup',
  });
  await inventory.release(held.id, 'expired', 'evt_same');
  await inventory.release(held.id, 'expired', 'evt_same');
  assert.equal(inventory.publicStock().variants['white-chef'].home, 50);
});
