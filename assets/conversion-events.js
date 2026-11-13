/**
 * Conversion events for Domo Cafe.
 *
 * One delegated listener for the actions that already exist. It does not
 * change navigation. GA4 uses transport_type beacon so an outbound click
 * still leaves the page. Calls are skipped when gtag or fbq is missing.
 *
 * ga4.js only installs gtag on www.domokuncafe.com. On any other host this
 * file sends the conversion event itself (no page_view) so staging can be
 * checked. It does not edit the GA4 or Meta base snippets.
 *
 * GA4 event              Meta standard event   What fires it
 * get_directions         FindLocation          Google Maps / Apple Maps links
 * phone_call             Contact               tel: links
 * reservation_click      Schedule              Toast Tables findTime links
 * waitlist_join          Lead                  Toast Tables joinWaitlist links
 * generate_lead          Lead                  Community Tuesday request form
 * order_online_click     InitiateCheckout      Toast, DoorDash, Grubhub, Uber Eats
 * menu_click             ViewContent           Links to the on-page #menu
 *
 * data-track on a link or form overrides the href match. Supported values:
 * directions, phone, reservation, reservation_submit, waitlist, lead,
 * order, menu (and the GA4 event names above).
 */
(function () {
  if (window.__domoConversionEvents) return;
  window.__domoConversionEvents = true;

  var GA_ID = 'G-MYQJZDB2MR';
  var gaConfigured = false;

  var EXPLICIT = {
    directions: eventSpec('get_directions', 'FindLocation', 'google_maps', 'directions'),
    get_directions: eventSpec('get_directions', 'FindLocation', 'google_maps', 'directions'),
    phone: eventSpec('phone_call', 'Contact', 'phone', 'phone'),
    phone_call: eventSpec('phone_call', 'Contact', 'phone', 'phone'),
    reservation: eventSpec('reservation_click', 'Schedule', 'toast_tables', 'reservation'),
    reservation_click: eventSpec('reservation_click', 'Schedule', 'toast_tables', 'reservation'),
    reservation_submit: eventSpec('reservation_submit', 'Schedule', 'toast_tables', 'reservation'),
    waitlist: eventSpec('waitlist_join', 'Lead', 'toast_tables', 'waitlist'),
    waitlist_join: eventSpec('waitlist_join', 'Lead', 'toast_tables', 'waitlist'),
    lead: eventSpec('generate_lead', 'Lead', 'form', 'generate_lead'),
    generate_lead: eventSpec('generate_lead', 'Lead', 'form', 'generate_lead'),
    order: eventSpec('order_online_click', 'InitiateCheckout', 'online_order', 'order_online'),
    order_online_click: eventSpec('order_online_click', 'InitiateCheckout', 'online_order', 'order_online'),
    menu: eventSpec('menu_click', 'ViewContent', 'menu', 'menu'),
    menu_click: eventSpec('menu_click', 'ViewContent', 'menu', 'menu')
  };

  function eventSpec(ga, meta, platform, contentName) {
    return { ga: ga, meta: meta, platform: platform, contentName: contentName };
  }

  function copySpec(spec) {
    return eventSpec(spec.ga, spec.meta, spec.platform, spec.contentName);
  }

  function bareHost(hostname) {
    return String(hostname || '').toLowerCase().replace(/^www\./, '');
  }

  function pagePath() {
    return location.pathname + location.search;
  }

  function linkText(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function ensureGtag() {
    var live = location.hostname === 'www.domokuncafe.com' || location.hostname === 'domokuncafe.com';
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function () { window.dataLayer.push(arguments); };
    }
    if (live || gaConfigured) return;
    gaConfigured = true;
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { send_page_view: false });
    if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
      document.head.appendChild(script);
    }
  }

  function send(spec, details) {
    details = details || {};
    var gaParams = { transport_type: 'beacon', page_path: pagePath() };
    if (details.link_url) gaParams.link_url = details.link_url;
    if (details.link_text) gaParams.link_text = details.link_text;
    if (spec.platform) gaParams.platform = spec.platform;
    if (details.form_id) gaParams.form_id = details.form_id;
    if (details.lead_source) gaParams.lead_source = details.lead_source;

    try {
      ensureGtag();
      if (typeof window.gtag === 'function') window.gtag('event', spec.ga, gaParams);
    } catch (err) {}

    try {
      if (typeof window.fbq === 'function') {
        var metaParams = { content_name: spec.contentName, page_path: pagePath() };
        if (spec.platform) metaParams.content_category = spec.platform;
        if (details.link_url) metaParams.link_url = details.link_url;
        window.fbq('track', spec.meta, metaParams);
      }
    } catch (err) {}
  }

  function isMaps(url) {
    var host = bareHost(url.hostname);
    if (host === 'maps.google.com' || host === 'maps.apple.com' || host === 'maps.app.goo.gl') return true;
    if ((host === 'google.com' || host === 'maps.google.com') && url.pathname.indexOf('/maps') === 0) return true;
    if (host === 'goo.gl' && url.pathname.indexOf('/maps') === 0) return true;
    return false;
  }

  function mapsPlatform(url) {
    return bareHost(url.hostname).indexOf('apple') !== -1 ? 'apple_maps' : 'google_maps';
  }

  function orderPlatform(url) {
    var host = bareHost(url.hostname);
    if (host === 'doordash.com' || host.slice(-13) === '.doordash.com' || host === 'order.online') return 'doordash';
    if (host === 'grubhub.com' || host.slice(-12) === '.grubhub.com') return 'grubhub';
    if (host === 'ubereats.com' || host.slice(-13) === '.ubereats.com') return 'uber_eats';
    if (host === 'toasttab.com') return 'toast';
    if (host.slice(-13) === '.toasttab.com' && host !== 'tables.toasttab.com') return 'toast';
    return '';
  }

  function sameSite(url) {
    var host = bareHost(url.hostname);
    return host === bareHost(location.hostname) || host === 'domokuncafe.com';
  }

  function fromUrl(url) {
    if (url.protocol === 'tel:') return eventSpec('phone_call', 'Contact', 'phone', 'phone');
    if (isMaps(url)) return eventSpec('get_directions', 'FindLocation', mapsPlatform(url), 'directions');

    var host = bareHost(url.hostname);
    var path = url.pathname.toLowerCase();
    if (host === 'tables.toasttab.com') {
      if (path.indexOf('findtime') !== -1) return eventSpec('reservation_click', 'Schedule', 'toast_tables', 'reservation');
      if (path.indexOf('joinwaitlist') !== -1) return eventSpec('waitlist_join', 'Lead', 'toast_tables', 'waitlist');
      return null;
    }

    var platform = orderPlatform(url);
    if (platform) return eventSpec('order_online_click', 'InitiateCheckout', platform, 'order_online');

    if (url.hash === '#menu' && sameSite(url)) return eventSpec('menu_click', 'ViewContent', 'menu', 'menu');
    return null;
  }

  function refine(spec, url) {
    if (!spec || !url) return spec;
    var next = copySpec(spec);
    if (next.ga === 'get_directions' && isMaps(url)) next.platform = mapsPlatform(url);
    if (next.ga === 'phone_call') next.platform = 'phone';
    if (next.ga === 'order_online_click') {
      var platform = orderPlatform(url);
      if (platform) next.platform = platform;
    }
    if ((next.ga === 'reservation_click' || next.ga === 'reservation_submit' || next.ga === 'waitlist_join') && bareHost(url.hostname) === 'tables.toasttab.com') {
      next.platform = 'toast_tables';
    }
    return next;
  }

  function explicitSpec(value) {
    var spec = EXPLICIT[String(value || '').trim().toLowerCase()];
    return spec ? copySpec(spec) : null;
  }

  function classifyAnchor(anchor) {
    var href = anchor.getAttribute('href') || '';
    var url = null;
    try { url = new URL(href, location.href); } catch (err) { url = null; }
    var spec = explicitSpec(anchor.getAttribute('data-track'));
    if (spec) return refine(spec, url);
    return url ? fromUrl(url) : null;
  }

  function absoluteHref(anchor) {
    var href = anchor.getAttribute('href') || '';
    try { return new URL(href, location.href).href; } catch (err) { return href; }
  }

  document.addEventListener('click', function (event) {
    try {
      var node = event.target;
      if (!node || !node.closest) return;
      var anchor = node.closest('a[href]');
      var spec = anchor ? classifyAnchor(anchor) : null;
      var source = anchor;
      if (!spec) {
        var marked = node.closest('[data-track]');
        spec = marked ? explicitSpec(marked.getAttribute('data-track')) : null;
        source = marked;
      }
      if (!spec || !source) return;
      send(spec, {
        link_url: anchor ? absoluteHref(anchor) : location.href,
        link_text: linkText(source),
        form_id: '',
        lead_source: ''
      });
    } catch (err) {}
  }, true);

  function requestFormComplete(form) {
    var names = ['requestedTuesdays', 'organization', 'orgType', 'contactName', 'contactEmail', 'contactPhone', 'purpose', 'estimatedAttendance'];
    var i;
    for (i = 0; i < names.length; i += 1) {
      var field = form.elements[names[i]];
      if (!field || !String(field.value || '').trim()) return false;
    }
    var agree = form.elements.agreeTerms;
    return !agree || agree.checked;
  }

  document.addEventListener('submit', function (event) {
    try {
      var form = event.target;
      if (!form || form.nodeName !== 'FORM') return;
      var track = (form.getAttribute('data-track') || '').toLowerCase();
      var isRequest = form.id === 'request-form';
      if (!isRequest && track !== 'generate_lead' && track !== 'lead') return;
      if (isRequest && !requestFormComplete(form)) return;
      if (!isRequest && typeof form.checkValidity === 'function' && !form.checkValidity()) return;
      send(eventSpec('generate_lead', 'Lead', isRequest ? 'community_tuesday' : 'form', isRequest ? 'community_tuesday_request' : 'generate_lead'), {
        link_url: location.href,
        link_text: '',
        form_id: form.id || '',
        lead_source: isRequest ? 'community_tuesday' : (form.getAttribute('data-lead-source') || form.id || 'form')
      });
    } catch (err) {}
  }, true);

  if (location.hash === '#menu') {
    send(eventSpec('menu_click', 'ViewContent', 'menu', 'menu'), {
      link_url: location.href,
      link_text: 'menu'
    });
  }
})();
