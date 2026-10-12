(function () {
  const root = document.getElementById('survey-main');
  const path = window.location.pathname.replace(/\/$/, '') || '/survey';
  const params = new URLSearchParams(window.location.search);
  const campaign = (path.match(/^\/survey\/c\/([a-z0-9-]+)$/) || [])[1] || '';
  const rewardToken = (path.match(/^\/survey\/r\/([A-Za-z0-9_-]+)$/) || [])[1] || '';
  const preview = path === '/survey/preview';
  const entryKey = campaign || 'default';
  const draftKey = 'domoSurveyDraftV1';
  const resultKey = 'domoSurveyResultV1:' + entryKey;
  const walletKey = 'domoSurveyWalletV1';

  const state = { ctx: null, draft: null, step: 0, busy: false, notice: '' };

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value == null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, value);
    });
    (children || []).forEach((child) => { if (child) node.appendChild(child); });
    return node;
  }

  function logo() {
    return el('img', { class: 'logo', src: '/survey-assets/brand/domo-cafe-logo.png', alt: 'Domo Cafe' });
  }

  function readDraft() {
    try {
      const parsed = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (!parsed || parsed.entry !== entryKey) return null;
      if (Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) return null;
      return parsed;
    } catch (_) { return null; }
  }

  function saveDraft() {
    if (!state.draft) return;
    state.draft.savedAt = Date.now();
    state.draft.entry = entryKey;
    localStorage.setItem(draftKey, JSON.stringify(state.draft));
  }

  function wallet() {
    try { return JSON.parse(localStorage.getItem(walletKey) || '[]'); } catch (_) { return []; }
  }

  function rememberReward(result) {
    if (!result || !result.reward) return;
    const items = wallet().filter((item) => item.code !== result.reward.code);
    items.unshift({ code: result.reward.code, token: result.reward.token || '', title: result.reward.title, savedAt: Date.now() });
    localStorage.setItem(walletKey, JSON.stringify(items.slice(0, 5)));
  }

  async function api(url, options) {
    const response = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }, options || {}));
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || 'Request failed');
      error.data = data;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function questions() {
    return (state.ctx && state.ctx.survey && state.ctx.survey.schema.questions) || [];
  }

  function steps() {
    return (state.ctx && state.ctx.survey && state.ctx.survey.schema.steps) || [];
  }

  function questionById(id) {
    return questions().find((question) => question.id === id);
  }

  function answer(id) {
    return state.draft.answers[id];
  }

  function setAnswer(id, value) {
    state.draft.answers[id] = value;
    saveDraft();
  }

  function render(node) {
    root.replaceChildren(node);
  }

  function banner(text, kind) {
    return el('div', { class: 'banner banner-' + kind, role: 'status' }, [el('strong', { text: text })]);
  }

  function showLanding() {
    const offer = state.ctx.offer;
    const availability = state.ctx.availability || {};
    const parts = [logo(), el('p', { class: 'kicker', text: 'Guest survey' }), el('h1', { text: state.ctx.survey ? state.ctx.survey.title : 'Survey' })];
    if (state.ctx.testData || (offer && offer.testData)) {
      parts.push(banner('TEST PROMOTION. This is sample data for rehearsal. It is not a live Domo Cafe offer and it does not use real inventory.', 'test'));
    }
    if (state.notice) parts.push(banner(state.notice, 'bad'));
    if (state.ctx.survey) {
      parts.push(el('p', { class: 'lede', text: state.ctx.survey.intro }));
    }
    if (offer) {
      const card = el('section', { class: 'card' }, [
        el('h2', { text: offer.name }),
        el('p', { text: offer.description }),
        el('p', { text: offer.guestTerms }),
        el('p', { text: offer.expiryPreview }),
        el('p', { text: offer.quantityNote })
      ]);
      (offer.eligibility || []).forEach((line) => card.appendChild(el('p', { class: 'fine', text: line })));
      parts.push(card);
    }
    if (!availability.issuable) {
      parts.push(banner(availability.label || 'This offer is not available.', 'warn'));
      if (state.ctx.currentOfferPath) {
        parts.push(el('a', { class: 'btn btn-secondary', href: state.ctx.currentOfferPath, text: 'See the current offer' }));
      }
    }
    if (state.ctx.canStart && state.ctx.survey) {
      const label = availability.issuable ? 'Start the survey' : 'Continue without a reward';
      parts.push(el('button', { class: 'btn btn-primary', type: 'button', onclick: start, text: label }));
    }
    const saved = wallet()[0];
    if (saved && saved.token) {
      parts.push(el('p', {}, [el('a', { href: '/survey/r/' + saved.token, text: 'Reopen a reward saved on this device' })]));
    }
    parts.push(el('p', { class: 'fine', text: 'An anonymous reward cannot be recovered on another device without its code or link. No name, phone number, or email is required.' }));
    parts.push(el('p', {}, [el('a', { href: state.ctx.privacyUrl || '/survey/privacy', text: 'Privacy notice' })]));
    render(el('div', {}, parts));
  }

  async function start() {
    if (state.busy) return;
    state.busy = true;
    try {
      if (!state.draft.attemptId) {
        const created = await api('/api/survey-attempts', {
          method: 'POST',
          body: JSON.stringify({
            campaignSlug: campaign || null,
            placement: params.get('placement'),
            utm_source: params.get('utm_source'),
            utm_medium: params.get('utm_medium'),
            utm_campaign: params.get('utm_campaign'),
            utm_content: params.get('utm_content')
          })
        });
        state.draft.attemptId = created.attemptId;
        state.draft.promotionVersionId = created.promotionVersionId;
        if (!state.draft.idempotencyKey) state.draft.idempotencyKey = crypto.randomUUID();
        saveDraft();
      }
      state.step = state.draft.step || 0;
      showStep();
    } catch (error) {
      state.notice = (error.data && error.data.message) || 'The survey could not be started. Your notes are still on this device.';
      showLanding();
    } finally { state.busy = false; }
  }

  function showStep() {
    const step = steps()[state.step];
    if (!step) return showLanding();
    state.draft.step = state.step;
    saveDraft();
    const parts = [logo(), progress(), el('h1', { text: step.title })];
    if (state.notice) parts.push(el('div', { class: 'banner banner-bad', role: 'alert', text: state.notice }));
    (step.questionIds || []).forEach((id) => parts.push(renderQuestion(questionById(id))));
    const actions = el('div', { class: 'actions' });
    if (state.step > 0) actions.appendChild(el('button', { class: 'btn btn-secondary', type: 'button', text: 'Back', onclick: () => { state.notice = ''; state.step -= 1; showStep(); } }));
    const last = state.step === steps().length - 1;
    actions.appendChild(el('button', {
      class: 'btn btn-primary', type: 'button', text: last ? 'Submit survey' : 'Next',
      onclick: () => last ? submit('issue') : next()
    }));
    parts.push(actions);
    render(el('div', {}, parts));
  }

  function progress() {
    const total = steps().length;
    const track = el('div', { class: 'progress-track' });
    for (let i = 0; i < total; i += 1) {
      const status = i < state.step ? 'done' : i === state.step ? 'current' : 'upcoming';
      track.appendChild(el('span', { 'data-state': status }));
    }
    return el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(total), 'aria-valuenow': String(state.step + 1), 'aria-valuetext': 'Step ' + (state.step + 1) + ' of ' + total }, [
      el('div', { class: 'progress-text', text: 'Step ' + (state.step + 1) + ' of ' + total }),
      track
    ]);
  }

  function renderQuestion(question) {
    if (!question) return null;
    const field = el('fieldset', { class: 'field', id: 'field-' + question.id });
    field.appendChild(el('legend', { class: 'field-label', text: question.label }));
    const error = state.draft.errors && state.draft.errors[question.id];
    if (question.type === 'single') field.appendChild(choices(question, false));
    if (question.type === 'multi') field.appendChild(choices(question, true));
    if (question.type === 'integer') {
      const input = el('input', {
        class: 'text-input', id: question.id, inputmode: 'numeric', type: 'text', autocomplete: 'off',
        value: answer(question.id) == null ? '' : String(answer(question.id))
      });
      input.addEventListener('input', () => {
        const trimmed = input.value.trim();
        setAnswer(question.id, trimmed === '' ? null : Number(trimmed));
      });
      field.appendChild(input);
    }
    if (question.type === 'short_text') {
      const input = el('input', { class: 'text-input', type: 'text', maxlength: '200', value: answer(question.id) || '' });
      input.addEventListener('input', () => setAnswer(question.id, input.value));
      field.appendChild(input);
    }
    if (question.type === 'location') field.appendChild(locationField(question));
    if (error) {
      field.setAttribute('aria-invalid', 'true');
      field.appendChild(el('p', { class: 'field-error', id: question.id + '-error', role: 'alert', text: error }));
    }
    return field;
  }

  function choices(question, multi) {
    const wrap = el('div', {});
    const selected = multi ? ((answer(question.id) && answer(question.id).optionIds) || []) : [];
    const single = !multi && answer(question.id) ? answer(question.id).optionId : '';
    question.options.forEach((option) => {
      const input = el('input', { type: multi ? 'checkbox' : 'radio', name: question.id, value: option.id });
      if (multi) input.checked = selected.includes(option.id);
      else input.checked = single === option.id;
      input.addEventListener('change', () => {
        if (!multi) {
          setAnswer(question.id, { optionId: option.id, text: answer(question.id) && answer(question.id).text });
          showStep();
          return;
        }
        const next = window.DomoSurveyLogic.toggleMulti(selected, option, question.options, question.maxChoices || 0);
        if (next && next.error) {
          state.notice = next.error;
          showStep();
          return;
        }
        state.notice = '';
        setAnswer(question.id, { optionIds: next, text: answer(question.id) && answer(question.id).text });
        showStep();
      });
      wrap.appendChild(el('label', { class: 'choice' }, [input, el('span', { text: option.label })]));
    });
    const chosen = multi ? question.options.filter((option) => selected.includes(option.id)) : question.options.filter((option) => option.id === single);
    if (chosen.some((option) => option.allowsText)) {
      const text = el('input', {
        class: 'text-input', type: 'text', maxlength: '200', placeholder: 'Optional detail',
        value: (answer(question.id) && answer(question.id).text) || ''
      });
      text.addEventListener('input', () => {
        const current = answer(question.id) || (multi ? { optionIds: [] } : { optionId: '' });
        current.text = text.value;
        setAnswer(question.id, current);
      });
      wrap.appendChild(text);
    }
    return wrap;
  }

  function locationField(question) {
    const current = answer(question.id) || {};
    const outside = current.choice === 'outside_us';
    const wrap = el('div', {});
    if (!outside) {
      const zip = el('input', {
        class: 'text-input', id: question.id + '-zip', inputmode: 'numeric', maxlength: '5',
        autocomplete: 'postal-code', 'aria-label': 'Home ZIP code', placeholder: 'Home ZIP code',
        value: current.choice === 'us' ? (current.zip || '') : ''
      });
      zip.addEventListener('input', () => {
        const digits = zip.value.replace(/\D/g, '').slice(0, 5);
        if (digits !== zip.value) zip.value = digits;
        setAnswer(question.id, digits ? { choice: 'us', zip: digits } : { choice: 'skipped' });
      });
      wrap.appendChild(el('label', { class: 'sub-label', for: question.id + '-zip', text: 'Home ZIP code' }));
      wrap.appendChild(zip);
    }
    const toggle = el('input', { type: 'checkbox', id: question.id + '-outside' });
    toggle.checked = outside;
    toggle.addEventListener('change', () => {
      if (toggle.checked) setAnswer(question.id, { choice: 'outside_us', city: current.city || '', countryCode: current.countryCode || '' });
      else setAnswer(question.id, { choice: 'skipped' });
      showStep();
    });
    wrap.appendChild(el('label', { class: 'choice' }, [toggle, el('span', { text: 'I live outside the United States' })]));
    if (outside) {
      const city = el('input', { class: 'text-input', id: question.id + '-city', 'aria-label': 'Home city', value: current.city || '', placeholder: 'Home city' });
      city.addEventListener('input', () => setAnswer(question.id, Object.assign({}, answer(question.id), { choice: 'outside_us', city: city.value })));
      wrap.appendChild(el('label', { class: 'sub-label', for: question.id + '-city', text: 'Home city' }));
      wrap.appendChild(city);
      wrap.appendChild(countryPicker(current.countryCode || ''));
    }
    wrap.appendChild(el('button', {
      class: 'quiet-skip', type: 'button', text: 'Skip',
      onclick: () => { setAnswer(question.id, { choice: 'skipped' }); showStep(); }
    }));
    return wrap;
  }

  function countryPicker(selected) {
    const countries = window.DOMO_COUNTRIES || [];
    const wrap = el('div', {});
    const input = el('input', { class: 'search-input', type: 'text', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'true', 'aria-controls': 'country-list', 'aria-label': 'Country', placeholder: 'Search for a country', value: countryName(selected) });
    const list = el('ul', { class: 'country-list', id: 'country-list', role: 'listbox' });
    function paint(filter) {
      list.replaceChildren();
      countries.filter((country) => country.code !== 'US' && country.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 8).forEach((country) => {
        list.appendChild(el('li', {}, [el('button', { type: 'button', role: 'option', text: country.name, onclick: () => {
          setAnswer('q_live', Object.assign({}, answer('q_live'), { choice: 'outside_us', countryCode: country.code }));
          showStep();
        } })]));
      });
    }
    input.addEventListener('input', () => paint(input.value));
    paint(countryName(selected));
    wrap.appendChild(el('label', { class: 'field-label', text: 'Country' }));
    wrap.appendChild(input);
    wrap.appendChild(list);
    return wrap;
  }

  function countryName(code) {
    const found = (window.DOMO_COUNTRIES || []).find((country) => country.code === code);
    return found ? found.name : '';
  }

  function next() {
    const errors = validateStep();
    state.draft.errors = errors;
    if (Object.keys(errors).length) { state.notice = 'Please correct the highlighted answers.'; showStep(); return; }
    state.notice = '';
    state.step += 1;
    showStep();
  }

  function validateStep() {
    const errors = {};
    const step = steps()[state.step];
    (step.questionIds || []).forEach((id) => {
      const question = questionById(id);
      const value = answer(id);
      if (question.type === 'location') {
        if (!value || !value.choice || value.choice === 'skipped' || value.choice === 'prefer_not') return;
        if (value.choice === 'us' && value.zip && !/^\d{5}$/.test(value.zip)) errors[id] = 'Enter a 5-digit ZIP code, or skip this question.';
        if (value.choice === 'outside_us' && (!(value.city || '').trim() || !value.countryCode)) errors[id] = 'Enter a city and country, or skip this question.';
        return;
      }
      if (question.required === false) return;
      if (question.type === 'integer') {
        const number = Number(value);
        if (!Number.isInteger(number) || number < question.min || number > question.max) errors[id] = 'Enter a whole number from ' + question.min + ' to ' + question.max + '.';
      } else if (question.type === 'single' && (!value || !value.optionId)) errors[id] = 'Choose an answer.';
      else if (question.type === 'multi' && (!value || !(value.optionIds || []).length)) errors[id] = 'Choose at least one answer.';
      else if (question.type === 'short_text' && !(value || '').trim()) errors[id] = 'This question is required.';
    });
    return errors;
  }

  async function submit(decision, acceptedVersionId) {
    if (state.busy) return;
    const errors = validateStep();
    state.draft.errors = errors;
    if (Object.keys(errors).length) { state.notice = 'Please correct the highlighted answers.'; showStep(); return; }
    state.busy = true;
    state.notice = '';
    try {
      const result = await api('/api/survey-responses', {
        method: 'POST',
        body: JSON.stringify({
          attemptId: state.draft.attemptId,
          idempotencyKey: state.draft.idempotencyKey,
          answers: state.draft.answers,
          decision: decision === 'issue' ? null : decision,
          acceptedVersionId: acceptedVersionId || null
        })
      });
      sessionStorage.setItem(resultKey, JSON.stringify(result));
      rememberReward(result);
      showConfirmation(result);
    } catch (error) {
      if (error.status === 409 && error.data && error.data.error === 'offer_changed') showOfferChange(error.data);
      else if (error.status === 400 && error.data && error.data.fields) {
        state.draft.errors = error.data.fields;
        state.notice = error.data.message;
        showStep();
      } else {
        state.notice = (error.data && error.data.message) || 'The survey was not saved. Your answers are still here. Try again.';
        showStep();
      }
    } finally { state.busy = false; }
  }

  function showOfferChange(data) {
    const parts = [logo(), el('h1', { text: 'The offer changed' }), el('p', { text: data.message || 'Review the offer before saving.' })];
    if (data.previousOffer) parts.push(el('section', { class: 'card' }, [el('h2', { text: 'Offer you started' }), el('p', { text: data.previousOffer.name }), el('p', { text: data.previousOffer.guestTerms })]));
    if (data.replacementOffer) {
      parts.push(el('section', { class: 'card' }, [el('h2', { text: 'New offer' }), el('p', { text: data.replacementOffer.name }), el('p', { text: data.replacementOffer.guestTerms }), el('p', { text: data.replacementOffer.expiryPreview })]));
      parts.push(el('button', { class: 'btn btn-primary', type: 'button', text: 'Accept the new offer', onclick: () => submit('accept_replacement', data.replacementOffer.versionId) }));
    }
    if (data.canSubmitWithoutReward) parts.push(el('button', { class: 'btn btn-secondary', type: 'button', text: 'Submit without a reward', onclick: () => submit('submit_without_reward') }));
    if (data.currentOfferPath) parts.push(el('a', { class: 'btn btn-secondary', href: data.currentOfferPath, text: 'See the current offer' }));
    parts.push(el('button', { class: 'btn btn-secondary', type: 'button', text: 'Back to my answers', onclick: showStep }));
    render(el('div', {}, parts));
  }

  function showConfirmation(result) {
    const reward = result.reward;
    const parts = [logo()];
    if (reward && reward.testData) parts.push(banner('TEST PROMOTION. This code is for rehearsal only. It is not a live reward.', 'test'));
    parts.push(el('img', { class: 'mascot', src: '/survey-assets/brand/domo-eating.png', alt: '' }));
    if (!reward) {
      parts.push(el('h1', { text: 'Your survey is saved' }));
      parts.push(el('p', { text: 'No reward was issued. A saved survey by itself is not proof of a reward.' }));
    } else {
      parts.push(el('h1', { text: 'Thank you! Your survey is complete.' }));
      parts.push(el('p', { text: 'Show this reward to your server before paying.' }));
      parts.push(el('section', { class: 'card' }, [
        el('h2', { text: reward.title }),
        el('p', { class: 'reward-code', text: reward.code }),
        el('button', { class: 'btn btn-secondary', type: 'button', text: 'Copy code', onclick: () => navigator.clipboard && navigator.clipboard.writeText(reward.code) }),
        reward.qrDataUrl ? el('img', { class: 'qr', alt: 'QR code for staff to look up reward ' + reward.code, src: reward.qrDataUrl }) : null,
        el('p', {}, [el('span', { class: 'status-pill', text: statusLabel(reward.status) })]),
        el('p', { text: reward.guestTerms }),
        el('p', { text: 'Expires ' + reward.expiresAtLabel }),
        el('p', { text: reward.partyNote })
      ]));
    }
    parts.push(signupBlock(result));
    parts.push(el('button', { class: 'btn btn-secondary', type: 'button', text: 'This was for this visit. Start a later visit', onclick: newVisit }));
    render(el('div', {}, parts));
  }

  function statusLabel(status) {
    if (status === 'redeemed') return 'Redeemed';
    if (status === 'expired') return 'Expired';
    if (status === 'voided') return 'No longer valid';
    return 'Issued';
  }

  function signupBlock(result) {
    if (!result.signupToken) return el('p', { class: 'fine', text: 'Email signup is unavailable for this confirmation. The reward is unchanged.' });
    const box = el('section', { class: 'card', id: 'signup' });
    box.appendChild(el('h2', { text: 'Want more Domo?' }));
    box.appendChild(el('p', { text: state.ctx && state.ctx.consentText ? state.ctx.consentText : 'Get emails about Domo Cafe events, new menu items, special offers, and the things you selected. You can unsubscribe anytime. Your survey reward is yours either way.' }));
    const email = el('input', { class: 'text-input', type: 'email', autocomplete: 'email', 'aria-label': 'Email address', placeholder: 'Email address' });
    const name = el('input', { class: 'text-input', type: 'text', autocomplete: 'given-name', 'aria-label': 'First name, optional', placeholder: 'First name, optional' });
    const error = el('p', { class: 'field-error', role: 'alert' });
    box.appendChild(email);
    box.appendChild(name);
    box.appendChild(error);
    box.appendChild(el('div', { class: 'stack' }, [
      el('button', { class: 'btn btn-primary', type: 'button', text: 'Sign me up for Domo Cafe emails', onclick: async () => {
        error.textContent = '';
        try {
          await api('/api/survey-signups', { method: 'POST', body: JSON.stringify({ signupToken: result.signupToken, email: email.value, firstName: name.value, consentVersion: (state.ctx && state.ctx.consentVersion) || 'survey-email-v1' }) });
          box.replaceChildren(el('h2', { text: 'You are signed up' }), el('p', { text: 'Your survey reward is unchanged. You can unsubscribe anytime.' }));
        } catch (err) {
          error.textContent = (err.data && err.data.message) || 'Signup did not save. Your reward is still yours. You can try again.';
        }
      } }),
      el('button', { class: 'btn btn-secondary', type: 'button', text: 'No thanks', onclick: () => { box.replaceChildren(el('p', { text: 'No email was saved. Your reward is unchanged.' })); } })
    ]));
    box.appendChild(el('p', { class: 'fine' }, [document.createTextNode('You can unsubscribe anytime. Your survey reward is yours either way. '), el('a', { href: (state.ctx && state.ctx.privacyUrl) || '/survey/privacy', text: 'Privacy notice' })]));
    return box;
  }

  function newVisit() {
    sessionStorage.removeItem(resultKey);
    localStorage.removeItem(draftKey);
    window.location.href = campaign ? '/survey/c/' + campaign : '/survey';
  }

  async function showSavedReward() {
    try {
      const data = await api('/api/rewards/' + rewardToken);
      showConfirmation({ reward: data.reward, signupToken: null });
    } catch (error) {
      render(el('div', {}, [logo(), el('h1', { text: 'Reward not found' }), el('p', { text: (error.data && error.data.message) || 'This link does not match a reward.' })]));
    }
  }

  function showPreview() {
    let schema = null;
    try { schema = JSON.parse(sessionStorage.getItem('domoSurveyPreview') || 'null'); } catch (_) { schema = null; }
    if (!schema) {
      render(el('div', {}, [logo(), el('h1', { text: 'No preview is open' }), el('p', { text: 'Open a mobile preview from the survey editor.' })]));
      return;
    }
    state.ctx = { survey: { title: schema.title || 'Preview', intro: schema.intro || '', schema: schema }, offer: null, availability: { issuable: false, label: 'Preview only' }, canStart: false, testData: true };
    state.draft = { answers: {}, errors: {} };
    state.step = 0;
    const note = banner('Preview only. Answers are not saved and no reward is issued.', 'warn');
    showStep();
    root.prepend(note);
  }

  async function init() {
    if (preview) return showPreview();
    if (rewardToken) return showSavedReward();
    const storedResult = sessionStorage.getItem(resultKey);
    state.draft = readDraft() || { answers: {}, errors: {}, entry: entryKey, idempotencyKey: crypto.randomUUID() };
    try {
      state.ctx = await api('/api/survey-context?campaign=' + encodeURIComponent(campaign));
      api('/api/survey-events', { method: 'POST', body: JSON.stringify({ type: 'survey_opened', campaignSlug: campaign || null }) }).catch(() => {});
      window.DOMO_COUNTRIES = await fetch('/survey-assets/countries.json').then((response) => response.json()).catch(() => []);
    } catch (error) {
      render(el('div', {}, [logo(), el('h1', { text: 'The survey is not available right now' }), el('p', { text: (error.data && error.data.message) || 'Check the connection and try again. Answers saved on this device are kept for 24 hours.' }), el('button', { class: 'btn btn-primary', type: 'button', text: 'Try again', onclick: () => window.location.reload() })]));
      return;
    }
    if (storedResult) {
      try { showConfirmation(JSON.parse(storedResult)); return; } catch (_) { /* continue */ }
    }
    if (state.draft.attemptId) showStep();
    else showLanding();
  }

  init();
})();
