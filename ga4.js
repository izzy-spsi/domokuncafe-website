/**
 * Shared GA4 config for Domo Cafe public pages.
 * Measurement ID: G-MYQJZDB2MR
 *
 * Pair with the official gtag.js loader in <head>. Config runs only on
 * the live site so staging/Railway/local hosts do not send hits even if
 * they serve the same HTML.
 */
(function () {
  var host = location.hostname;
  if (host !== 'www.domokuncafe.com' && host !== 'domokuncafe.com') return;

  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', 'G-MYQJZDB2MR');
})();
