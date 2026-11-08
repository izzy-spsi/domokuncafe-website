/**
 * Browser catalog for the merch shop. Prices must match shop-server/catalog.js.
 * The server re-prices every checkout. This file is for display only.
 */
window.DOMO_CATALOG = {
  priceCents: 1299,
  shipFlatCents: 495,
  shipFreeMinQty: 2,
  lowStockAt: 20,
  product: {
    id: 'keycap-keychains',
    name: 'Domo Cafe Keycap Keychains',
    priceLabel: '$12.99',
    href: '/shop/keycap-keychains/',
  },
  variants: {
    'pink-classic': {
      id: 'pink-classic',
      name: 'Pink classic',
      image: '/shop/img/keychain-pink.jpg',
      alt: 'Placeholder photo for Pink classic Domo Cafe keycap keychains: four classic Domo keycaps on a white strip with pink caps, in a clear bag with a red and white header card. Real photo coming soon.',
      summary: '4 classic Domo keycaps on a white strip, pink caps.',
      detail: 'Four classic Domo keycaps on a white strip, with pink caps. The set comes in a clear bag with a red and white “Domo Cafe Keycap Keychains” header card.',
    },
    'white-chef': {
      id: 'white-chef',
      name: 'White Chef',
      image: '/shop/img/keychain-white-chef.jpg',
      alt: 'Placeholder photo for White Chef Domo Cafe keycap keychains: three chef-hat Domo keycaps and one Domo Cafe logo keycap, in a clear bag with a red and white header card. Real photo coming soon.',
      summary: '3 chef-hat Domo keycaps and 1 Domo Cafe logo keycap.',
      detail: 'Three chef-hat Domo keycaps plus one Domo Cafe logo keycap. The set comes in a clear bag with a red and white “Domo Cafe Keycap Keychains” header card.',
    },
  },
};
