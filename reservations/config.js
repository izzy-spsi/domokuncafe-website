/**
 * Toast Tables guest links for /reservations/.
 *
 * Paste only the URLs Toast copies for you:
 *   Waitlist & Reservations → Settings → Reservations → Online access → Copy online reservation link
 *   Waitlist & Reservations → Settings → Waitlist → Online access → Copy online waitlist link
 *
 * Leave a URL blank until that exact link is copied. Do not build a guest URL
 * from the restaurant id or GUID. Set a flag to true only after that product
 * is turned on for guests and, for reservations, the guest policy is confirmed.
 * The page stays closed when a flag is false, even if a URL is present.
 */
(function (root, factory) {
  var config = factory();
  if (typeof module === 'object' && module.exports) module.exports = config;
  if (root) root.DOMO_RESERVATIONS = config;
})(typeof globalThis !== 'undefined' ? globalThis : null, function () {
  return {
    reservationUrl: '',
    waitlistUrl: '',
    reservationsApproved: false,
    waitlistApproved: false
  };
});
