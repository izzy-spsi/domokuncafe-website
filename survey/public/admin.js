(function () {
  const root = document.getElementById('admin-main');
  let user = null;
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
    if (!response.ok) {
      const error = new Error(data.message || 'Request failed');
      error.data = data;
      throw error;
    }
    return data;
  }
  function input(label, value, attrs) {
    const field = el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label })]);
    const box = el('input', Object.assign({ class: 'text-input', value: value == null ? '' : String(value) }, attrs || {}));
    field.appendChild(box);
    return { field, box };
  }
  function area(label, value) {
    const field = el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label })]);
    const box = el('textarea', { text: value || '' });
    field.appendChild(box);
    return { field, box };
  }
  function login(message) {
    const email = input('Email', '');
    const password = input('Password', '', { type: 'password' });
    const error = el('p', { class: 'field-error', text: message || '' });
    root.replaceChildren(el('div', {}, [el('h1', { text: 'Survey admin' }), el('form', { onsubmit: async (event) => {
      event.preventDefault();
      try { user = (await api('/api/staff/login', { method: 'POST', body: JSON.stringify({ email: email.box.value, password: password.box.value }) })).user; home(); }
      catch (err) { error.textContent = err.message; }
    } }, [email.field, password.field, el('button', { class: 'btn btn-primary', type: 'submit', text: 'Sign in' }), error])]));
  }
  function home() {
    const out = el('div', {});
    root.replaceChildren(el('div', {}, [
      el('h1', { text: 'Survey and promotions' }),
      el('p', { text: user.name + ' · ' + user.role + '. Live promotions stay off until launch terms are chosen.' }),
      el('div', { class: 'nav-row' }, [
        el('button', { class: 'btn btn-secondary', type: 'button', text: 'Surveys', onclick: surveys }),
        el('button', { class: 'btn btn-secondary', type: 'button', text: 'Promotions', onclick: promotions }),
        el('button', { class: 'btn btn-secondary', type: 'button', text: 'Campaigns', onclick: campaigns }),
        user.role === 'admin' ? el('button', { class: 'btn btn-secondary', type: 'button', text: 'Access', onclick: access }) : null,
        el('a', { class: 'btn btn-secondary', href: '/survey/reports', text: 'Reports' })
      ]),
      out
    ]));
    surveys();
  }
  async function surveys() {
    const data = await api('/api/admin/surveys');
    const list = el('div', {});
    data.surveys.forEach((survey) => list.appendChild(el('p', {}, [
      el('button', { class: 'btn btn-secondary', type: 'button', text: (survey.title || survey.slug) + ' (' + survey.status + ')', onclick: () => editSurvey(survey.id) })
    ])));
    const title = input('New survey title', '');
    root.querySelector('h1').textContent = 'Surveys';
    const host = root.querySelector('div > div:last-child') || root;
    const mount = root.children[0].lastElementChild;
    mount.replaceChildren(list, title.field, el('button', { class: 'btn btn-primary', type: 'button', text: 'Create survey', onclick: async () => { await api('/api/admin/surveys', { method: 'POST', body: JSON.stringify({ title: title.box.value }) }); surveys(); } }));
  }
  async function editSurvey(id) {
    const data = await api('/api/admin/surveys/' + id);
    const draft = [...data.versions].reverse().find((version) => version.state === 'draft') || data.versions[data.versions.length - 1];
    const schema = JSON.parse(JSON.stringify(draft.schema));
    const title = input('Title', draft.title);
    const intro = area('Introduction', draft.intro);
    const editor = el('div', {});
    function paint() {
      editor.replaceChildren();
      schema.questions.forEach((question, index) => {
        const label = input('Question label', question.label);
        label.box.addEventListener('input', () => { question.label = label.box.value; });
        const required = el('input', { type: 'checkbox' });
        required.checked = question.required !== false;
        required.addEventListener('change', () => { question.required = required.checked; });
        const block = el('section', { class: 'card' }, [el('h3', { text: question.type }), label.field, el('label', { class: 'choice' }, [required, el('span', { text: 'Required' })])]);
        (question.options || []).forEach((option) => {
          const optionLabel = input('Option', option.label);
          optionLabel.box.addEventListener('input', () => { option.label = optionLabel.box.value; });
          const exclusive = el('input', { type: 'checkbox' });
          exclusive.checked = Boolean(option.exclusive);
          exclusive.addEventListener('change', () => { option.exclusive = exclusive.checked; });
          block.appendChild(optionLabel.field);
          if (question.type === 'multi') block.appendChild(el('label', { class: 'choice' }, [exclusive, el('span', { text: 'Exclusive' })]));
        });
        block.appendChild(el('button', { class: 'btn btn-secondary', type: 'button', text: 'Move up', onclick: () => { if (index === 0) return; const step = schema.steps.find((item) => item.questionIds.includes(question.id)); schema.questions.splice(index - 1, 0, schema.questions.splice(index, 1)[0]); if (step) { const at = step.questionIds.indexOf(question.id); if (at > 0) step.questionIds.splice(at - 1, 0, step.questionIds.splice(at, 1)[0]); } paint(); } }));
        editor.appendChild(block);
      });
    }
    paint();
    const message = el('p', { role: 'status' });
    async function save() {
      const saved = await api('/api/admin/surveys/' + id + '/draft', { method: 'PUT', body: JSON.stringify({ title: title.box.value, intro: intro.box.value, schema }) });
      message.textContent = 'Draft saved. Question and option ids stay stable when the wording is unchanged.';
      return saved;
    }
    root.replaceChildren(el('div', {}, [
      el('button', { class: 'btn btn-secondary', type: 'button', text: 'Back', onclick: home }),
      el('h1', { text: 'Edit survey' }),
      title.field, intro.field, editor, message,
      el('div', { class: 'nav-row' }, [
        el('button', { class: 'btn btn-primary', type: 'button', text: 'Save draft', onclick: () => save().catch((error) => { message.textContent = error.message; }) }),
        el('button', { class: 'btn btn-primary', type: 'button', text: 'Publish', onclick: () => save().then(() => api('/api/admin/surveys/' + id + '/publish', { method: 'POST', body: '{}' })).then(() => { message.textContent = 'Published. The previous version is unchanged.'; }).catch((error) => { message.textContent = error.message; }) }),
        el('button', { class: 'btn btn-secondary', type: 'button', text: 'Preview on mobile', onclick: () => { sessionStorage.setItem('domoSurveyPreview', JSON.stringify(Object.assign({ title: title.box.value, intro: intro.box.value }, schema))); window.open('/survey/preview', 'preview', 'width=420,height=800'); } }),
        el('button', { class: 'btn btn-secondary', type: 'button', text: 'Duplicate', onclick: () => api('/api/admin/surveys/' + id + '/duplicate', { method: 'POST', body: '{}' }).then(home) }),
        el('button', { class: 'btn btn-secondary', type: 'button', text: 'Archive', onclick: () => api('/api/admin/surveys/' + id + '/archive', { method: 'POST', body: JSON.stringify({ reason: 'Archive from editor' }) }).then(home) })
      ])
    ]));
  }
  async function promotions() {
    const data = await api('/api/admin/promotions');
    const list = el('div', {});
    data.promotions.forEach((promo) => list.appendChild(el('p', {}, [el('button', { class: 'btn btn-secondary', type: 'button', text: (promo.name || promo.slug) + ' · ' + promo.lifecycle + (promo.is_default ? ' · default' : '') + (promo.test_data ? ' · TEST' : ''), onclick: () => editPromotion(promo.id) })])));
    root.replaceChildren(el('div', {}, [el('button', { class: 'btn btn-secondary', type: 'button', text: 'Back', onclick: home }), el('h1', { text: 'Promotions' }), list, el('button', { class: 'btn btn-primary', type: 'button', text: 'New test promotion', onclick: async () => {
      const created = await api('/api/admin/promotions', { method: 'POST', body: JSON.stringify({ name: 'TEST new offer', description: 'TEST PROMOTION for rehearsal only.', rewardType: 'percent_off', rewardDetails: { percent: 10, quantity: 1, eligibleItems: 'TEST check' }, guestTerms: 'TEST ONLY. Not a live offer and not real inventory.', staffInstructions: 'TEST ONLY. Do not apply this in the POS.', testData: true, startsAtLocal: '2026-01-01T00:00', endsAtLocal: '2027-01-01T00:00', expiryRule: { type: 'duration', hours: 24, minutes: 0 }, eligibility: { dineIn: true, stacking: 'none' } }) });
      editPromotion(created.promotion_id);
    } })]));
  }
  async function editPromotion(id) {
    const data = await api('/api/admin/promotions/' + id);
    const version = [...data.versions].reverse().find((item) => item.state === 'draft') || data.versions[data.versions.length - 1];
    const fields = {
      name: input('Guest-facing name', version.name),
      description: area('Description', version.description),
      guestTerms: area('Exact guest terms', version.guestTerms),
      staffInstructions: area('Staff instructions', version.staffInstructions),
      percent: input('Percent, if percentage off', version.rewardDetails.percent || ''),
      amount: input('Amount in USD cents, if fixed', version.rewardDetails.amountCents || ''),
      purchased: input('BOGO purchased item', version.rewardDetails.purchasedItem || ''),
      rewardItem: input('BOGO reward item', version.rewardDetails.rewardItem || ''),
      items: input('Eligible items', version.rewardDetails.eligibleItems || ''),
      quantity: input('Quantity per reward', version.rewardDetails.quantity || 1),
      starts: input('Window start, Pacific', version.startsAtLocal),
      ends: input('Window end, Pacific, exclusive', version.endsAtLocal),
      totalCap: input('Total cap, blank for unlimited', version.totalCap),
      dailyCap: input('Daily cap, blank for unlimited', version.dailyCap),
      supply: input('Physical supply, blank if not a gift count', version.physicalSupply)
    };
    const type = el('select', { 'aria-label': 'Reward type' });
    ['percent_off', 'fixed_amount', 'bogo', 'free_food_drink', 'merchandise', 'other_gift'].forEach((item) => {
      const option = el('option', { value: item, text: item });
      if (item === version.rewardType) option.selected = true;
      type.appendChild(option);
    });
    const message = el('p', { role: 'status' });
    function body() {
      return {
        name: fields.name.box.value, description: fields.description.box.value, rewardType: type.value, testData: true,
        guestTerms: fields.guestTerms.box.value, staffInstructions: fields.staffInstructions.box.value,
        rewardDetails: { percent: fields.percent.box.value, amountCents: fields.amount.box.value, purchasedItem: fields.purchased.box.value, rewardItem: fields.rewardItem.box.value, eligibleItems: fields.items.box.value, quantity: fields.quantity.box.value },
        eligibility: { dineIn: true, stacking: 'none', minimumCents: null, excludedCategories: [] },
        startsAtLocal: fields.starts.box.value, endsAtLocal: fields.ends.box.value,
        expiryRule: version.expiryRule || { type: 'duration', hours: 24, minutes: 0 },
        totalCap: fields.totalCap.box.value, dailyCap: fields.dailyCap.box.value, physicalSupply: fields.supply.box.value
      };
    }
    root.replaceChildren(el('div', {}, [el('button', { class: 'btn btn-secondary', type: 'button', text: 'Back', onclick: promotions }), el('h1', { text: 'Edit promotion' }), el('p', { text: 'Lifecycle ' + data.promotion.lifecycle + (data.promotion.test_data ? ' · TEST data' : '') }), type].concat(Object.values(fields).map((field) => field.field), [
      message,
      el('div', { class: 'nav-row' }, [
        el('button', { class: 'btn btn-primary', type: 'button', text: 'Save draft', onclick: () => api('/api/admin/promotions/' + id + '/draft', { method: 'PUT', body: JSON.stringify(body()) }).then(() => { message.textContent = 'Draft saved.'; }).catch((error) => { message.textContent = error.message; }) }),
        el('button', { class: 'btn btn-primary', type: 'button', text: 'Activate', onclick: () => api('/api/admin/promotions/' + id + '/draft', { method: 'PUT', body: JSON.stringify(body()) }).then(() => api('/api/admin/promotions/' + id + '/lifecycle', { method: 'POST', body: JSON.stringify({ lifecycle: 'active', reason: 'Activate test promotion' }) })).then((result) => { message.textContent = 'Lifecycle ' + result.lifecycle; }).catch((error) => { message.textContent = error.message; }) }),
        el('button', { class: 'btn btn-secondary', type: 'button', text: 'Pause', onclick: () => api('/api/admin/promotions/' + id + '/lifecycle', { method: 'POST', body: JSON.stringify({ lifecycle: 'paused', reason: 'Pause issuance' }) }).then(() => { message.textContent = 'Paused. Existing rewards stay valid.'; }) }),
        el('button', { class: 'btn btn-secondary', type: 'button', text: 'End', onclick: () => api('/api/admin/promotions/' + id + '/lifecycle', { method: 'POST', body: JSON.stringify({ lifecycle: 'ended', reason: 'End issuance' }) }).then(() => { message.textContent = 'Ended. Existing rewards stay valid.'; }) }),
        el('button', { class: 'btn btn-secondary', type: 'button', text: 'Make default for /survey', onclick: () => api('/api/admin/promotions/' + id + '/default', { method: 'POST', body: JSON.stringify({ isDefault: true }) }).then(() => { message.textContent = 'This is now the explicit default.'; }) }),
        el('button', { class: 'btn btn-secondary', type: 'button', text: 'Update capacity', onclick: () => api('/api/admin/promotions/' + id + '/capacity', { method: 'POST', body: JSON.stringify({ totalCap: fields.totalCap.box.value, dailyCap: fields.dailyCap.box.value, physicalSupply: fields.supply.box.value, reason: 'Manager adjusted supply' }) }).then(() => { message.textContent = 'Capacity updated. Issued count was not reduced.'; }).catch((error) => { message.textContent = error.message; }) })
      ])
    ])));
  }
  async function campaigns() {
    const data = await api('/api/admin/campaigns');
    const promos = await api('/api/admin/promotions');
    const list = el('div', {});
    for (const campaign of data.campaigns) {
      const row = el('p', { text: campaign.slug + ' · ' + campaign.channel + ' / ' + campaign.placement + ' · ' });
      row.appendChild(el('button', { class: 'btn btn-secondary', type: 'button', text: 'QR', onclick: async () => {
        const qr = await api('/api/admin/campaigns/' + campaign.id + '/qr');
        row.appendChild(el('img', { class: 'qr', alt: 'QR code for ' + qr.url, src: qr.qrDataUrl }));
        row.appendChild(el('a', { href: qr.url, text: qr.url }));
      } }));
      list.appendChild(row);
    }
    const name = input('Campaign name', 'TEST campaign');
    const slug = input('Slug', 'test-link');
    const channel = input('Channel', 'table_tent');
    const placement = input('Placement', 'table_tent');
    const select = el('select', { 'aria-label': 'Promotion' });
    promos.promotions.forEach((promo) => select.appendChild(el('option', { value: promo.id, text: promo.name || promo.slug })));
    root.replaceChildren(el('div', {}, [el('button', { class: 'btn btn-secondary', type: 'button', text: 'Back', onclick: home }), el('h1', { text: 'Campaign links' }), list, name.field, slug.field, channel.field, placement.field, select, el('button', { class: 'btn btn-primary', type: 'button', text: 'Create link', onclick: async () => {
      await api('/api/admin/campaigns', { method: 'POST', body: JSON.stringify({ name: name.box.value, slug: slug.box.value, channel: channel.box.value, placement: placement.box.value, promotionId: select.value, utm: {} }) });
      campaigns();
    } })]));
  }
  async function access() {
    const data = await api('/api/admin/staff');
    const list = el('div', {});
    data.staff.forEach((person) => list.appendChild(el('p', { text: person.name + ' · ' + person.email + ' · ' + person.role + (person.active ? '' : ' · inactive') })));
    const name = input('Name', '');
    const email = input('Email', '');
    const role = el('select', { 'aria-label': 'Role' }, [el('option', { value: 'staff', text: 'Server or cashier' }), el('option', { value: 'manager', text: 'Manager' }), el('option', { value: 'admin', text: 'Owner or admin' })]);
    const password = input('Temporary password', '', { type: 'password' });
    const message = el('p', { role: 'status' });
    root.replaceChildren(el('div', {}, [el('button', { class: 'btn btn-secondary', type: 'button', text: 'Back', onclick: home }), el('h1', { text: 'Staff access' }), list, name.field, email.field, role, password.field, el('button', { class: 'btn btn-primary', type: 'button', text: 'Create login', onclick: async () => {
      try { await api('/api/admin/staff', { method: 'POST', body: JSON.stringify({ name: name.box.value, email: email.box.value, role: role.value, password: password.box.value }) }); message.textContent = 'Login created.'; access(); }
      catch (error) { message.textContent = error.message; }
    } }), message]));
  }
  api('/api/staff/me').then((data) => { user = data.user; if (user.role === 'staff') { root.textContent = 'Servers cannot open survey admin.'; return; } home(); }).catch(() => login());
})();
