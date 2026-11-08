(function () {
  var catalog = window.DOMO_CATALOG || {
    priceCents: 1299,
    shipFlatCents: 495,
    shipFreeMinQty: 2,
    lowStockAt: 20,
    product: { name: 'Domo Cafe Keycap Keychains' },
    variants: {},
  };
  var CART_KEY = 'domo-shop-cart-v1';
  var TOKEN_KEY = 'domo-shop-cart-token';
  var OPEN_KEY = 'domo-shop-open-session';
  var PURCHASE_KEY = 'domo-shop-purchase-tracked';
  var stockState = null;

  function apiBase() {
    return String(window.DOMO_SHOP_API_BASE || '').replace(/\/$/, '');
  }

  function api(path, options) {
    return fetch(apiBase() + path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var error = new Error(body.error || 'Something went wrong.');
          error.status = res.status;
          error.stock = body.stock || null;
          throw error;
        }
        return body;
      });
    });
  }

  function money(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function variant(id) {
    return catalog.variants[id] || null;
  }

  function track(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  }

  function gaItem(id, qty) {
    var item = variant(id);
    return {
      item_id: id,
      item_name: catalog.product.name,
      item_variant: item ? item.name : id,
      price: catalog.priceCents / 100,
      quantity: qty,
    };
  }

  function loadCart() {
    try {
      var raw = JSON.parse(localStorage.getItem(CART_KEY) || '');
      var items = Array.isArray(raw.items) ? raw.items : [];
      var clean = [];
      items.forEach(function (item) {
        if (!variant(item.variantId)) return;
        var qty = Number(item.qty);
        if (!Number.isInteger(qty) || qty < 1) return;
        clean.push({ variantId: item.variantId, qty: Math.min(qty, 50) });
      });
      return {
        fulfillment: raw.fulfillment === 'pickup' ? 'pickup' : 'ship',
        items: clean,
      };
    } catch (error) {
      return { fulfillment: 'ship', items: [] };
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    paintCount();
  }

  function clearCart() {
    localStorage.removeItem(CART_KEY);
    paintCount();
  }

  function totalQty(cart) {
    return cart.items.reduce(function (sum, item) { return sum + item.qty; }, 0);
  }

  function shippingCents(cart) {
    var qty = totalQty(cart);
    if (!qty || cart.fulfillment === 'pickup' || qty >= catalog.shipFreeMinQty) return 0;
    return catalog.shipFlatCents;
  }

  function cartToken() {
    var existing = sessionStorage.getItem(TOKEN_KEY);
    if (existing) return existing;
    var token = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('cart' + Date.now());
    sessionStorage.setItem(TOKEN_KEY, token);
    return token;
  }

  function paintCount() {
    var count = totalQty(loadCart());
    document.querySelectorAll('[data-cart-count]').forEach(function (node) {
      node.textContent = String(count);
    });
  }

  function bindNav() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.querySelector('.site-nav');
    if (!toggle || !nav || toggle.dataset.bound) return;
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
  }

  function fetchStock() {
    return api('/api/stock').then(function (data) {
      stockState = data;
      return data;
    });
  }

  function stockFor(id) {
    if (!stockState || !stockState.variants || !stockState.variants[id]) return null;
    return stockState.variants[id];
  }

  function locationPhrase(n, label) {
    if (n <= 0) return label === 'at the cafe' ? 'Sold out at the cafe' : 'Sold out to ship';
    if (n <= catalog.lowStockAt) return 'Only ' + n + ' ' + label;
    return n + ' ' + label;
  }

  function stockSentence(row) {
    if (!row) return 'Checking stock…';
    return locationPhrase(row.home, 'ready to ship') + ' · ' + locationPhrase(row.cafe, 'at the cafe');
  }

  function paintStockLines() {
    document.querySelectorAll('[data-stock-line]').forEach(function (node) {
      node.textContent = stockSentence(stockFor(node.getAttribute('data-stock-line')));
    });
  }

  function selectedVariant() {
    var input = document.querySelector('input[name="variant"]:checked');
    return input ? input.value : 'pink-classic';
  }

  function paintProduct() {
    var id = selectedVariant();
    var item = variant(id);
    var row = stockFor(id);
    var photo = document.getElementById('product-photo');
    if (photo && item) {
      photo.src = item.image;
      photo.alt = item.alt;
    }
    var low = document.querySelector('[data-badge-low]');
    var sold = document.querySelector('[data-badge-sold]');
    var add = document.getElementById('add-to-cart');
    var qty = document.getElementById('qty');
    var notify = document.getElementById('notify');
    var total = row ? row.total : null;
    if (low) {
      if (row && total > 0 && total <= catalog.lowStockAt) {
        low.hidden = false;
        low.textContent = 'Only ' + total + ' left';
      } else {
        low.hidden = true;
      }
    }
    if (sold) sold.hidden = !(row && total === 0);
    if (notify) notify.hidden = !(row && total === 0);
    if (add) add.disabled = !row || total === 0;
    if (qty && row) {
      var cap = Math.max(row.home, row.cafe, 0);
      qty.max = String(Math.max(cap, 1));
      if (cap > 0 && Number(qty.value) > cap) qty.value = String(cap);
      qty.disabled = cap === 0;
    }
    var summary = document.getElementById('stock-summary');
    if (summary) {
      if (!row) summary.textContent = 'Checking how many sets are left…';
      else if (total === 0) summary.textContent = item.name + ' is sold out.';
      else summary.textContent = item.name + ': ' + stockSentence(row) + (total <= catalog.lowStockAt ? '. Only ' + total + ' left.' : '.');
    }
  }

  function bindProduct() {
    document.querySelectorAll('input[name="variant"]').forEach(function (input) {
      input.addEventListener('change', paintProduct);
    });
    function setProductQty(next) {
      var input = document.getElementById('qty');
      if (!input) return;
      var cap = Number(input.max) || 50;
      var qty = Number(next);
      if (!Number.isInteger(qty) || qty < 1) qty = 1;
      if (qty > cap) qty = cap;
      input.value = String(qty);
    }
    var qtyInput = document.getElementById('qty');
    var qtyDec = document.getElementById('qty-dec');
    var qtyInc = document.getElementById('qty-inc');
    if (qtyDec) qtyDec.addEventListener('click', function () { setProductQty(Number(qtyInput.value) - 1); });
    if (qtyInc) qtyInc.addEventListener('click', function () { setProductQty(Number(qtyInput.value) + 1); });
    if (qtyInput) qtyInput.addEventListener('change', function () { setProductQty(Number(qtyInput.value)); });
    var add = document.getElementById('add-to-cart');
    if (add) {
      add.addEventListener('click', function () {
        var id = selectedVariant();
        var item = variant(id);
        var row = stockFor(id);
        var qtyInput = document.getElementById('qty');
        var qty = Number(qtyInput && qtyInput.value);
        var status = document.getElementById('add-status');
        if (!row) {
          status.textContent = 'Still checking stock. Try again in a moment.';
          return;
        }
        var cap = Math.max(row.home, row.cafe);
        if (!Number.isInteger(qty) || qty < 1) qty = 1;
        if (cap < 1) {
          status.textContent = item.name + ' is sold out.';
          paintProduct();
          return;
        }
        if (qty > cap) qty = cap;
        var cart = loadCart();
        var line = cart.items.find(function (entry) { return entry.variantId === id; });
        if (line) line.qty = Math.min(50, line.qty + qty);
        else cart.items.push({ variantId: id, qty: qty });
        saveCart(cart);
        track('add_to_cart', {
          currency: 'USD',
          value: (qty * catalog.priceCents) / 100,
          items: [gaItem(id, qty)],
        });
        status.innerHTML = 'Added ' + esc(item.name) + ' × ' + qty + '. <a href="/shop/cart/">View cart</a>';
      });
    }
    var notify = document.getElementById('notify');
    if (notify) {
      notify.addEventListener('submit', function (event) {
        event.preventDefault();
        var id = selectedVariant();
        var email = notify.querySelector('input[type="email"]').value.trim();
        var status = document.getElementById('notify-status');
        var button = notify.querySelector('button');
        button.disabled = true;
        api('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, variantId: id }),
        }).then(function () {
          status.textContent = 'Saved. We will email you if this set comes back.';
          notify.reset();
        }).catch(function (error) {
          status.textContent = error.message;
        }).finally(function () {
          button.disabled = false;
        });
      });
    }
  }

  function lineCap(row, fulfillment) {
    if (!row) return 0;
    return fulfillment === 'pickup' ? row.cafe : row.home;
  }

  function renderCart() {
    var root = document.getElementById('cart-root');
    if (!root) return;
    var cart = loadCart();
    if (!stockState) {
      root.innerHTML = '<p class="cart-error">Stock did not load, so checkout is paused. <button class="text-button" type="button" id="retry-stock">Try again</button></p>';
      document.getElementById('retry-stock').addEventListener('click', boot);
      return;
    }
    var notes = [];
    cart.items = cart.items.map(function (item) {
      var row = stockFor(item.variantId);
      var cap = lineCap(row, cart.fulfillment);
      if (item.qty > cap) {
        var name = variant(item.variantId).name;
        if (cap < 1) notes.push(name + ' is sold out for ' + (cart.fulfillment === 'pickup' ? 'cafe pickup' : 'shipping') + '.');
        else notes.push(name + ' only has ' + cap + ' left for ' + (cart.fulfillment === 'pickup' ? 'cafe pickup' : 'shipping') + '.');
        item.qty = cap;
      }
      return item;
    }).filter(function (item) { return item.qty > 0; });
    saveCart(cart);

    if (!cart.items.length) {
      root.innerHTML = '<div class="empty"><p>Your cart is empty.</p><a class="button" href="/shop/keycap-keychains/">See the keychains</a></div>';
      return;
    }

    var subtotal = totalQty(cart) * catalog.priceCents;
    var shipping = shippingCents(cart);
    var lines = cart.items.map(function (item) {
      var entry = variant(item.variantId);
      return '<article class="cart-line">' +
        '<img src="' + esc(entry.image) + '" alt="">' +
        '<div><h2>' + esc(entry.name) + '</h2><p>' + esc(entry.summary) + '</p>' +
        '<p class="stock-line">' + esc(stockSentence(stockFor(item.variantId))) + '</p>' +
        '<div class="line-actions"><div class="stepper"><button type="button" data-dec="' + esc(item.variantId) + '" aria-label="Decrease ' + esc(entry.name) + ' quantity">−</button>' +
        '<input type="number" min="1" max="50" value="' + item.qty + '" data-qty="' + esc(item.variantId) + '" aria-label="' + esc(entry.name) + ' quantity">' +
        '<button type="button" data-inc="' + esc(item.variantId) + '" aria-label="Increase ' + esc(entry.name) + ' quantity">+</button></div>' +
        '<button class="text-button" type="button" data-remove="' + esc(item.variantId) + '">Remove</button></div></div>' +
        '<p class="line-total">' + money(item.qty * catalog.priceCents) + '</p></article>';
    }).join('');

    var shipLabel = cart.fulfillment === 'pickup'
      ? 'Free'
      : (shipping === 0 ? 'Free' : money(shipping));
    var fulfill = '<fieldset class="fulfill"><legend>How should we hand these off?</legend>' +
      '<label><input type="radio" name="fulfillment" value="ship"' + (cart.fulfillment === 'ship' ? ' checked' : '') + '>' +
      '<strong>Ship it</strong><small>USPS Ground Advantage, US only. $4.95 for one set, free on two or more. Ships within 2 business days.</small></label>' +
      '<label><input type="radio" name="fulfillment" value="pickup"' + (cart.fulfillment === 'pickup' ? ' checked' : '') + '>' +
      '<strong>Cafe pickup — free</strong><small>8340 La Palma Ave Ste R, Buena Park, CA 90620.</small></label></fieldset>';
    root.innerHTML =
      '<div class="cart-layout"><div class="cart-lines"><h2>Sets</h2>' + lines +
      (notes.length ? '<p class="cart-error">' + esc(notes.join(' ')) + '</p>' : '') +
      '</div><aside class="summary"><h2>Summary</h2>' + fulfill + '<ul class="totals">' +
      '<li><span>Subtotal</span><span>' + money(subtotal) + '</span></li>' +
      '<li><span>' + (cart.fulfillment === 'pickup' ? 'Pickup' : 'Shipping') + '</span><span>' + shipLabel + '</span></li>' +
      '<li><span>Total</span><span>' + money(subtotal + shipping) + '</span></li></ul>' +
      '<button class="button" type="button" id="checkout">Checkout</button>' +
      '<p class="fine" id="checkout-status" role="status">Tax is added at checkout when Stripe Tax is on. Guest checkout — no account. US addresses only.</p>' +
      '<p class="shop-links"><a href="/shop/shipping/">Shipping</a><a href="/shop/returns/">Returns</a><a href="/shop/privacy/">Privacy</a></p></aside></div>';

    function setLineQty(variantId, qty) {
      var next = loadCart();
      var amount = Number(qty);
      next.items.forEach(function (item) {
        if (item.variantId === variantId) {
          item.qty = Number.isInteger(amount) && amount > 0 ? Math.min(50, amount) : 1;
        }
      });
      saveCart(next);
      renderCart();
    }
    root.querySelectorAll('[data-qty]').forEach(function (input) {
      input.addEventListener('change', function () {
        setLineQty(input.getAttribute('data-qty'), Number(input.value));
      });
    });
    root.querySelectorAll('[data-dec]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-dec');
        var current = loadCart().items.find(function (item) { return item.variantId === id; });
        setLineQty(id, (current ? current.qty : 1) - 1);
      });
    });
    root.querySelectorAll('[data-inc]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-inc');
        var current = loadCart().items.find(function (item) { return item.variantId === id; });
        setLineQty(id, (current ? current.qty : 1) + 1);
      });
    });
    root.querySelectorAll('[data-remove]').forEach(function (button) {
      button.addEventListener('click', function () {
        var next = loadCart();
        next.items = next.items.filter(function (item) { return item.variantId !== button.getAttribute('data-remove'); });
        saveCart(next);
        renderCart();
      });
    });
    root.querySelectorAll('input[name="fulfillment"]').forEach(function (input) {
      input.addEventListener('change', function () {
        var next = loadCart();
        next.fulfillment = input.value === 'pickup' ? 'pickup' : 'ship';
        saveCart(next);
        renderCart();
      });
    });
    document.getElementById('checkout').addEventListener('click', startCheckout);
  }

  function startCheckout() {
    var cart = loadCart();
    var button = document.getElementById('checkout');
    var status = document.getElementById('checkout-status');
    if (!cart.items.length) return;
    button.disabled = true;
    status.textContent = 'Starting checkout…';
    var subtotal = totalQty(cart) * catalog.priceCents;
    var shipping = shippingCents(cart);
    track('begin_checkout', {
      currency: 'USD',
      value: (subtotal + shipping) / 100,
      items: cart.items.map(function (item) { return gaItem(item.variantId, item.qty); }),
    });
    api('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fulfillment: cart.fulfillment,
        items: cart.items,
        cartToken: cartToken(),
        replaceSessionId: sessionStorage.getItem(OPEN_KEY) || '',
      }),
    }).then(function (data) {
      if (!data.url) throw new Error('Checkout did not return a payment link.');
      sessionStorage.setItem(OPEN_KEY, data.sessionId || '');
      window.location.href = data.url;
    }).catch(function (error) {
      button.disabled = false;
      status.textContent = error.message;
      if (error.stock) {
        stockState = error.stock;
        renderCart();
        var again = document.getElementById('checkout-status');
        if (again) again.textContent = error.message;
      }
    });
  }

  function renderSuccess() {
    var root = document.getElementById('order-root');
    if (!root) return;
    var params = new URLSearchParams(window.location.search);
    var sessionId = params.get('session_id');
    if (!sessionId) {
      root.innerHTML = '<p>This page opens after Stripe Checkout. If you were charged, the receipt is in your email.</p>';
      return;
    }
    api('/api/checkout/session?session_id=' + encodeURIComponent(sessionId)).then(function (order) {
      var paid = order.paymentStatus === 'paid' || order.paymentStatus === 'no_payment_required';
      if (paid && !order.preview) {
        clearCart();
        sessionStorage.removeItem(OPEN_KEY);
        var seen = sessionStorage.getItem(PURCHASE_KEY) || '';
        if (seen.indexOf(order.id) === -1) {
          sessionStorage.setItem(PURCHASE_KEY, seen + ' ' + order.id);
          track('purchase', {
            transaction_id: order.id,
            currency: (order.currency || 'usd').toUpperCase(),
            value: (order.amountTotal || 0) / 100,
            shipping: (order.amountShipping || 0) / 100,
            tax: (order.amountTax || 0) / 100,
            items: (order.items || []).map(function (item) { return gaItem(item.variantId, item.qty); }),
          });
        }
      }
      var lines = (order.items || []).map(function (item) {
        return '<li><span>' + esc(item.name) + ' × ' + esc(item.qty) + '</span><span>' + money(item.qty * catalog.priceCents) + '</span></li>';
      }).join('');
      var handoff = order.fulfillment === 'pickup'
        ? 'Cafe pickup at 8340 La Palma Ave Ste R, Buena Park, CA 90620. We will have it ready at the counter.'
        : 'Ships within 2 business days via USPS Ground Advantage.';
      root.innerHTML =
        (order.preview ? '<p class="draft-banner confirm-banner">Sample order for layout review. No payment was taken.</p>' : '') +
        '<p>' + (paid ? 'Payment received.' : 'Payment is still processing. This page updates when Stripe marks it paid.') + '</p>' +
        (order.email ? '<p>Receipt email: <strong>' + esc(order.email) + '</strong></p>' : '') +
        '<ul class="order-lines">' + lines + '</ul>' +
        '<ul class="totals"><li><span>Subtotal</span><span>' + money(order.amountSubtotal || 0) + '</span></li>' +
        '<li><span>Shipping</span><span>' + money(order.amountShipping || 0) + '</span></li>' +
        '<li><span>Tax</span><span>' + money(order.amountTax || 0) + '</span></li>' +
        '<li><span>Total</span><span>' + money(order.amountTotal || 0) + '</span></li></ul>' +
        '<p>' + esc(handoff) + '</p>' +
        '<p class="fine">Order reference ' + esc(order.id) + '</p>';
    }).catch(function (error) {
      root.innerHTML = '<p class="cart-error">' + esc(error.message) + '</p>';
    });
  }

  function renderCancel() {
    var params = new URLSearchParams(window.location.search);
    var sessionId = params.get('session_id') || sessionStorage.getItem(OPEN_KEY);
    if (!sessionId) return;
    api('/api/checkout/abandon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId }),
    }).catch(function () {}).finally(function () {
      sessionStorage.removeItem(OPEN_KEY);
    });
  }

  function boot() {
    bindNav();
    paintCount();
    var page = document.body.getAttribute('data-shop-page');
    if (page === 'product') {
      bindProduct();
      fetchStock().then(function () {
        paintStockLines();
        paintProduct();
      }).catch(function () {
        var summary = document.getElementById('stock-summary');
        if (summary) summary.textContent = 'Stock did not load. Refresh to try again. Checkout stays closed until we can see what is left.';
        var add = document.getElementById('add-to-cart');
        if (add) add.disabled = true;
      });
    } else if (page === 'catalog') {
      fetchStock().then(paintStockLines).catch(function () {
        document.querySelectorAll('[data-stock-line]').forEach(function (node) {
          node.textContent = 'Stock did not load.';
        });
      });
    } else if (page === 'cart') {
      fetchStock().then(renderCart).catch(function () {
        stockState = null;
        renderCart();
      });
    } else if (page === 'success') {
      renderSuccess();
    } else if (page === 'cancel') {
      renderCancel();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
