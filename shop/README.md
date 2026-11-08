# Domo Cafe merch shop

Online-only guest checkout for merch. Food ordering stays on Toast, DoorDash, and Grubhub. The red **Order Now** button is food. The gold **Shop** link is merch.

Pages:

- `/shop/` catalog
- `/shop/keycap-keychains/` product
- `/shop/cart/` cart (stored in this browser)
- `/shop/success/` and `/shop/cancel/` Stripe return pages
- `/shop/shipping/`, `/shop/returns/` (draft), `/shop/privacy/`

Checkout itself runs on the shop server in `shop-server/`. GitHub Pages cannot create Stripe sessions. See [shop-server/README.md](../shop-server/README.md) for env vars, Railway, and the webhook.

## Product photos

Photos are not in yet. These files are labeled placeholders. Replace the files in place and keep the names:

| Path | What the real photo should show |
| --- | --- |
| `/shop/img/keychain-pink.jpg` | Pink classic: 4 classic Domo keycaps on a white strip, pink caps, in a clear bag with a red and white “Domo Cafe Keycap Keychains” header card |
| `/shop/img/keychain-white-chef.jpg` | White Chef: 3 chef-hat Domo keycaps plus 1 Domo Cafe logo keycap, in a clear bag with the same header card |

Use JPEG, about 1200×900. The pages also print a “Placeholder photo” label. Remove that label in `shop/index.html` and `shop/keycap-keychains/index.html` (the `photo-note` elements) when the real photos land.

`shop/config.js` is the public API origin. Leave it empty for same-origin local runs. On GitHub Pages, set it to the Railway shop origin. It is not a secret. Stripe keys never go in this file.
