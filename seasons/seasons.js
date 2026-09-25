/**
 * Domo Cafe seasonal themes.
 *
 * Load synchronously at the end of <head> (after the page's own <style>):
 *   <script src="seasons/seasons.js"></script>
 * and add an empty slot where seasonal sections render:
 *   <div id="season-slot"></div>
 *
 * Picks at most one theme from THEMES using today's date in
 * America/Los_Angeles, sets <html data-theme="...">, and loads that theme's
 * CSS/JS. Outside every window the page is untouched (data-theme="normal").
 *
 * Preview overrides (sticky for the browser tab via sessionStorage):
 *   ?theme=domoween   force Domoween on
 *   ?theme=normal     force the regular site
 *   ?theme=auto       clear the override and follow the calendar again
 *   ?themeDate=2026-11-01   pretend "today" is this LA date (not sticky; QA only)
 * See seasons/README.md.
 */
(function () {
  var TIME_ZONE = 'America/Los_Angeles';
  var BASE = 'seasons/';

  // Start/end are inclusive calendar days in America/Los_Angeles.
  // To add a season, append an entry and create seasons/<id>/ with the same files.
  var THEMES = [
    {
      id: 'domoween',
      label: 'Domoween',
      start: '2026-10-01',
      end: '2026-10-31',
      themeColor: '#1B1030',
      fonts: 'https://fonts.googleapis.com/css2?family=Chewy&family=Griffy&display=swap',
      css: ['domoween/domoween.css'],
      js: ['domoween/data.js', 'domoween/domoween.js'],
      critical:
        'html[data-theme="domoween"] body{background:#1B1030;color:#F6EEFF}' +
        'html[data-theme="domoween"] .hero{display:none}' +
        'html[data-theme="domoween"] #season-slot{min-height:640px}'
    }
    // Example for later (not built yet):
    // { id: 'harvest', label: 'Fall / Thanksgiving', start: '2026-11-01', end: '2026-11-30',
    //   themeColor: '#5A2E12', css: ['harvest/harvest.css'], js: ['harvest/data.js', 'harvest/harvest.js'] }
  ];

  var STORAGE_KEY = 'domo-theme-override';
  var root = document.documentElement;
  var params;
  try { params = new URLSearchParams(location.search); } catch (e) { params = { get: function () { return null; } }; }

  function laToday() {
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      var map = {};
      parts.forEach(function (p) { map[p.type] = p.value; });
      return map.year + '-' + map.month + '-' + map.day;
    } catch (e) {
      // Very old browsers: approximate LA as UTC-8 year-round.
      return new Date(Date.now() - 8 * 3600e3).toISOString().slice(0, 10);
    }
  }

  function isDateString(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || ''); }

  function findTheme(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return null;
  }

  function storage(action, value) {
    try {
      if (action === 'get') return sessionStorage.getItem(STORAGE_KEY);
      if (action === 'set') sessionStorage.setItem(STORAGE_KEY, value);
      if (action === 'clear') sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    return null;
  }

  var requested = (params.get('theme') || '').toLowerCase();
  if (requested === 'auto') storage('clear');
  else if (requested === 'normal' || findTheme(requested)) storage('set', requested);

  var override = storage('get');
  if (!override && (requested === 'normal' || findTheme(requested))) override = requested;

  var simulatedDate = params.get('themeDate');
  var today = isDateString(simulatedDate) ? simulatedDate : laToday();

  var scheduled = null;
  for (var i = 0; i < THEMES.length; i++) {
    if (today >= THEMES[i].start && today <= THEMES[i].end) { scheduled = THEMES[i]; break; }
  }

  var active = override === 'normal' ? null : (findTheme(override) || scheduled);
  var id = active ? active.id : 'normal';
  root.setAttribute('data-theme', id);

  window.DomoSeasons = {
    themes: THEMES,
    active: active,
    scheduled: scheduled,
    today: today,
    timeZone: TIME_ZONE,
    preview: !!override || isDateString(simulatedDate),
    base: BASE,
    /** UTC milliseconds for 00:00 on an America/Los_Angeles calendar day. */
    laMidnight: function (dateString) {
      var p = dateString.split('-').map(Number);
      var fmt;
      try { fmt = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }); } catch (e) { fmt = null; }
      for (var offset = 7; offset <= 8; offset++) {
        var t = Date.UTC(p[0], p[1] - 1, p[2], offset);
        if (!fmt) return Date.UTC(p[0], p[1] - 1, p[2], 8);
        var s = fmt.format(new Date(t));
        if (s.indexOf(dateString.slice(5, 7) + '/' + dateString.slice(8, 10)) === 0 && /\b(00|24)$/.test(s)) return t;
      }
      return Date.UTC(p[0], p[1] - 1, p[2], 8);
    }
  };

  if (active) {
    var head = document.head;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && active.themeColor) meta.setAttribute('content', active.themeColor);
    if (active.critical) {
      var style = document.createElement('style');
      style.textContent = active.critical;
      head.appendChild(style);
    }
    if (active.fonts) {
      var font = document.createElement('link');
      font.rel = 'stylesheet';
      font.href = active.fonts;
      head.appendChild(font);
    }
    (active.css || []).forEach(function (href) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = BASE + href;
      link.setAttribute('blocking', 'render');
      head.appendChild(link);
    });
    (active.js || []).forEach(function (src) {
      var script = document.createElement('script');
      script.src = BASE + src;
      script.async = false;
      head.appendChild(script);
    });
  }

  if (window.DomoSeasons.preview) {
    document.addEventListener('DOMContentLoaded', function () {
      var bar = document.createElement('div');
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', 'Theme preview controls');
      bar.setAttribute('data-nosnippet', '');
      // In normal flow above the header so it never covers page content or artwork.
      bar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;padding:7px 12px;background:#111;color:#fff;font:600 12px/1.3 system-ui,sans-serif';
      var label = document.createElement('span');
      label.textContent = 'Preview: ' + (active ? active.label : 'Normal') + (isDateString(simulatedDate) ? ' (as of ' + simulatedDate + ')' : '');
      bar.appendChild(label);
      [['auto', 'Auto (calendar)'], ['normal', 'Normal']].concat(THEMES.map(function (t) { return [t.id, t.label]; })).forEach(function (opt) {
        var a = document.createElement('a');
        a.href = '?theme=' + opt[0];
        a.textContent = opt[1];
        a.style.cssText = 'color:#111;background:' + ((override || 'auto') === opt[0] ? '#FFB347' : '#eee') + ';padding:3px 8px;border-radius:999px;text-decoration:none';
        bar.appendChild(a);
      });
      document.body.insertBefore(bar, document.body.firstChild);
    });
  }
})();
