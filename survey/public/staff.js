(function () {
  const root = document.getElementById('staff-main');
  const params = new URLSearchParams(window.location.search);
  let user = null;
  let current = null;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value == null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, String(value));
    });
    (children || []).forEach((child) => { if (child) node.appendChild(child); });
    return node;
  }

  async function api(url, options) {
    const response = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }, options || {}));
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || 'Request failed');
      error.data = data;
      throw error;
    }
    return data;
  }

  function shell(children) {
    root.replaceChildren(el('div', {}, [
      el('img', { class: 'logo', src: '/survey-assets/brand/domo-cafe-logo.png', alt: 'Domo Cafe' }),
      el('p', { class: 'kicker', text: 'Staff rewards' })
    ].concat(children)));
  }

  function fallback() {
    return el('section', { class: 'card' }, [
      el('h2', { text: 'If this page cannot reach the service' }),
      el('p', { text: 'Do not treat a screenshot as validation. Ask the manager to handle a courtesy benefit and record the code and check reference for reconciliation. Mark it as an exception, not a verified redemption.' })
    ]);
  }

  function loginView(message) {
    const email = el('input', { class: 'text-input', type: 'email', autocomplete: 'username', 'aria-label': 'Email' });
    const password = el('input', { class: 'text-input', type: 'password', autocomplete: 'current-password', 'aria-label': 'Password' });
    const error = el('p', { class: 'field-error', role: 'alert', text: message || '' });
    shell([
      el('h1', { text: 'Sign in' }),
      el('form', { class: 'stack', onsubmit: async (event) => {
        event.preventDefault();
        try {
          const result = await api('/api/staff/login', { method: 'POST', body: JSON.stringify({ email: email.value, password: password.value }) });
          user = result.user;
          lookupView();
          if (params.get('code')) find(params.get('code'));
        } catch (err) { error.textContent = err.message; }
      } }, [email, password, el('button', { class: 'btn btn-primary', type: 'submit', text: 'Sign in' }), error]),
      fallback()
    ]);
  }

  function lookupView() {
    const code = el('input', { class: 'text-input', 'aria-label': 'Reward code', value: params.get('code') || '' });
    const box = el('div', { id: 'reward-box' });
    shell([
      el('h1', { text: 'Look up a reward' }),
      el('p', { text: user.name + ' · ' + user.role }),
      el('form', { class: 'stack', onsubmit: (event) => { event.preventDefault(); find(code.value); } }, [
        code,
        el('button', { class: 'btn btn-primary', type: 'submit', text: 'Look up' })
      ]),
      box,
      el('button', { class: 'btn btn-secondary', type: 'button', text: 'Sign out', onclick: async () => { await api('/api/staff/logout', { method: 'POST', body: '{}' }); user = null; loginView(); } }),
      fallback()
    ]);
  }

  async function find(code) {
    const box = document.getElementById('reward-box');
    try {
      current = await api('/api/staff/rewards/' + encodeURIComponent(code));
      paintReward(box, current, '');
    } catch (error) {
      box.replaceChildren(el('p', { class: 'field-error', role: 'alert', text: error.message }));
    }
  }

  function paintReward(box, payload, message) {
    const reward = payload.reward || payload;
    const parts = [el('h2', { text: reward.title || reward.code })];
    if (reward.testData) parts.push(el('div', { class: 'banner banner-test' }, [el('strong', { text: 'TEST reward. Do not apply a real discount or give live inventory.' })]));
    parts.push(el('p', { class: 'reward-code', text: reward.code }));
    parts.push(el('p', {}, [el('span', { class: 'status-pill', text: reward.status })]));
    parts.push(el('p', { text: 'Expires ' + reward.expiresAtLabel }));
    parts.push(el('p', { text: reward.guestTerms || '' }));
    parts.push(el('h3', { text: 'Staff instructions' }));
    parts.push(el('p', { text: reward.staffInstructions || '' }));
    if (reward.redemption) {
      const fulfillment = reward.redemption.needsFulfillment ? 'Needs fulfillment' : reward.redemption.fulfillmentState;
      parts.push(el('p', { text: 'Redeemed ' + reward.redemption.redeemedAtLabel + '. Fulfillment: ' + fulfillment }));
      if (reward.redemption.checkReference) parts.push(el('p', { text: 'Check reference: ' + reward.redemption.checkReference }));
    }
    if (message) parts.push(el('p', { role: 'status', text: message }));
    if (reward.status === 'issued') {
      const check = el('input', { class: 'text-input', 'aria-label': 'Check reference, optional', placeholder: 'Check reference, optional' });
      parts.push(check);
      parts.push(el('button', { class: 'btn btn-primary', type: 'button', text: 'Redeem', onclick: () => act('redeem', { idempotencyKey: crypto.randomUUID(), checkReference: check.value }) }));
    }
    if (reward.status === 'redeemed' && reward.redemption && reward.redemption.needsFulfillment) {
      parts.push(el('button', { class: 'btn btn-primary', type: 'button', text: 'Fulfillment complete', onclick: () => act('fulfill', { state: 'completed' }) }));
      parts.push(el('button', { class: 'btn btn-secondary', type: 'button', text: 'Fulfillment failed', onclick: () => act('fulfill', { state: 'failed', note: 'Item or discount could not be completed' }) }));
    }
    if (user.role === 'manager' || user.role === 'admin') {
      const reason = el('input', { class: 'text-input', 'aria-label': 'Exception reason', placeholder: 'Exception reason' });
      parts.push(reason);
      parts.push(el('button', { class: 'btn btn-secondary', type: 'button', text: 'Reverse accidental redemption', onclick: () => act('reverse', { reason: reason.value, confirmNoBenefit: true }) }));
      parts.push(el('button', { class: 'btn btn-secondary', type: 'button', text: 'Void issued reward', onclick: () => act('void', { reason: reason.value }) }));
      parts.push(el('button', { class: 'btn btn-secondary', type: 'button', text: 'Record courtesy action', onclick: () => act('courtesy', { reason: reason.value }) }));
    }
    box.replaceChildren(el('section', { class: 'card' }, parts));
  }

  async function act(kind, body) {
    const box = document.getElementById('reward-box');
    try {
      const result = await api('/api/staff/rewards/' + encodeURIComponent(current.code || current.reward.code) + '/' + kind, { method: 'POST', body: JSON.stringify(body) });
      current = result;
      const note = result.duplicate ? 'This code was already redeemed. Do not give the reward again.' : 'Saved.';
      paintReward(box, result, note);
    } catch (error) {
      const alert = el('p', { class: 'field-error', role: 'alert', text: error.message });
      box.appendChild(alert);
    }
  }

  async function init() {
    try { user = (await api('/api/staff/me')).user; } catch (_) { user = null; }
    if (!user) return loginView();
    lookupView();
    if (params.get('code')) find(params.get('code'));
  }
  init();
})();
