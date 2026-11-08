/**
 * Server-side merch catalog. Prices live here so the browser cannot set them.
 * Keep ids and prices aligned with /shop/catalog.js.
 */

const PRICE_CENTS = 1299;
const SHIP_FLAT_CENTS = 495;
const SHIP_FREE_MIN_QTY = 2;
const CAFE_INITIAL = 50;
const HOME_INITIAL = 50;
const PICKUP_ADDRESS = '8340 La Palma Ave Ste R, Buena Park, CA 90620';

const VARIANTS = {
  'pink-classic': {
    id: 'pink-classic',
    name: 'Pink classic',
    productName: 'Domo Cafe Keycap Keychains',
    image: '/shop/img/keychain-pink.jpg',
    description: '4 classic Domo keycaps on a white strip, pink caps. Clear bag with a red and white Domo Cafe Keycap Keychains header card.',
  },
  'white-chef': {
    id: 'white-chef',
    name: 'White Chef',
    productName: 'Domo Cafe Keycap Keychains',
    image: '/shop/img/keychain-white-chef.jpg',
    description: '3 chef-hat Domo keycaps and 1 Domo Cafe logo keycap. Clear bag with a red and white Domo Cafe Keycap Keychains header card.',
  },
};

function shippingQuote(fulfillment, totalQty) {
  if (fulfillment === 'pickup') {
    return {
      cents: 0,
      location: 'cafe',
      label: 'Cafe pickup — ' + PICKUP_ADDRESS,
      estimate: { minimum: 1, maximum: 2 },
    };
  }
  if (fulfillment !== 'ship') {
    const error = new Error('Choose shipping or cafe pickup.');
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(totalQty) || totalQty < 1) {
    const error = new Error('Your cart is empty.');
    error.status = 400;
    throw error;
  }
  if (totalQty >= SHIP_FREE_MIN_QTY) {
    return {
      cents: 0,
      location: 'home',
      label: 'USPS Ground Advantage — free on 2 or more',
      estimate: { minimum: 2, maximum: 7 },
    };
  }
  return {
    cents: SHIP_FLAT_CENTS,
    location: 'home',
    label: 'USPS Ground Advantage',
    estimate: { minimum: 2, maximum: 7 },
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('Your cart is empty.');
    error.status = 400;
    throw error;
  }
  const merged = new Map();
  for (const raw of items) {
    const id = raw && raw.variantId;
    const qty = raw && raw.qty;
    if (!VARIANTS[id]) {
      const error = new Error('Unknown item.');
      error.status = 400;
      throw error;
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      const error = new Error('Check the quantity.');
      error.status = 400;
      throw error;
    }
    merged.set(id, (merged.get(id) || 0) + qty);
  }
  const list = [];
  for (const [variantId, qty] of merged) {
    if (qty > 50) {
      const error = new Error('Check the quantity.');
      error.status = 400;
      throw error;
    }
    list.push({ variantId, qty });
  }
  return list;
}

function sameItems(reservation, items, location) {
  if (!reservation || reservation.location !== location) return false;
  if (!reservation.items || reservation.items.length !== items.length) return false;
  const wanted = new Map(items.map((item) => [item.variantId, item.qty]));
  for (const item of reservation.items) {
    if (wanted.get(item.variantId) !== item.qty) return false;
    wanted.delete(item.variantId);
  }
  return wanted.size === 0;
}

module.exports = {
  PRICE_CENTS,
  SHIP_FLAT_CENTS,
  SHIP_FREE_MIN_QTY,
  CAFE_INITIAL,
  HOME_INITIAL,
  PICKUP_ADDRESS,
  VARIANTS,
  shippingQuote,
  normalizeItems,
  sameItems,
};
