(function () {
  const root = document.getElementById('reports-main');
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value == null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, String(value));
    });
    (children || []).forEach((child) => child && node.appendChild(child));
    return node;
  }
  async function api(url, options) {
    const response = await fetch(url, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, options || {}));
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Request failed');
    return data;
  }
  function login(message) {
    const email = el('input', { class: 'text-input', type: 'email', 'aria-label': 'Email' });
    const password = el('input', { class: 'text-input', type: 'password', 'aria-label': 'Password' });
    const error = el('p', { class: 'field-error', text: message || '' });
    root.replaceChildren(el('div', {}, [
      el('h1', { text: 'Survey reports' }),
      el('form', { class: 'stack', onsubmit: async (event) => {
        event.preventDefault();
        try {
          await api('/api/staff/login', { method: 'POST', body: JSON.stringify({ email: email.value, password: password.value }) });
          dashboard();
        } catch (err) { error.textContent = err.message; }
      } }, [email, password, el('button', { class: 'btn btn-primary', type: 'submit', text: 'Sign in' }), error])
    ]));
  }
  async function dashboard() {
    const from = el('input', { class: 'text-input', type: 'date', 'aria-label': 'From date, Pacific' });
    const to = el('input', { class: 'text-input', type: 'date', 'aria-label': 'To date, Pacific' });
    const first = el('select', { 'aria-label': 'First visit' }, [el('option', { value: '', text: 'All respondents' }), el('option', { value: 'first_time', text: 'First visit' }), el('option', { value: 'returning', text: 'Returning' })]);
    const include = el('input', { type: 'checkbox', id: 'include-test' });
    const out = el('div', {});
    async function load() {
      const query = new URLSearchParams({ from: from.value, to: to.value, firstVisit: first.value, includeTest: include.checked ? '1' : '0' });
      const overview = await api('/api/reports/overview?' + query.toString());
      const detail = await api('/api/reports/breakdowns?' + query.toString());
      const cards = el('div', { class: 'stack' });
      Object.entries(overview.overview).forEach(([key, value]) => {
        cards.appendChild(el('section', { class: 'card metric' }, [el('span', { text: key }), el('b', { text: String(value) })]));
      });
      const notes = el('section', { class: 'card' });
      Object.entries(overview.definitions).forEach(([key, value]) => notes.appendChild(el('p', { text: key + ': ' + value })));
      notes.appendChild(el('p', { text: 'Date basis: ' + overview.dateBasis.responses + ' Reward counts: ' + overview.dateBasis.rewards }));
      if (overview.rates.cohortIncomplete) notes.appendChild(el('p', { text: 'This start-date cohort includes attempts from the last 24 hours and is incomplete.' }));
      notes.appendChild(el('p', { text: 'Completion rate ' + formatRate(overview.rates.completionRate) + ' (' + overview.rates.completionNumerator + ' / ' + overview.rates.completionDenominator + ').' }));
      notes.appendChild(el('p', { text: 'Redemption rate ' + formatRate(overview.rates.rewardRedemptionRate) + '. Pending fulfillment ' + overview.overview.pendingFulfillment + '. Expired ' + overview.overview.expiredRewards + '.' }));
      notes.appendChild(el('p', { text: 'Reported party attendance ' + overview.rates.reportedPartyAttendance + '. This is reported attendance across responses, not unique visitors.' }));
      const links = el('p', {}, [
        el('a', { href: '/api/reports/export/responses.csv?' + query.toString(), text: 'Download responses CSV' }),
        document.createTextNode(' · '),
        el('a', { href: '/api/reports/export/rewards.csv?' + query.toString(), text: 'Download rewards CSV' })
      ]);
      out.replaceChildren(cards, notes, links, renderQuestions(detail.questions), renderOrigins(detail.origins));
    }
    root.replaceChildren(el('div', {}, [
      el('h1', { text: 'Survey reports' }),
      el('p', { text: 'Counts describe respondents and their reported visits. They are not unique customers and they do not prove revenue.' }),
      el('div', { class: 'nav-row' }, [from, to, first, el('label', { class: 'choice' }, [include, el('span', { text: 'Include test data' })]), el('button', { class: 'btn btn-primary', type: 'button', text: 'Apply', onclick: () => load().catch((error) => { out.textContent = error.message; }) })]),
      out
    ]));
    load().catch((error) => { out.textContent = error.message; });
  }
  function formatRate(value) { return value == null ? 'n/a' : Math.round(value * 1000) / 10 + '%'; }
  function renderQuestions(questions) {
    const box = el('section', { class: 'card' }, [el('h2', { text: 'Answers' })]);
    (questions || []).forEach((question) => {
      box.appendChild(el('h3', { text: question.label }));
      (question.options || []).forEach((option) => {
        box.appendChild(el('p', { text: option.label + ': ' + option.count + ' (' + formatRate(option.share) + ' of responses to this question)' }));
      });
    });
    return box;
  }
  function renderOrigins(origins) {
    const box = el('section', { class: 'card' }, [el('h2', { text: 'Where respondents said they live' })]);
    (origins || []).forEach((row) => box.appendChild(el('p', { text: [row.locality || (row.unmapped ? 'Unmapped ZIP' : 'Not provided'), row.postalCode, row.countryCode].filter(Boolean).join(', ') + ' — ' + row.count })));
    return box;
  }
  api('/api/staff/me').then((data) => {
    if (data.user.role === 'staff') { root.textContent = 'Servers cannot open reports.'; return; }
    dashboard();
  }).catch(() => login());
})();
