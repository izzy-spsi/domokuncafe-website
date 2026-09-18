(function () {
  var CONTACT_EMAIL = 'info@domokuncafe.com';
  var DATES_URL = 'community-dates.json';
  var TUESDAY_COUNT = 16;
  var SCHOOL_TYPES = { school: true, pta: true, team: true };

  var toggle = document.querySelector('.toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
      });
    });
  }

  var share = document.getElementById('share');
  if (share) {
    share.addEventListener('click', function () {
      var button = share;
      if (navigator.share) {
        navigator.share({
          title: document.title,
          text: 'Support this group at Domo Community Tuesday.',
          url: location.href
        }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(location.href).then(function () {
          button.textContent = 'Link copied ✓';
        });
      } else {
        button.textContent = 'Copy this page URL ↗';
      }
    });
  }

  var dateGrid = document.getElementById('date-grid');
  var requestForm = document.getElementById('request-form');
  if (!dateGrid || !requestForm) return;

  var selected = {};
  var reservedByDate = {};
  var dateError = document.getElementById('date-error');
  var selectedInput = document.getElementById('requestedTuesdays');
  var orgType = document.getElementById('orgType');
  var schoolField = document.getElementById('school-field');
  var status = document.getElementById('status');
  var successBox = document.getElementById('request-success');
  var payloadPre = document.getElementById('request-payload');
  var copyBtn = document.getElementById('copy-request');
  var mailtoLink = document.getElementById('mailto-fallback');

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toISODate(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function startOfToday() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function upcomingTuesdays(count) {
    var cursor = startOfToday();
    var add = (2 - cursor.getDay() + 7) % 7;
    if (add) cursor.setDate(cursor.getDate() + add);
    var dates = [];
    for (var i = 0; i < count; i += 1) {
      dates.push(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
      cursor.setDate(cursor.getDate() + 7);
    }
    return dates;
  }

  function formatWeekday(date) {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function syncSelected() {
    var values = Object.keys(selected).filter(function (key) { return selected[key]; }).sort();
    selectedInput.value = values.join(', ');
    if (values.length && dateError) dateError.hidden = true;
  }

  function renderDates() {
    var tuesdays = upcomingTuesdays(TUESDAY_COUNT);
    dateGrid.innerHTML = '';
    tuesdays.forEach(function (date) {
      var iso = toISODate(date);
      var hold = reservedByDate[iso];
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'date-option';
      button.setAttribute('data-date', iso);
      button.setAttribute('aria-pressed', 'false');
      if (hold) {
        button.classList.add('is-reserved');
        button.disabled = true;
        button.innerHTML = '<span class="tag">Reserved</span><strong>' + formatWeekday(date) + '</strong><small>' + (hold.organization || 'Already held') + '</small>';
      } else {
        button.innerHTML = '<span class="tag">Open</span><strong>' + formatWeekday(date) + '</strong><small>Subject to approval</small>';
        button.addEventListener('click', function () {
          selected[iso] = !selected[iso];
          button.classList.toggle('is-selected', selected[iso]);
          button.setAttribute('aria-pressed', selected[iso] ? 'true' : 'false');
          syncSelected();
        });
      }
      dateGrid.appendChild(button);
    });
  }

  function toggleSchoolField() {
    var show = SCHOOL_TYPES[orgType.value];
    schoolField.hidden = !show;
  }

  function formValues() {
    var data = new FormData(requestForm);
    return {
      type: 'community-tuesday-request',
      submittedAt: new Date().toISOString(),
      organization: (data.get('organization') || '').trim(),
      orgType: data.get('orgType') || '',
      schoolAffiliation: (data.get('schoolAffiliation') || '').trim(),
      contactName: (data.get('contactName') || '').trim(),
      contactEmail: (data.get('contactEmail') || '').trim(),
      contactPhone: (data.get('contactPhone') || '').trim(),
      website: (data.get('website') || '').trim(),
      socials: (data.get('socials') || '').trim(),
      requestedTuesdays: selectedInput.value,
      purpose: (data.get('purpose') || '').trim(),
      estimatedAttendance: (data.get('estimatedAttendance') || '').trim(),
      fundraisingGoal: (data.get('fundraisingGoal') || '').trim(),
      agreedToTerms: data.get('agreeTerms') === 'yes'
    };
  }

  function payloadText(values) {
    return [
      'DOMO COMMUNITY TUESDAY REQUEST',
      'Submitted: ' + values.submittedAt,
      '',
      'ORGANIZATION',
      'Name: ' + values.organization,
      'Type: ' + values.orgType,
      'School affiliation: ' + (values.schoolAffiliation || 'n/a'),
      'Website: ' + (values.website || 'n/a'),
      'Socials: ' + (values.socials || 'n/a'),
      '',
      'PRIMARY CONTACT',
      'Name: ' + values.contactName,
      'Email: ' + values.contactEmail,
      'Phone: ' + values.contactPhone,
      '',
      'REQUEST',
      'Requested Tuesday(s): ' + values.requestedTuesdays,
      'Estimated attendance: ' + values.estimatedAttendance,
      'Fundraising goal: ' + (values.fundraisingGoal || 'n/a'),
      'Purpose: ' + values.purpose,
      '',
      'AGREEMENT',
      'Agreed to Community Tuesday terms: ' + (values.agreedToTerms ? 'yes' : 'no'),
      '',
      'JSON',
      JSON.stringify(values, null, 2)
    ].join('\n');
  }

  function openMailto(values, body) {
    var subject = 'Community Tuesday request · ' + values.organization;
    var href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    if (mailtoLink) {
      mailtoLink.href = href;
      mailtoLink.hidden = false;
    }
    var anchor = document.createElement('a');
    anchor.href = href;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return href;
  }

  orgType.addEventListener('change', toggleSchoolField);
  toggleSchoolField();

  requestForm.addEventListener('submit', function (event) {
    event.preventDefault();
    syncSelected();
    if (!selectedInput.value) {
      dateError.hidden = false;
      dateGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var values = formValues();
    var body = payloadText(values);
    try { window.localStorage.setItem('domoCommunityRequest', JSON.stringify(values)); } catch (_) {}
    openMailto(values, body);
    requestForm.hidden = true;
    successBox.classList.add('is-visible');
    payloadPre.textContent = body;
    status.textContent = 'Your email draft to ' + CONTACT_EMAIL + ' should be open. If it did not, copy the request below.';
    successBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var text = payloadPre.textContent || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          copyBtn.textContent = 'Copied ✓';
        }).catch(function () {
          copyBtn.textContent = 'Copy from the box below';
        });
      } else {
        copyBtn.textContent = 'Copy from the box below';
      }
    });
  }

  fetch(DATES_URL, { cache: 'no-store' })
    .then(function (res) { return res.ok ? res.json() : { dates: [] }; })
    .catch(function () { return { dates: [] }; })
    .then(function (data) {
      (data.dates || []).forEach(function (item) {
        if (item && item.date) reservedByDate[item.date] = item;
      });
      renderDates();
    });
}());
