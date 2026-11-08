/**
 * File-backed inventory. One process should own the file (one Railway replica
 * plus a volume). Stock is split by location: cafe = pickup, home = ship.
 * A reservation decrements stock immediately so two checkouts cannot sell the
 * same set. Webhooks fulfill, release, or restore that reservation.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { VARIANTS, CAFE_INITIAL, HOME_INITIAL } = require('./catalog');

function seed() {
  const variants = {};
  for (const id of Object.keys(VARIANTS)) {
    variants[id] = { cafe: CAFE_INITIAL, home: HOME_INITIAL };
  }
  return { variants, reservations: {}, events: {} };
}

function unitsForAmount(qty, amount, refunded) {
  if (!Number.isInteger(qty) || qty < 0) return 0;
  if (!Number.isInteger(amount) || amount <= 0) return 0;
  if (!Number.isInteger(refunded) || refunded <= 0) return 0;
  if (refunded >= amount) return qty;
  return Math.floor((qty * refunded) / amount);
}

class Inventory {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  lock(fn) {
    const run = this.queue.then(() => fn());
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') throw new Error('Inventory file is not an object.');
      data.variants = data.variants || {};
      data.reservations = data.reservations || {};
      data.events = data.events || {};
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return seed();
      throw error;
    }
  }

  write(data) {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = this.filePath + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  available(variantId, location) {
    const data = this.read();
    const row = data.variants[variantId];
    if (!row || typeof row[location] !== 'number' || row[location] < 0) return 0;
    return row[location];
  }

  publicStock() {
    const data = this.read();
    const variants = {};
    for (const id of Object.keys(VARIANTS)) {
      const row = data.variants[id] || {};
      const cafe = typeof row.cafe === 'number' && row.cafe > 0 ? row.cafe : 0;
      const home = typeof row.home === 'number' && row.home > 0 ? row.home : 0;
      variants[id] = { cafe, home, total: cafe + home };
    }
    return { variants };
  }

  findByCartToken(cartToken) {
    const data = this.read();
    const matches = Object.values(data.reservations).filter((reservation) => {
      return reservation && reservation.cartToken === cartToken && reservation.status === 'held';
    });
    matches.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return matches[0] || null;
  }

  findBySession(sessionId) {
    const data = this.read();
    return Object.values(data.reservations).find((reservation) => reservation && reservation.sessionId === sessionId) || null;
  }

  get(reservationId) {
    const data = this.read();
    return data.reservations[reservationId] || null;
  }

  listHeld(now) {
    const data = this.read();
    return Object.values(data.reservations).filter((reservation) => {
      return reservation && reservation.status === 'held' && (!now || reservation.createdAt <= now);
    });
  }

  reserve({ items, location, cartToken }) {
    return this.lock(() => {
      const data = this.read();
      for (const item of items) {
        const row = data.variants[item.variantId];
        const have = row && typeof row[location] === 'number' ? row[location] : 0;
        if (have < item.qty) {
          const error = new Error('Not enough in stock.');
          error.status = 409;
          error.stock = this.stockSnapshot(data);
          error.variantId = item.variantId;
          error.location = location;
          throw error;
        }
      }
      for (const item of items) {
        data.variants[item.variantId][location] -= item.qty;
      }
      const id = 'res_' + crypto.randomBytes(9).toString('hex');
      data.reservations[id] = {
        id,
        status: 'held',
        location,
        cartToken: cartToken || null,
        items: items.map((item) => ({ variantId: item.variantId, qty: item.qty })),
        sessionId: null,
        sessionUrl: null,
        createdAt: Date.now(),
        refunded: {},
      };
      this.write(data);
      return data.reservations[id];
    });
  }

  attachSession(reservationId, sessionId, sessionUrl) {
    return this.lock(() => {
      const data = this.read();
      const reservation = data.reservations[reservationId];
      if (!reservation || reservation.status !== 'held') return null;
      reservation.sessionId = sessionId;
      reservation.sessionUrl = sessionUrl || null;
      this.write(data);
      return reservation;
    });
  }

  release(reservationId, reason, eventId) {
    return this.lock(() => {
      const data = this.read();
      if (eventId && data.events[eventId]) return { duplicate: true };
      const reservation = data.reservations[reservationId];
      if (!reservation) return { missing: true };
      if (reservation.status !== 'held') {
        if (eventId) data.events[eventId] = Date.now();
        this.write(data);
        return { noop: true, status: reservation.status };
      }
      this.returnItems(data, reservation, reservation.items);
      reservation.status = 'released';
      reservation.releasedAt = Date.now();
      reservation.releaseReason = reason || 'released';
      if (eventId) data.events[eventId] = Date.now();
      this.pruneEvents(data);
      this.write(data);
      return { released: true };
    });
  }

  fulfill(reservationId, sessionId, eventId) {
    return this.lock(() => {
      const data = this.read();
      if (eventId && data.events[eventId]) return { duplicate: true };
      const reservation = data.reservations[reservationId];
      // Leave the event unclaimed so Stripe retries until attachSession lands.
      if (!reservation) return { missing: true };
      if (reservation.status === 'fulfilled') {
        if (eventId) data.events[eventId] = Date.now();
        this.write(data);
        return { noop: true, status: 'fulfilled' };
      }
      if (reservation.status !== 'held') {
        if (eventId) data.events[eventId] = Date.now();
        this.write(data);
        return { noop: true, status: reservation.status };
      }
      reservation.status = 'fulfilled';
      reservation.fulfilledAt = Date.now();
      if (sessionId) reservation.sessionId = sessionId;
      if (eventId) data.events[eventId] = Date.now();
      this.pruneEvents(data);
      this.write(data);
      return { fulfilled: true };
    });
  }

  /**
   * Restore stock after a refund. `amountRefunded` is cumulative for the charge.
   * Full refunds restore every unit still out. Partial refunds restore
   * floor(qty * amountRefunded / amount) per line, once.
   */
  restoreRefund(reservationId, { chargeId, amount, amountRefunded, eventId }) {
    return this.lock(() => {
      const data = this.read();
      if (eventId && data.events[eventId]) return { duplicate: true };
      const reservation = data.reservations[reservationId];
      if (!reservation) return { missing: true };
      if (reservation.status !== 'fulfilled') {
        if (eventId) data.events[eventId] = Date.now();
        this.write(data);
        return { noop: true, status: reservation.status };
      }
      reservation.refunded = reservation.refunded || {};
      const already = reservation.refunded[chargeId] || 0;
      if (!Number.isInteger(amountRefunded) || amountRefunded <= already) {
        if (eventId) data.events[eventId] = Date.now();
        this.write(data);
        return { noop: true };
      }
      const restored = [];
      for (const item of reservation.items) {
        const prevUnits = unitsForAmount(item.qty, amount, already);
        const nextUnits = unitsForAmount(item.qty, amount, amountRefunded);
        const delta = nextUnits - prevUnits;
        if (delta > 0) {
          this.addStock(data, item.variantId, reservation.location, delta);
          restored.push({ variantId: item.variantId, qty: delta });
        }
      }
      reservation.refunded[chargeId] = amountRefunded;
      if (eventId) data.events[eventId] = Date.now();
      this.pruneEvents(data);
      this.write(data);
      return { restored };
    });
  }

  returnItems(data, reservation, items) {
    for (const item of items) this.addStock(data, item.variantId, reservation.location, item.qty);
  }

  addStock(data, variantId, location, qty) {
    if (!data.variants[variantId]) data.variants[variantId] = { cafe: 0, home: 0 };
    const current = data.variants[variantId][location];
    data.variants[variantId][location] = (typeof current === 'number' ? current : 0) + qty;
  }

  stockSnapshot(data) {
    const variants = {};
    for (const id of Object.keys(VARIANTS)) {
      const row = data.variants[id] || {};
      const cafe = typeof row.cafe === 'number' && row.cafe > 0 ? row.cafe : 0;
      const home = typeof row.home === 'number' && row.home > 0 ? row.home : 0;
      variants[id] = { cafe, home, total: cafe + home };
    }
    return { variants };
  }

  pruneEvents(data) {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const [id, at] of Object.entries(data.events)) {
      if (typeof at === 'number' && at < cutoff) delete data.events[id];
    }
  }
}

module.exports = { Inventory, seed, unitsForAmount };
