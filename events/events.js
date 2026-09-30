/**
 * Domo Cafe events: shared helpers + the /events/ calendar.
 * Data lives in /events/events-data.js (window.DOMO_EVENTS).
 *
 * window.DomoEvents exposes helpers used by the calendar page, the Domoween home
 * block and /domoween/: list(), between(), formatDate(), formatTime(),
 * googleUrl(), downloadIcs(), jsonLd(), injectJsonLd().
 */
(function () {
  if (window.DomoEvents) return;
  var TZ = 'America/Los_Angeles';
  var SITE = 'https://www.domokuncafe.com';
  var VENUE = {
    name: 'Domo Cafe',
    street: '8340 La Palma Ave',
    city: 'Buena Park',
    region: 'CA',
    zip: '90620',
    full: 'Domo Cafe, 8340 La Palma Ave, Buena Park, CA 90620'
  };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  var SOCIAL_LINKS = [
    ['https://www.instagram.com/domokuncafe', 'Instagram', ''],
    ['https://www.tiktok.com/@domokuncafe', 'TikTok', ''],
    ['https://www.facebook.com/domokuncafe', 'Facebook', 'Domo Cafe on Facebook']
  ];
  var data = window.DOMO_EVENTS || {};

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || ''); }
  function isTime(v) { return /^\d{1,2}:\d{2}$/.test(v || ''); }
  function parts(date) { return date.split('-').map(Number); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function laToday() {
    if (window.DomoSeasons && window.DomoSeasons.today) return window.DomoSeasons.today;
    try {
      var p = {};
      new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
      return p.year + '-' + p.month + '-' + p.day;
    } catch (e) { return new Date(Date.now() - 8 * 3600e3).toISOString().slice(0, 10); }
  }

  function slug(ev) {
    return 'ev-' + ev.date + '-' + String(ev.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  }

  function weekday(date) { var p = parts(date); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); }
  function shiftDate(date, days) { var p = parts(date); var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }

  // repeat: { days: ["Mon", ...], from: "YYYY-MM-DD", until: "YYYY-MM-DD" } → weekday indexes (0 = Sunday).
  function repeatDays(repeat) {
    if (!repeat || !isDate(repeat.from) || !isDate(repeat.until) || repeat.until < repeat.from || !repeat.days || !repeat.days.length) return null;
    var days = [];
    repeat.days.forEach(function (d) {
      var i = DAYS.map(function (x) { return x.slice(0, 3).toLowerCase(); }).indexOf(String(d).slice(0, 3).toLowerCase());
      if (i > -1 && days.indexOf(i) === -1) days.push(i);
    });
    return days.length ? days.sort() : null;
  }

  function occurrenceDates(ev) {
    if (!ev.repeat) return [ev.date];
    var out = [];
    for (var d = ev.repeat.from; d <= ev.repeat.until; d = shiftDate(d, 1)) if (ev.repeat.dayIndexes.indexOf(weekday(d)) > -1) out.push(d);
    return out;
  }

  function occursOn(ev, date) {
    if (!ev.repeat) return ev.date === date;
    return date >= ev.repeat.from && date <= ev.repeat.until && ev.repeat.dayIndexes.indexOf(weekday(date)) > -1;
  }

  // One item per event; a recurring event is one item whose `date` is its first occurrence and `until` its last.
  function list() {
    var out = [];
    (data.events || []).forEach(function (ev) {
      if (!ev || !ev.title) return;
      var copy = {};
      for (var k in ev) copy[k] = ev[k];
      if (!isTime(copy.startTime)) copy.startTime = '';
      if (!isTime(copy.endTime) || !copy.startTime) copy.endTime = '';
      var dayIndexes = repeatDays(ev.repeat);
      if (dayIndexes) {
        copy.repeat = { from: ev.repeat.from, until: ev.repeat.until, dayIndexes: dayIndexes };
        var dates = occurrenceDates(copy);
        if (!dates.length) return;
        copy.date = dates[0];
        copy.until = dates[dates.length - 1];
      } else {
        if (!isDate(ev.date)) return;
        delete copy.repeat;
        copy.until = copy.date;
      }
      copy.id = slug({ date: copy.repeat ? copy.repeat.from : copy.date, title: copy.title });
      out.push(copy);
    });
    return out.sort(function (a, b) { return (a.date + (a.startTime || '00:00')).localeCompare(b.date + (b.startTime || '00:00')); });
  }

  function between(start, end) {
    return list().filter(function (ev) { return ev.date <= end && ev.until >= start; });
  }

  function daysLabel(ev) {
    var d = ev.repeat.dayIndexes;
    if (d.join() === '1,2,3,4,5') return 'Weekdays (Mon–Fri)';
    if (d.join() === '0,6') return 'Weekends (Sat–Sun)';
    return 'Every ' + d.map(function (i) { return DAYS[i].slice(0, 3); }).join(', ');
  }

  function rangeLabel(from, until) {
    var a = parts(from), b = parts(until);
    if (a[0] === b[0] && a[1] === b[1]) return MONTHS[a[1] - 1] + ' ' + a[2] + ' – ' + b[2];
    return MONTHS[a[1] - 1] + ' ' + a[2] + ' – ' + MONTHS[b[1] - 1] + ' ' + b[2];
  }

  // "Saturday, October 17" or "Weekdays (Mon–Fri), October 1 – 31"
  function whenLabel(ev) { return ev.repeat ? daysLabel(ev) + ', ' + rangeLabel(ev.repeat.from, ev.repeat.until) : formatDate(ev.date); }
  // Compact badge text: "Sat, October 17" or "Mon–Fri"
  function shortWhen(ev) {
    if (!ev.repeat) return formatDate(ev.date, { short: true });
    var d = ev.repeat.dayIndexes.join();
    return d === '1,2,3,4,5' ? 'Mon–Fri' : d === '0,6' ? 'Sat–Sun' : ev.repeat.dayIndexes.map(function (i) { return DAYS[i].slice(0, 3); }).join(', ');
  }

  // Dot-leader price card for events with a `menu` (e.g. Domo Hour). opts: { level: 3, footer: html }
  function menuCardHTML(ev, opts) {
    opts = opts || {};
    var groups = (ev.menu || []).filter(function (g) { return g && g.heading && g.items && g.items.length; });
    if (!groups.length) return '';
    var level = opts.level || 3, headId = ev.id + '-menu';
    return '<article class="dh-menu" aria-labelledby="' + esc(headId) + '"><div class="dh-menu__cols">' +
      groups.map(function (g, i) {
        var tag = 'h' + (i ? level + 1 : level);
        return '<div class="dh-menu__group">' +
          '<' + tag + ' class="dh-menu__title' + (i ? ' dh-menu__title--sub' : '') + '"' + (i ? '' : ' id="' + esc(headId) + '"') + '>' + esc(g.heading) + '</' + tag + '>' +
          (g.note ? '<p class="dh-menu__note">' + esc(g.note) + '</p>' : '') +
          '<ul class="dh-menu__list">' + g.items.map(function (item) {
            return '<li><span class="dh-menu__name">' + esc(item.name) + '</span><span class="dh-menu__dots" aria-hidden="true"></span><span class="dh-menu__price">' + esc(item.price) + '</span></li>';
          }).join('') + '</ul></div>';
      }).join('') + '</div>' +
      (opts.footer ? '<div class="dh-menu__foot">' + opts.footer + '</div>' : '') + '</article>';
  }

  function socialLinks(className, extraClass) {
    return SOCIAL_LINKS.map(function (s, i) {
      return '<a class="' + className + (i && extraClass ? ' ' + extraClass : '') + '" href="' + s[0] + '" target="_blank" rel="noopener"' + (s[2] ? ' aria-label="' + s[2] + '"' : '') + '>' + s[1] + ' <span aria-hidden="true">↗</span></a>';
    }).join(' ');
  }

  function formatDate(date, opts) {
    var p = parts(date);
    var text = MONTHS[p[1] - 1] + ' ' + p[2];
    if (opts && opts.year) text += ', ' + p[0];
    return (opts && opts.short ? DAYS[weekday(date)].slice(0, 3) : DAYS[weekday(date)]) + ', ' + text;
  }

  function clock(t) {
    var hm = t.split(':').map(Number);
    var h = hm[0] % 12 || 12;
    return { text: h + (hm[1] ? ':' + pad(hm[1]) : ''), ampm: hm[0] < 12 ? 'am' : 'pm' };
  }

  function formatTime(ev) {
    if (!ev.startTime) return 'All day';
    var s = clock(ev.startTime);
    if (!ev.endTime) return s.text + ' ' + s.ampm;
    var e = clock(ev.endTime);
    return s.ampm === e.ampm ? s.text + ' – ' + e.text + ' ' + e.ampm : s.text + ' ' + s.ampm + ' – ' + e.text + ' ' + e.ampm;
  }

  function addMinutes(date, time, minutes) {
    var p = parts(date), hm = time.split(':').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2], hm[0], hm[1] + minutes));
    return { date: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()), time: pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) };
  }

  function nextDay(date) { return addMinutes(date, '00:00', 1440).date; }

  // Local wall-clock start/end; default 1 hour when no end time is given.
  function span(ev) {
    if (!ev.startTime) return { allDay: true, start: { date: ev.date }, end: { date: nextDay(ev.date) } };
    var end = ev.endTime ? { date: ev.date, time: ev.endTime } : addMinutes(ev.date, ev.startTime, 60);
    if (ev.endTime && ev.endTime <= ev.startTime) end = { date: nextDay(ev.date), time: ev.endTime };
    return { allDay: false, start: { date: ev.date, time: ev.startTime }, end: end };
  }

  function compact(point) { return point.date.replace(/-/g, '') + (point.time ? 'T' + point.time.replace(':', '') + '00' : ''); }

  // US Pacific offset for a local date/time (DST: 2nd Sunday of March 2am to 1st Sunday of November 2am).
  function offset(point) {
    var p = parts(point.date);
    function nthSunday(month, n) { var first = new Date(Date.UTC(p[0], month, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + (n - 1) * 7; }
    var t = (point.time || '12:00').replace(':', '');
    var md = pad(p[1]) + pad(p[2]);
    var dstStart = '03' + pad(nthSunday(2, 2)), dstEnd = '11' + pad(nthSunday(10, 1));
    var dst = (md > dstStart || (md === dstStart && t >= '0200')) && (md < dstEnd || (md === dstEnd && t < '0200'));
    return dst ? '-07:00' : '-08:00';
  }

  function utcStamp(point) {
    var p = parts(point.date), hm = (point.time || '23:59').split(':').map(Number);
    var off = offset(point), sign = off.charAt(0) === '-' ? 1 : -1, oh = Number(off.slice(1, 3));
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2], hm[0] + sign * oh, hm[1], point.time ? 0 : 59));
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  }

  function rrule(ev) {
    var s = span(ev);
    var until = s.allDay ? ev.until.replace(/-/g, '') : utcStamp({ date: ev.until, time: s.end.time && s.end.date === ev.date ? s.end.time : '' });
    return 'FREQ=WEEKLY;BYDAY=' + ev.repeat.dayIndexes.map(function (i) { return RRULE_DAYS[i]; }).join(',') + ';UNTIL=' + until;
  }

  function details(ev) {
    return [ev.description, ev.link ? ev.link : '', SITE + '/events/?month=' + ev.date.slice(0, 7)].filter(Boolean).join('\n\n');
  }

  function googleUrl(ev) {
    var s = span(ev);
    var q = {
      action: 'TEMPLATE',
      text: ev.title + ' at Domo Cafe',
      dates: compact(s.start) + '/' + compact(s.end),
      details: details(ev),
      location: VENUE.full
    };
    if (!s.allDay) q.ctz = TZ;
    if (ev.repeat) q.recur = 'RRULE:' + rrule(ev);
    return 'https://calendar.google.com/calendar/render?' + Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
  }

  function icsText(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
  function fold(line) {
    var out = '';
    while (line.length > 74) { out += line.slice(0, 74) + '\r\n '; line = line.slice(74); }
    return out + line;
  }

  function icsFor(ev) {
    var s = span(ev);
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Domo Cafe//Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    if (!s.allDay) {
      lines.push('BEGIN:VTIMEZONE', 'TZID:' + TZ,
        'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0800', 'TZOFFSETTO:-0700', 'TZNAME:PDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
        'BEGIN:STANDARD', 'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0800', 'TZNAME:PST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
        'END:VTIMEZONE');
    }
    lines.push('BEGIN:VEVENT', 'UID:' + ev.id + '@domokuncafe.com', 'DTSTAMP:' + stamp);
    if (s.allDay) lines.push('DTSTART;VALUE=DATE:' + compact(s.start), 'DTEND;VALUE=DATE:' + compact(s.end));
    else lines.push('DTSTART;TZID=' + TZ + ':' + compact(s.start), 'DTEND;TZID=' + TZ + ':' + compact(s.end));
    if (ev.repeat) lines.push('RRULE:' + rrule(ev));
    lines.push('SUMMARY:' + icsText(ev.title + ' at Domo Cafe'), 'DESCRIPTION:' + icsText(details(ev)), 'LOCATION:' + icsText(VENUE.full),
      'URL:' + (ev.link || SITE + '/events/?month=' + ev.date.slice(0, 7)), 'END:VEVENT', 'END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  function downloadIcs(ev) {
    var blob = new Blob([icsFor(ev)], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ev.id.replace(/^ev-/, 'domo-cafe-') + '.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function jsonLd(ev) {
    var s = span(ev);
    function iso(point) { return point.time ? point.date + 'T' + point.time + ':00' + offset(point) : point.date; }
    var node = {
      '@type': 'Event',
      name: ev.title,
      startDate: iso(s.start),
      endDate: s.allDay ? ev.date : iso(s.end),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Restaurant', '@id': SITE + '/#restaurant', name: VENUE.name, address: { '@type': 'PostalAddress', streetAddress: VENUE.street, addressLocality: VENUE.city, addressRegion: VENUE.region, postalCode: VENUE.zip, addressCountry: 'US' } },
      organizer: { '@type': 'Organization', name: VENUE.name, url: SITE + '/' },
      image: [SITE + (ev.series === 'Domoween' ? '/assets/domoween/happy-halloween-domo-kun-banner.png' : '/domo-cafe-logo-transparent.png')],
      url: ev.link || SITE + '/events/?month=' + ev.date.slice(0, 7) + '#' + ev.id
    };
    if (ev.description) node.description = ev.description;
    if (ev.series === 'Domoween') node.superEvent = { '@id': SITE + '/domoween/#event' };
    if (ev.repeat) {
      var last = span({ date: ev.until, startTime: ev.startTime, endTime: ev.endTime });
      node.endDate = s.allDay ? ev.until : iso(last.end);
      node.eventSchedule = {
        '@type': 'Schedule',
        repeatFrequency: 'P1W',
        byDay: ev.repeat.dayIndexes.map(function (i) { return 'https://schema.org/' + DAYS[i]; }),
        startDate: ev.repeat.from,
        endDate: ev.repeat.until,
        scheduleTimezone: TZ
      };
      if (!s.allDay) { node.eventSchedule.startTime = ev.startTime + ':00'; node.eventSchedule.endTime = s.end.time + ':00'; }
    }
    return node;
  }

  function injectJsonLd(events) {
    if (!events.length) return;
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-events', '');
    script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': events.map(jsonLd) });
    document.head.appendChild(script);
  }

  function calendarButtons(ev) {
    return '<a class="ev-btn" href="' + esc(googleUrl(ev)) + '" target="_blank" rel="noopener">Add to Google Calendar</a>' +
      '<button class="ev-btn" type="button" data-ics="' + esc(ev.id) + '">Download .ics</button>';
  }

  function bindIcs(root, events) {
    root.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-ics]');
      if (!btn) return;
      var id = btn.getAttribute('data-ics');
      for (var i = 0; i < events.length; i++) if (events[i].id === id) return downloadIcs(events[i]);
    });
  }

  window.DomoEvents = {
    list: list, between: between, occurrenceDates: occurrenceDates, formatDate: formatDate, formatTime: formatTime, whenLabel: whenLabel, shortWhen: shortWhen, socialLinks: socialLinks, menuCardHTML: menuCardHTML, googleUrl: googleUrl,
    icsFor: icsFor, downloadIcs: downloadIcs, jsonLd: jsonLd, injectJsonLd: injectJsonLd, calendarButtons: calendarButtons,
    bindIcs: bindIcs, comingSoon: function (month) { return (data.comingSoon || {})[month] || ''; }, today: laToday, esc: esc, MONTHS: MONTHS
  };

  /* ---------- /events/ calendar page ---------- */
  function monthAdd(key, n) { var p = key.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); }
  function monthLabel(key) { var p = key.split('-').map(Number); return MONTHS[p[1] - 1] + ' ' + p[0]; }

  function initCalendar(app) {
    var events = list();
    var todayKey = laToday().slice(0, 7);
    var param = new URLSearchParams(location.search).get('month');
    var month = /^\d{4}-\d{2}$/.test(param || '') ? param : todayKey;
    var first = events.length && events[0].date.slice(0, 7) < todayKey ? events[0].date.slice(0, 7) : monthAdd(todayKey, -1);
    var lastEvent = events.length ? events[events.length - 1].date.slice(0, 7) : todayKey;
    var last = lastEvent > monthAdd(todayKey, 12) ? lastEvent : monthAdd(todayKey, 12);
    if (month < first) first = month;
    if (month > last) last = month;
    var preview = window.DomoSeasons && window.DomoSeasons.preview;

    var titleEl = app.querySelector('[data-cal-title]');
    var gridEl = app.querySelector('[data-cal-grid]');
    var listEl = app.querySelector('[data-cal-list]');
    var prev = app.querySelector('[data-cal-prev]');
    var next = app.querySelector('[data-cal-next]');

    function render() {
      var monthEnd = month + '-' + pad(new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate());
      var monthEvents = events.filter(function (ev) { return ev.date <= monthEnd && ev.until >= month + '-01'; });
      var hasOneOff = monthEvents.some(function (ev) { return !ev.repeat; });
      titleEl.textContent = monthLabel(month);
      prev.disabled = month <= first;
      next.disabled = month >= last;
      prev.setAttribute('aria-label', 'Previous month, ' + monthLabel(monthAdd(month, -1)));
      next.setAttribute('aria-label', 'Next month, ' + monthLabel(monthAdd(month, 1)));

      var p = month.split('-').map(Number);
      var lead = new Date(Date.UTC(p[0], p[1] - 1, 1)).getUTCDay();
      var days = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
      var today = laToday();
      var cells = DAYS.map(function (d) { return '<li class="cal-dow">' + d.slice(0, 3) + '</li>'; }).join('');
      for (var i = 0; i < lead; i++) cells += '<li class="cal-day cal-day--blank"></li>';
      for (var day = 1; day <= days; day++) {
        var date = month + '-' + pad(day);
        var dayEvents = monthEvents.filter(function (ev) { return occursOn(ev, date); });
        cells += '<li class="cal-day' + (date === today ? ' cal-day--today' : '') + (dayEvents.length ? ' cal-day--has' : '') + '"><span class="cal-num">' + day + '</span>' +
          dayEvents.map(function (ev) {
            return '<a class="cal-chip" tabindex="-1" href="#' + ev.id + '"><span class="cal-chip__time">' + esc(ev.startTime ? formatTime({ startTime: ev.startTime }) : 'All day') + '</span> ' + esc(ev.title) + '</a>';
          }).join('') + '</li>';
      }
      gridEl.innerHTML = cells;

      if (!monthEvents.length) {
        var soon = window.DomoEvents.comingSoon(month);
        var msg = soon || 'No events posted for ' + monthLabel(month) + ' yet. Follow @domokuncafe on Instagram, TikTok and Facebook for the latest.';
        listEl.innerHTML = '<div class="ev-empty"><h3>' + (soon ? 'Coming soon' : 'Nothing on the calendar yet') + '</h3><p>' + esc(msg) + '</p>' +
          '<p class="ev-empty__links">' + socialLinks('button', 'button--outline') + '</p>' +
          (preview ? '<p class="ev-dev-note">Preview note: add events for this month in events/events-data.js</p>' : '') + '</div>';
      } else {
        listEl.innerHTML = '<h3 class="ev-list__title">' + monthEvents.length + (monthEvents.length === 1 ? ' event' : ' events') + ' in ' + esc(monthLabel(month)) + '</h3>' +
          monthEvents.map(function (ev) {
            var p2 = parts(ev.repeat ? ev.repeat.from : ev.date), p3 = parts(ev.repeat ? ev.repeat.until : ev.until);
            var badge = ev.repeat
              ? '<span>' + esc(shortWhen(ev)) + '</span><strong>' + MONTHS[p2[1] - 1].slice(0, 3) + '</strong><span>' + p2[2] + '–' + p3[2] + '</span>'
              : '<span>' + DAYS[weekday(ev.date)].slice(0, 3) + '</span><strong>' + p2[2] + '</strong><span>' + MONTHS[p2[1] - 1].slice(0, 3) + '</span>';
            return '<article class="ev-card" id="' + esc(ev.id) + '">' +
              '<div class="ev-card__date" aria-hidden="true">' + badge + '</div>' +
              '<div class="ev-card__body">' +
                (ev.series ? '<p class="ev-card__series">' + esc(ev.series) + '</p>' : '') +
                '<h3>' + esc(ev.title) + '</h3>' +
                '<p class="ev-card__when"><time datetime="' + esc(ev.date + (ev.startTime ? 'T' + ev.startTime : '')) + '">' + esc(whenLabel(ev)) + ' · ' + esc(formatTime(ev)) + '</time></p>' +
                (ev.menu ? menuCardHTML(ev, { level: 4 }) : ev.description ? '<p>' + esc(ev.description) + '</p>' : '') +
                '<div class="ev-card__actions">' +
                  (ev.link ? '<a class="ev-btn ev-btn--primary" href="' + esc(ev.link) + '"' + (/^https?:/.test(ev.link) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(ev.linkLabel || 'Details') + '</a>' : '') +
                  calendarButtons(ev) +
                '</div>' +
              '</div>' +
            '</article>';
          }).join('') +
          (!hasOneOff && window.DomoEvents.comingSoon(month)
            ? '<div class="ev-empty ev-empty--more"><h3>More coming soon</h3><p>' + esc(window.DomoEvents.comingSoon(month)) + '</p><p class="ev-empty__links">' + socialLinks('button', 'button--outline') + '</p></div>'
            : '');
      }
    }

    function go(delta) {
      month = monthAdd(month, delta);
      var url = new URL(location.href);
      url.searchParams.set('month', month);
      history.replaceState(null, '', url.pathname + url.search);
      render();
    }
    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    bindIcs(listEl, events);
    render();
    injectJsonLd(events);
  }

  function boot() {
    var app = document.getElementById('events-app');
    if (app) initCalendar(app);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
