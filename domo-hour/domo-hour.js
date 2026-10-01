/**
 * Domo Hour section. Renders window.DOMO_HOUR (domo-hour-data.js) into <section id="domo-hour">.
 * Works in every theme; a seasonal theme only adds a badge (data `seasonal`) and the
 * `dh--<theme>` class that the theme's own stylesheet can style.
 *
 * Links: /#domo-hour scrolls to the section; /#domo-hour-menu also opens the menu.
 */
(function () {
  var data = window.DOMO_HOUR;
  var mount = document.getElementById('domo-hour');
  if (!data || !mount) return;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var theme = document.documentElement.getAttribute('data-theme') || 'normal';
  var seasonal = (data.seasonal || {})[theme] || null;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var offers = (data.offers || []).map(function (o) {
    return o.hero
      ? '<li class="dh__offer dh__offer--hero"><span class="dh__offer-price">' + esc(o.price) + '</span><span class="dh__offer-label">' + esc(o.label) + '</span></li>'
      : '<li class="dh__offer"><span class="dh__offer-label">' + esc(o.label) + '</span><span class="dh__offer-price">' + esc(o.price) + '</span></li>';
  }).join('');

  var photos = (data.images || []).map(function (img, i) {
    return '<figure class="dh__photo dh__photo--' + (i + 1) + '"><img src="' + esc(img.src) + '" alt="' + esc(img.alt) + '" width="2560" height="1440" loading="lazy" decoding="async"></figure>';
  }).join('');

  var menu = (data.menu || []).map(function (group) {
    return '<div class="dh__menu-group"><h3 class="dh__menu-heading">' + esc(group.heading) + '</h3><ul class="dh__menu-list">' +
      (group.items || []).map(function (item) {
        return '<li><span class="dh__menu-name">' + esc(item.name) + '</span><span class="dh__menu-dots" aria-hidden="true"></span><span class="dh__menu-price">' + esc(item.price) + '</span></li>';
      }).join('') + '</ul></div>';
  }).join('');

  mount.className = 'dh' + (seasonal ? ' dh--' + theme : '');
  mount.removeAttribute('aria-label');
  mount.setAttribute('aria-labelledby', 'dh-title');
  mount.innerHTML =
    '<div class="container dh__inner">' +
      '<div class="dh__copy">' +
        '<div class="dh__top"><p class="dh__eyebrow">' + esc(data.eyebrow) + '</p>' +
          (seasonal && seasonal.badge ? '<span class="dh__badge" data-dh-seasonal>' + esc(seasonal.badge) + '</span>' : '') + '</div>' +
        '<h2 class="dh__title" id="dh-title">' + esc(data.title) + '</h2>' +
        '<p class="dh__tagline">' + esc(data.tagline) + '</p>' +
        '<p class="dh__schedule"><span class="dh__schedule-long">' + esc(data.schedule) + '</span>' +
          (data.scheduleShort ? '<span class="dh__schedule-short" aria-hidden="true">' + esc(data.scheduleShort) + '</span>' : '') + '</p>' +
        '<p class="dh__sub">' + esc(data.sub) + '</p>' +
        '<ul class="dh__offers" aria-label="Domo Hour prices">' + offers + '</ul>' +
        '<div class="dh__ctas">' +
          '<button class="button dh__menu-btn" type="button" aria-expanded="false" aria-controls="domo-hour-menu" data-dh-toggle>' + esc(data.menuButton) + ' <span class="dh__chev" aria-hidden="true">▾</span></button>' +
          '<a class="button button--outline dh__visit" href="' + esc(data.visitHref || '#visit') + '">' + esc(data.visitButton) + '</a>' +
        '</div>' +
      '</div>' +
      (photos ? '<div class="dh__photos">' + photos + '</div>' : '') +
    '</div>' +
    '<div class="container"><div class="dh__menu" id="domo-hour-menu" role="region" aria-labelledby="dh-menu-title" hidden>' +
      '<h3 class="dh__menu-title" id="dh-menu-title">' + esc(data.title) + '</h3>' +
      '<div class="dh__menu-cols">' + menu + '</div>' +
      '<p class="dh__menu-when">' + esc(data.availability) + '</p>' +
    '</div></div>';

  var toggle = mount.querySelector('[data-dh-toggle]');
  var panel = mount.querySelector('#domo-hour-menu');

  function setOpen(open, scroll) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.hidden = !open;
    if (open && scroll) panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }
  toggle.addEventListener('click', function () { setOpen(toggle.getAttribute('aria-expanded') !== 'true', true); });

  // The section is rendered after the browser's own jump-to-#hash, and seasonal sections above it
  // can change height, so re-apply the hash target once layout settles.
  function followHash() {
    if (location.hash === '#domo-hour-menu') { setOpen(true, false); panel.scrollIntoView({ block: 'start' }); }
    else if (location.hash === '#domo-hour') mount.scrollIntoView({ block: 'start' });
  }
  if (/^#domo-hour/.test(location.hash)) {
    followHash();
    window.addEventListener('load', function () { setTimeout(followHash, 80); });
  }
  window.addEventListener('hashchange', function () {
    if (location.hash === '#domo-hour-menu') { setOpen(true, false); panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }
  });
})();
