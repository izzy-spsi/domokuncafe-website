/**
 * Decides whether /reservations/ may link out to Toast.
 * DOM-free so Node tests and the browser share one plan.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DomoBooking = api;
})(typeof globalThis !== 'undefined' ? globalThis : null, function () {
  var COPY = {
    unavailableHeading: 'Online reservations are not available yet.',
    unavailableLead: 'You can still come in. Walk-ins are welcome. For a party of 8 or more, call ahead so we can ready a table.',
    openHeading: 'Reserve a table',
    openLead: 'Choose a time on Toast. Toast sends the confirmation, and the link opens in a new tab.',
    reserveLabel: 'Reserve a table',
    waitlistLabel: 'Join the waitlist',
    waitlistNote: 'The waitlist opens on its own Toast page.',
    newTabSuffix: '(opens in a new tab)'
  };

  function parseHttpsUrl(value) {
    if (typeof value !== 'string') return null;
    var trimmed = value.trim();
    if (!trimmed || trimmed.length > 2000) return null;
    if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
    var url;
    try {
      url = new URL(trimmed);
    } catch (error) {
      return null;
    }
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url;
  }

  function isToastHost(hostname) {
    var host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    return host === 'toasttab.com' ||
      host === 'toast.app' ||
      host.endsWith('.toasttab.com') ||
      host.endsWith('.toast.app');
  }

  function isOrderingOrEvent(url) {
    var host = url.hostname.toLowerCase();
    var path = decodeURIComponent(url.pathname).toLowerCase().replace(/\/+$/, '') || '/';
    if (path.indexOf('/events/') !== -1) return true;
    if (host === 'order.toasttab.com' && (path === '/online' || path.indexOf('/online/') === 0)) return true;
    if ((host === 'www.toasttab.com' || host === 'toasttab.com') && path === '/domo-cafe-8340-la-palma-avenue') return true;
    return false;
  }

  function guestBookingUrl(value) {
    var url = parseHttpsUrl(value);
    if (!url || !isToastHost(url.hostname) || isOrderingOrEvent(url)) return '';
    return url.href;
  }

  function planBooking(config) {
    var source = config || {};
    var reservationUrl = source.reservationsApproved === true ? guestBookingUrl(source.reservationUrl) : '';
    var waitlistUrl = source.waitlistApproved === true ? guestBookingUrl(source.waitlistUrl) : '';
    if (reservationUrl && waitlistUrl && reservationUrl === waitlistUrl) waitlistUrl = '';
    var open = Boolean(reservationUrl);
    return {
      reservationsOpen: open,
      waitlistOpen: Boolean(waitlistUrl),
      reservationUrl: reservationUrl,
      waitlistUrl: waitlistUrl,
      heading: open ? COPY.openHeading : COPY.unavailableHeading,
      lead: open ? COPY.openLead : COPY.unavailableLead,
      reserveLabel: COPY.reserveLabel,
      waitlistLabel: COPY.waitlistLabel,
      waitlistNote: COPY.waitlistNote,
      newTabSuffix: COPY.newTabSuffix
    };
  }

  return {
    COPY: COPY,
    guestBookingUrl: guestBookingUrl,
    planBooking: planBooking
  };
});
