/**
 * Domoween theme: renders the seasonal sections into #season-slot and dresses up
 * the rest of the page. Loaded by seasons/seasons.js only while Domoween is active.
 * Content lives in seasons/domoween/data.js.
 *
 * Official Domo art rules: show files from assets/domoween/ as-is (no flips,
 * rotation, filters, recolors, or non-proportional sizing) and never place text
 * or decorations over the art. Copy must not put words in Domo's mouth.
 */
(function () {
  var seasons = window.DomoSeasons || {};
  var theme = seasons.active || { end: '2026-10-31', start: '2026-10-01' };
  var data = window.DOMOWEEN_DATA || {};
  var ART_DIR = '/assets/domoween/';
  var ORDER_URL = 'https://www.toasttab.com/domo-cafe-8340-la-palma-avenue/';
  var INSTAGRAM_URL = 'https://www.instagram.com/domokuncafe';
  var TIKTOK_URL = 'https://www.tiktok.com/@domokuncafe';
  var COPYRIGHT = 'Domo©NHK-TYO1998-2026. Domo Animation©Domo Production Committee. All rights reserved.';

  // lowres: screenshot crops (PNG only) until the official high-res files arrive.
  // To upgrade one: add <name>.webp + <name>.png at up to 600px, then replace the
  // entry with { w, h, alt } using the new pixel size (see assets/domoween/README.md).
  var ART = {
    'wc_40_mummy': { w: 600, h: 466, alt: 'Domo dressed as a mummy' },
    'wc_41_jack-o-lantern': { w: 542, h: 600, alt: "Domo in a jack-o'-lantern costume" },
    'wc_43_witch-broom': { w: 584, h: 600, alt: 'Domo in a witch hat riding a broomstick' },
    'wc_44_frankenstein': { w: 556, h: 600, alt: "Domo dressed as Frankenstein's monster" },
    'wc_53_mr-usagi-pumpkin-mask': { w: 403, h: 600, alt: 'Mr. Usagi wearing a pumpkin mask' },
    'tashanna_pumpkin-head': { w: 432, h: 600, alt: "Tashanna wearing a jack-o'-lantern hat" },
    'wc_42_witch-cauldron': { w: 81, h: 115, lowres: true, alt: 'Domo in a witch hat holding a cauldron' },
    'wc_45_dracula': { w: 95, h: 87, lowres: true, alt: 'Domo dressed as Dracula' },
    'wc_46_jiangshi': { w: 82, h: 95, lowres: true, alt: 'Domo dressed as a jiangshi' },
    'wc_47_skeleton': { w: 93, h: 89, lowres: true, alt: 'Domo in a skeleton costume' },
    'wc_48_werewolf': { w: 93, h: 94, lowres: true, alt: 'Domo dressed as a werewolf' },
    'wc_52_pumpkin': { w: 76, h: 80, lowres: true, alt: 'Domo as a pumpkin' }
  };
  var CREW = ['wc_44_frankenstein', 'wc_40_mummy', 'wc_41_jack-o-lantern', 'wc_43_witch-broom', 'wc_53_mr-usagi-pumpkin-mask', 'tashanna_pumpkin-head', 'wc_45_dracula', 'wc_47_skeleton', 'wc_48_werewolf', 'wc_46_jiangshi'];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function art(key, className, opts) {
    opts = opts || {};
    var a = ART[key];
    if (!a) return '';
    var name = a.lowres ? key + '_lowres' : key;
    var alt = opts.decorative ? '' : a.alt;
    var img = '<img class="dw-art__img" src="' + ART_DIR + name + '.png" width="' + a.w + '" height="' + a.h + '" alt="' + esc(alt) + '"' +
      (opts.eager ? '' : ' loading="lazy"') + ' decoding="async">';
    return '<picture class="dw-art ' + (className || '') + (a.lowres ? ' dw-art--lowres' : '') + '">' +
      (a.lowres ? '' : '<source type="image/webp" srcset="' + ART_DIR + name + '.webp">') + img + '</picture>';
  }

  var SVG = {
    bat: '<svg viewBox="0 0 120 60" aria-hidden="true" focusable="false"><g class="dw-bat__wing dw-bat__wing--l"><path d="M58 30C46 14 30 10 6 16c10 4 14 10 12 18 8-6 16-4 20 4 4-8 12-10 20-8z"/></g><g class="dw-bat__wing dw-bat__wing--r"><path d="M62 30c12-16 28-20 52-14-10 4-14 10-12 18-8-6-16-4-20 4-4-8-12-10-20-8z"/></g><ellipse cx="60" cy="32" rx="9" ry="11"/><path d="M53 23l2-9 4 7h2l4-7 2 9z"/><circle cx="56.5" cy="29" r="1.8" fill="#FFD166"/><circle cx="63.5" cy="29" r="1.8" fill="#FFD166"/></svg>',
    ghost: '<svg viewBox="0 0 80 96" aria-hidden="true" focusable="false"><path d="M40 4C20 4 8 20 8 40v48l10-8 10 8 12-8 12 8 10-8 10 8V40C72 20 60 4 40 4z" fill="#F4EEFF"/><ellipse cx="30" cy="40" rx="4.5" ry="6" fill="#2A1846"/><ellipse cx="50" cy="40" rx="4.5" ry="6" fill="#2A1846"/><ellipse cx="40" cy="54" rx="4" ry="3" fill="#2A1846"/><ellipse cx="22" cy="50" rx="5" ry="3" fill="#FFB3C7" opacity=".7"/><ellipse cx="58" cy="50" rx="5" ry="3" fill="#FFB3C7" opacity=".7"/></svg>',
    pumpkin: '<svg viewBox="0 0 100 90" aria-hidden="true" focusable="false"><path d="M50 18c-3-8 0-14 7-16l3 4c-5 2-6 6-5 12z" fill="#4E8A2E"/><ellipse cx="30" cy="52" rx="24" ry="30" fill="#E86A10"/><ellipse cx="70" cy="52" rx="24" ry="30" fill="#E86A10"/><ellipse cx="50" cy="52" rx="24" ry="33" fill="#FF8A1F"/><g class="dw-glow" fill="#FFE27A"><path d="M30 44l8-10 8 10z"/><path d="M54 44l8-10 8 10z"/><path d="M26 58c8 12 40 12 48 0l-6 2-4-5-5 6-5-6-5 6-5-6-4 5z"/></g></svg>',
    candy: '<svg viewBox="0 0 90 40" aria-hidden="true" focusable="false"><path d="M22 20L4 6v28z" fill="#B983FF"/><path d="M68 20L86 6v28z" fill="#B983FF"/><circle cx="45" cy="20" r="20" fill="#FF7A1A"/><path d="M32 8c6 6 6 18 0 24M45 1c6 8 6 30 0 38M58 8c-6 6-6 18 0 24" stroke="#FFD166" stroke-width="4" fill="none"/></svg>',
    candycorn: '<svg viewBox="0 0 40 50" aria-hidden="true" focusable="false"><path d="M20 2C12 2 2 36 4 44c2 5 30 5 32 0 2-8-8-42-16-42z" fill="#FFF4E6"/><path d="M8 26c-2 8-4 14-4 18 2 5 30 5 32 0 0-4-2-10-4-18z" fill="#FFD166"/><path d="M5 38c-1 3-1 5-1 6 2 5 30 5 32 0 0-1 0-3-1-6z" fill="#FF7A1A"/></svg>',
    web: '<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M0 0L200 200M0 0L200 90M0 0L90 200M0 0L200 20M0 0L20 200"/><path d="M0 40c14 2 26-2 38-12 4 12 2 24-8 36M0 80c26 4 52-6 72-24 8 24 4 48-16 70M0 120c38 6 76-10 104-36 12 34 6 70-24 100M0 160c50 8 100-14 136-48 16 44 8 92-32 128"/></svg>',
    spider: '<svg viewBox="0 0 40 120" aria-hidden="true" focusable="false"><line x1="20" y1="0" x2="20" y2="88" stroke="#D9C8F0" stroke-width="1.2"/><g fill="#120A1F" stroke="#120A1F" stroke-width="2.4" stroke-linecap="round"><path d="M12 92l-9-6M12 98l-10 0M12 104l-9 6M28 92l9-6M28 98l10 0M28 104l9 6" fill="none"/><ellipse cx="20" cy="98" rx="9" ry="10"/><circle cx="20" cy="86" r="6"/></g><circle cx="17.5" cy="85" r="1.6" fill="#fff"/><circle cx="22.5" cy="85" r="1.6" fill="#fff"/></svg>'
  };

  function deco(name, className) {
    return '<span class="dw-deco dw-' + name + ' ' + (className || '') + '" aria-hidden="true">' + SVG[name] + '</span>';
  }

  function placeholderFlag(item, label) {
    return item.placeholder ? '<span class="dw-flag" data-nosnippet>' + esc(label || 'Placeholder · edit seasons/domoween/data.js') + '</span>' : '';
  }

  function heroHTML() {
    return '' +
      '<section class="dw-hero" id="domoween" aria-labelledby="domoween-heading">' +
        '<div class="dw-sky" aria-hidden="true"><span class="dw-moon"></span><span class="dw-stars"></span><span class="dw-stars dw-stars--2"></span>' +
          deco('bat', 'dw-bat--1') + deco('bat', 'dw-bat--2') + deco('bat', 'dw-bat--3') + deco('bat', 'dw-bat--4') +
        '</div>' +
        '<div class="container dw-hero__inner">' +
          '<div class="dw-hero__copy">' +
            '<p class="dw-hero__kicker">October 1 – 31, 2026 · Buena Park</p>' +
            '<h1 id="domoween-heading"><span class="dw-wordmark"><picture class="dw-wordmark__art"><source type="image/svg+xml" srcset="/assets/domoween/domo-ween_wordmark_alt-no-hyphen.svg"><img class="dw-wordmark__img" src="/assets/domoween/domo-ween_wordmark_alt-no-hyphen.png" width="1355" height="179" alt="Domo™ Ween" fetchpriority="high"></picture><span class="dw-sr">Domoween</span></span> <span class="dw-hero__at">at Domo Cafe</span></h1>' +
            '<p class="dw-hero__lede">Domo\'s spooky-cute season is here. All October long, join us for comfort food, cozy vibes, and Halloween fun with Domo and friends.</p>' +
            '<div class="dw-hero__actions">' +
              '<a class="button dw-button" href="' + ORDER_URL + '" target="_blank" rel="noopener">Order Now</a>' +
              '<a class="button dw-button dw-button--ghost" href="' + eventsUrl() + '">October events</a>' +
              '<a class="button dw-button dw-button--ghost" href="#visit">Plan your visit</a>' +
            '</div>' +
            '<p class="dw-hero__links"><a href="/domoween/">All about Domoween <span aria-hidden="true">→</span></a><button type="button" data-dw-rsvp>Stay updated <span aria-hidden="true">→</span></button></p>' +
            '<p class="dw-hero__address">8340 La Palma Ave · Buena Park, CA 90620</p>' +
          '</div>' +
          '<div class="dw-hero__art">' +
            deco('spider', 'dw-spider') +
            '<figure class="dw-poster">' +
              '<picture>' +
                '<source type="image/webp" srcset="' + ART_DIR + 'happy-halloween-domo-kun-banner-800.webp 800w, ' + ART_DIR + 'happy-halloween-domo-kun-banner.webp 1600w" sizes="(max-width: 850px) 94vw, 660px">' +
                '<img src="' + ART_DIR + 'happy-halloween-domo-kun-banner.png" srcset="' + ART_DIR + 'happy-halloween-domo-kun-banner-800.png 800w, ' + ART_DIR + 'happy-halloween-domo-kun-banner.png 1600w" sizes="(max-width: 850px) 94vw, 660px" width="1600" height="803" fetchpriority="high" decoding="async" alt="Official Happy Halloween Domo-kun artwork: Domo in costumes as a witch on a broom, a jack-o\'-lantern, a mummy and Frankenstein\'s monster, with Mr. Usagi, Tashanna, friendly ghosts, bats and a haunted house under a big yellow moon.">' +
              '</picture>' +
            '</figure>' +
          '</div>' +
        '</div>' +
        '<div class="dw-ground" aria-hidden="true">' +
          '<svg class="dw-hills" viewBox="0 0 1440 120" preserveAspectRatio="none" focusable="false"><path d="M0 70C160 30 300 40 430 66s260 34 400 4 320-50 610 10v70H0z" fill="#2A1846"/><path d="M0 96c200-30 380-26 560 2s420 22 580-6 220-12 300 4v24H0z" fill="#120A1F"/></svg>' +
          deco('pumpkin', 'dw-pumpkin--1') + deco('pumpkin', 'dw-pumpkin--2') + deco('pumpkin', 'dw-pumpkin--3') +
          deco('candycorn', 'dw-candycorn--1') + deco('candy', 'dw-candy--1') +
        '</div>' +
      '</section>';
  }

  function countdownHTML() {
    var units = [['days', 'Days'], ['hours', 'Hours'], ['minutes', 'Min'], ['seconds', 'Sec']];
    return '' +
      '<section class="dw-countdown" aria-labelledby="dw-countdown-heading">' +
        deco('ghost', 'dw-ghost--c1') + deco('ghost', 'dw-ghost--c2') +
        '<div class="container dw-countdown__inner">' +
          '<div class="dw-countdown__art dw-countdown__art--left">' + art('wc_43_witch-broom', 'dw-float') + '</div>' +
          '<div class="dw-countdown__copy">' +
            '<h2 id="dw-countdown-heading" class="dw-countdown__title">Countdown to Halloween</h2>' +
            '<div class="dw-countdown__clock" role="timer" aria-live="off" data-dw-clock>' +
              units.map(function (u) {
                return '<div class="dw-tile"><span class="dw-tile__num" data-dw-unit="' + u[0] + '">--</span><span class="dw-tile__label">' + u[1] + '</span></div>';
              }).join('') +
            '</div>' +
            '<p class="dw-countdown__note" data-dw-note>Until Saturday, October 31</p>' +
          '</div>' +
          '<div class="dw-countdown__art dw-countdown__art--right">' + art('wc_41_jack-o-lantern', 'dw-float dw-float--late') + '</div>' +
        '</div>' +
      '</section>';
  }

  function menuHTML() {
    var menu = data.menu || {};
    var items = menu.items || [];
    if (data.showMenu === false || !items.length) return '';
    return '' +
      '<section class="dw-section dw-menu" id="domoween-menu" aria-labelledby="dw-menu-heading">' +
        deco('web', 'dw-web dw-web--tl') + deco('candycorn', 'dw-candycorn--m1') + deco('candy', 'dw-candy--m2') +
        '<div class="container">' +
          '<div class="dw-heading"><p class="dw-eyebrow">Domoween menu</p><h2 id="dw-menu-heading">' + esc(menu.heading || 'Spooky specials') + '</h2>' +
            (menu.intro ? '<p class="dw-heading__intro">' + esc(menu.intro) + '</p>' : '') + '</div>' +
          '<div class="dw-cards">' +
            items.map(function (item) {
              return '<article class="dw-card' + (item.placeholder ? ' dw-card--placeholder' : '') + '">' +
                '<div class="dw-card__stage">' + art(item.art) + '</div>' +
                '<div class="dw-card__copy">' + placeholderFlag(item) +
                  (item.tag ? '<p class="dw-card__tag">' + esc(item.tag) + '</p>' : '') +
                  '<h3>' + esc(item.name) + '</h3>' +
                  (item.description ? '<p>' + esc(item.description) + '</p>' : '') +
                  (item.price ? '<p class="dw-card__price">' + esc(item.price) + '</p>' : '') +
                '</div>' +
              '</article>';
            }).join('') +
          '</div>' +
          '<div class="dw-center"><a class="button dw-button" href="' + ORDER_URL + '" target="_blank" rel="noopener">Order online</a></div>' +
        '</div>' +
      '</section>';
  }

  function eventsUrl() { return '/events/?month=' + theme.start.slice(0, 7); }

  function eventsHTML() {
    if (data.showEvents === false) return '';
    var lib = window.DomoEvents;
    var items = lib ? lib.between(theme.start, theme.end) : [];
    var soon = (lib && lib.comingSoon(theme.start.slice(0, 7))) || 'October events are coming soon! Follow @domokuncafe on Instagram and TikTok for announcements.';
    var body = items.length ? items.slice(0, 4).map(function (item) {
      var link = item.link ? '<a class="dw-ticket__link" href="' + esc(item.link) + '"' + (/^https?:/.test(item.link) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(item.linkLabel || 'Details') + ' <span aria-hidden="true">→</span></a>' : '';
      return '<article class="dw-ticket">' +
        '<div class="dw-ticket__date"><span>' + esc(lib.formatDate(item.date, { short: true })) + '</span><small>' + esc(lib.formatTime(item)) + '</small></div>' +
        '<div class="dw-ticket__body"><h3>' + esc(item.title) + '</h3>' +
          (item.description ? '<p>' + esc(item.description) + '</p>' : '') + link +
          '<a class="dw-ticket__link" href="' + esc(lib.googleUrl(item)) + '" target="_blank" rel="noopener">Add to Google Calendar</a>' +
        '</div>' +
        (ART[item.art] ? '<div class="dw-ticket__art">' + art(item.art) + '</div>' : '') +
      '</article>';
    }).join('') : '<article class="dw-ticket dw-ticket--soon">' +
        '<div class="dw-ticket__date"><span>Coming soon</span></div>' +
        '<div class="dw-ticket__body"><h3>October events</h3><p>' + esc(soon) + '</p>' +
          '<a class="dw-ticket__link" href="' + INSTAGRAM_URL + '" target="_blank" rel="noopener">Instagram <span aria-hidden="true">↗</span></a> ' +
          '<a class="dw-ticket__link" href="' + TIKTOK_URL + '" target="_blank" rel="noopener">TikTok <span aria-hidden="true">↗</span></a>' +
          '<span class="dw-flag" data-nosnippet>Preview note: add events in events/events-data.js</span>' +
        '</div>' +
        '<div class="dw-ticket__art">' + art('wc_53_mr-usagi-pumpkin-mask') + '</div>' +
      '</article>';
    return '' +
      '<section class="dw-section dw-events" id="domoween-events" aria-labelledby="dw-events-heading">' +
        deco('ghost', 'dw-ghost--e1') + deco('ghost', 'dw-ghost--e2') + deco('web', 'dw-web dw-web--tr') +
        '<div class="container">' +
          '<div class="dw-heading"><p class="dw-eyebrow">What\'s happening</p><h2 id="dw-events-heading">October events</h2>' +
            '<p class="dw-heading__intro">Domoween happenings at Domo Cafe, all in one calendar.</p></div>' +
          '<div class="dw-tickets">' + body + '</div>' +
          '<div class="dw-center"><a class="button dw-button" href="' + eventsUrl() + '">See the events calendar</a></div>' +
        '</div>' +
      '</section>';
  }

  function shareHTML() {
    var tag = (data.hashtag || '').trim();
    var tagLine = tag
      ? '<p class="dw-share__tag">Use <strong>' + esc(tag) + '</strong> and tag <strong>@domokuncafe</strong></p>'
      : '<p class="dw-share__tag">Tag <strong>@domokuncafe</strong>' + '<span class="dw-flag" data-nosnippet>Hashtag TBD · add it in seasons/domoween/data.js</span></p>';
    return '' +
      '<section class="dw-section dw-share" id="domoween-share" aria-labelledby="dw-share-heading">' +
        deco('bat', 'dw-bat--s1') + deco('bat', 'dw-bat--s2') +
        '<div class="container dw-share__inner">' +
          '<div class="dw-share__copy">' +
            '<p class="dw-eyebrow">Share the spooky-cute</p>' +
            '<h2 id="dw-share-heading">Show us your Domoween</h2>' +
            '<p>Snapped a spooky-cute photo at Domo Cafe? Post it on Instagram or TikTok so we can see it.</p>' +
            tagLine +
            '<div class="dw-share__actions">' +
              '<a class="button dw-button" href="' + INSTAGRAM_URL + '" target="_blank" rel="noopener">Instagram <span aria-hidden="true">↗</span></a>' +
              '<a class="button dw-button dw-button--ghost" href="' + TIKTOK_URL + '" target="_blank" rel="noopener">TikTok <span aria-hidden="true">↗</span></a>' +
            '</div>' +
          '</div>' +
          '<ul class="dw-crew" aria-label="The Domoween costume crew">' +
            CREW.map(function (key) { return '<li class="dw-crew__item' + (ART[key].lowres ? ' dw-crew__item--small' : '') + '">' + art(key) + '</li>'; }).join('') +
          '</ul>' +
        '</div>' +
      '</section>';
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function startCountdown(slot) {
    var clock = slot.querySelector('[data-dw-clock]');
    if (!clock) return;
    var note = slot.querySelector('[data-dw-note]');
    var title = slot.querySelector('.dw-countdown__title');
    var units = {};
    Array.prototype.forEach.call(clock.querySelectorAll('[data-dw-unit]'), function (el) { units[el.getAttribute('data-dw-unit')] = el; });
    var laMidnight = seasons.laMidnight || function (d) { var p = d.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2], 7); };
    var target = laMidnight(theme.end);
    var simulated = /^\d{4}-\d{2}-\d{2}$/.test(new URLSearchParams(location.search).get('themeDate') || '');
    var skew = simulated ? laMidnight(seasons.today) + 12 * 3600e3 - Date.now() : 0;
    var timer;

    function tick() {
      var now = Date.now() + skew;
      var left = target - now;
      if (left <= 0) {
        var isHalloween = now < target + 864e5;
        clock.hidden = true;
        if (title) title.textContent = isHalloween ? 'Happy Halloween!' : 'Thanks for a spooky-cute Domoween';
        note.textContent = isHalloween ? 'Happy Domoween from all of us at Domo Cafe.' : 'See you next Halloween!';
        note.classList.add('dw-countdown__note--big');
        window.clearInterval(timer);
        return;
      }
      var s = Math.floor(left / 1000);
      var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
      units.days.textContent = d;
      units.hours.textContent = pad(h);
      units.minutes.textContent = pad(m);
      units.seconds.textContent = pad(sec);
      clock.setAttribute('aria-label', d + ' days, ' + h + ' hours and ' + m + ' minutes until Halloween');
    }
    tick();
    timer = window.setInterval(tick, 1000);
  }

  function dressPage() {
    var root = document.documentElement;
    if (seasons.preview) root.classList.add('dw-preview');

    var nav = document.querySelector('.site-nav');
    if (nav && !nav.querySelector('.dw-nav-link')) {
      var link = document.createElement('a');
      link.href = '/domoween/';
      link.className = 'dw-nav-link';
      link.textContent = 'Domoween';
      nav.insertBefore(link, nav.firstChild);
    }

    Array.prototype.forEach.call(document.querySelectorAll('a[href="#top"]'), function (a) { a.setAttribute('href', '#domoween'); });

    var track = document.querySelector('.marquee__track');
    if (track) {
      var phrases = ['Happy Domoween', 'Spooky-cute all October', 'Trick or treat yourself', 'Domo & friends in costume'];
      var html = '';
      for (var r = 0; r < 2; r++) phrases.forEach(function (p) { html += '<span>' + p + '</span><b class="dw-marquee-sep" aria-hidden="true">✦</b>'; });
      track.innerHTML = html;
    }

    var footer = document.querySelector('.site-footer .container');
    if (footer && !footer.querySelector('.dw-legal') && footer.textContent.indexOf('Domo Production Committee') === -1) {
      var legal = document.createElement('p');
      legal.className = 'dw-legal';
      legal.textContent = COPYRIGHT;
      var bottom = footer.querySelector('.footer-bottom');
      footer.insertBefore(legal, bottom || null);
    }

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest && e.target.closest('[data-dw-rsvp]');
      if (!trigger) return;
      var rsvp = document.getElementById('rsvpBtn');
      if (rsvp) rsvp.click();
    });
  }

  function render() {
    dressPage();
    var slot = document.getElementById('season-slot');
    if (!slot) return;
    slot.innerHTML = heroHTML() + countdownHTML() + menuHTML() + eventsHTML() + shareHTML();
    slot.classList.add('dw-slot');
    startCountdown(slot);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
