#!/usr/bin/env node
/**
 * Generate read-only agent files from data/site-facts.json.
 *
 * Also reads events/events-data.js when that file exists (added by the
 * Domoween / events calendar work). Dated events are never invented here.
 *
 * GitHub Pages publishes the committed files as-is. Re-run this script and
 * commit the output after site-facts or events-data.js changes:
 *   node tools/build-agent-files.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const factsPath = path.join(root, 'data', 'site-facts.json');

const CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'Google-Extended',
  'Googlebot',
  'GoogleOther',
  'Applebot',
  'Applebot-Extended',
  'Bingbot',
  'Amazonbot',
  'FacebookBot',
  'Meta-ExternalAgent',
  'CCBot',
  'anthropic-ai',
  'cohere-ai',
  'DuckDuckBot',
  'YouBot'
];

// Not guest content, or stale drafts whose hours/prices contradict the homepage.
const DISALLOW = [
  '/dashboard',
  '/dashboard.html',
  '/staff',
  '/staff.html',
  '/index-hours-test.html',
  '/preview-july4-banner.html',
  '/community.html',
  '/community-bphs-tennis.html'
];

function loadFacts() {
  return JSON.parse(fs.readFileSync(factsPath, 'utf8'));
}

function addressLine(facts) {
  const a = facts.address;
  return `${a.streetAddress}, ${a.addressLocality}, ${a.addressRegion} ${a.postalCode}`;
}

function imageUrl(filename) {
  return 'https://www.domokuncafe.com/assets/menu/doordash/' + encodeURIComponent(filename);
}

function imagePath(filename) {
  return '/assets/menu/doordash/' + encodeURIComponent(filename);
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hoursPhrase(facts) {
  return facts.hours
    .map((row) => `${row.label} ${row.displayOpens}–${row.displayCloses}`)
    .join('; ');
}

function assertMenuImages(facts) {
  const dir = path.join(root, 'assets', 'menu', 'doordash');
  const disk = new Set(fs.readdirSync(dir).filter((name) => !name.startsWith('.')));
  const named = facts.items.map((item) => item.image);
  const namedSet = new Set(named);
  if (namedSet.size !== named.length) {
    throw new Error('Duplicate menu image filenames in site-facts.json');
  }
  const missing = named.filter((name) => !disk.has(name));
  const extra = [...disk].filter((name) => !namedSet.has(name));
  if (missing.length || extra.length) {
    throw new Error(
      'Menu photos and data/site-facts.json items are out of sync. Missing: ' +
        (missing.join(', ') || 'none') +
        '. Extra files: ' +
        (extra.join(', ') || 'none')
    );
  }
  for (const highlight of facts.highlights) {
    if (highlight.image && !disk.has(highlight.image)) {
      throw new Error('Highlight photo not on disk: ' + highlight.image);
    }
  }
}

function itemsWithCopy(facts) {
  const highlights = new Map(
    facts.highlights.filter((item) => item.isDistinctMenuItem !== false).map((item) => [item.name, item])
  );
  return facts.items.map((item) => {
    const highlight = highlights.get(item.name);
    return {
      name: item.name,
      image: item.image,
      imageUrl: imageUrl(item.image),
      imagePath: imagePath(item.image),
      tag: highlight && highlight.tag ? highlight.tag : null,
      description: highlight && highlight.description ? highlight.description : null,
      price: null
    };
  });
}

function postalAddress(facts) {
  const a = facts.address;
  return {
    '@type': 'PostalAddress',
    streetAddress: a.streetAddress,
    addressLocality: a.addressLocality,
    addressRegion: a.addressRegion,
    postalCode: a.postalCode,
    addressCountry: a.addressCountry
  };
}

function openingHours(facts) {
  return facts.hours.map((row) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: row.days,
    opens: row.opens,
    closes: row.closes
  }));
}

function menuNode(facts, items) {
  return {
    '@type': 'Menu',
    '@id': facts.menuId,
    name: 'Domo Cafe menu',
    url: facts.menuUrl,
    description: facts.priceNote + ' Item names match the dishes shown on the Domo Cafe website.',
    hasMenuSection: {
      '@type': 'MenuSection',
      name: 'Dishes shown on the website',
      hasMenuItem: items.map((item) => {
        const node = {
          '@type': 'MenuItem',
          name: item.name,
          image: item.imageUrl,
          url: facts.menuUrl + '#' + slug(item.name)
        };
        if (item.description) node.description = item.description;
        return node;
      })
    }
  };
}

function restaurantNode(facts) {
  return {
    '@type': ['CafeOrCoffeeShop', 'Restaurant', 'LocalBusiness'],
    '@id': facts.id,
    name: facts.name,
    url: facts.url,
    image: facts.image,
    logo: facts.logo,
    description: facts.tagline + ' ' + facts.licensing.heading + '.',
    slogan: facts.slogan,
    telephone: facts.telephoneE164,
    email: facts.email,
    servesCuisine: facts.cuisine,
    address: postalAddress(facts),
    hasMap: facts.mapUrl,
    openingHoursSpecification: openingHours(facts),
    hasMenu: { '@id': facts.menuId },
    amenityFeature: {
      '@type': 'LocationFeatureSpecification',
      name: 'Free parking',
      value: true,
      description: facts.parking
    },
    sameAs: facts.sameAs,
    potentialAction: [
      {
        '@type': 'OrderAction',
        name: facts.order.linkText,
        target: facts.order.url
      },
      {
        '@type': 'ViewAction',
        name: 'Read the text menu',
        target: facts.menuUrl
      },
      {
        '@type': 'ViewAction',
        name: 'Directions to ' + facts.address.streetAddress,
        target: facts.mapUrl
      }
    ]
  };
}

function websiteNode(facts) {
  return {
    '@type': 'WebSite',
    '@id': 'https://www.domokuncafe.com/#website',
    name: facts.name,
    url: facts.url,
    description: facts.metaDescription,
    publisher: { '@id': facts.id },
    about: { '@id': facts.id },
    inLanguage: 'en-US'
  };
}

function organizationNode(facts) {
  return {
    '@type': 'Organization',
    '@id': 'https://www.domokuncafe.com/#organization',
    name: facts.name,
    url: facts.url,
    logo: facts.logo,
    email: facts.email,
    telephone: facts.telephoneE164,
    sameAs: facts.sameAs,
    address: postalAddress(facts)
  };
}

function breadcrumbNode(id, crumbs) {
  return {
    '@type': 'BreadcrumbList',
    '@id': id,
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.item
    }))
  };
}

function pageGraph(facts, items, page) {
  const restaurant = restaurantNode(facts);
  const menu = menuNode(facts, items);
  const website = websiteNode(facts);
  const organization = organizationNode(facts);
  if (page === 'home') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        restaurant,
        organization,
        website,
        {
          '@type': 'WebPage',
          '@id': 'https://www.domokuncafe.com/#webpage',
          url: facts.url,
          name: facts.pageTitle,
          description: facts.metaDescription,
          isPartOf: { '@id': website['@id'] },
          about: { '@id': facts.id },
          mainEntity: { '@id': facts.id },
          primaryImageOfPage: facts.image,
          inLanguage: 'en-US',
          breadcrumb: { '@id': 'https://www.domokuncafe.com/#breadcrumb' }
        },
        menu,
        breadcrumbNode('https://www.domokuncafe.com/#breadcrumb', [
          { name: 'Domo Cafe', item: facts.url }
        ])
      ]
    };
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      restaurant,
      organization,
      website,
      {
        '@type': 'WebPage',
        '@id': facts.menuUrl + '#webpage',
        url: facts.menuUrl,
        name: 'Menu | Domo Cafe',
        description: facts.priceNote + ' ' + facts.menuIntro,
        isPartOf: { '@id': website['@id'] },
        about: { '@id': facts.id },
        mainEntity: { '@id': facts.menuId },
        inLanguage: 'en-US',
        breadcrumb: { '@id': facts.menuUrl + '#breadcrumb' }
      },
      menu,
      breadcrumbNode(facts.menuUrl + '#breadcrumb', [
        { name: 'Domo Cafe', item: facts.url },
        { name: 'Menu', item: facts.menuUrl }
      ])
    ]
  };
}

function slug(name) {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function pacificIso(date, time) {
  if (!time) return date;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !clock) {
    throw new Error('Bad event date or time: ' + date + ' ' + time);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  function offsetMinutes(instant) {
    const tz = formatter.formatToParts(instant).find((part) => part.type === 'timeZoneName');
    const parsed = tz && tz.value.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (!parsed) throw new Error('Could not read Pacific offset for ' + date + ' ' + time);
    const sign = parsed[1] === '-' ? -1 : 1;
    return sign * (Number(parsed[2]) * 60 + Number(parsed[3] || 0));
  }
  let offset = offsetMinutes(new Date(Date.UTC(year, month - 1, day, hour, minute, 0)));
  let instant = new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60000);
  offset = offsetMinutes(instant);
  const sign = offset <= 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return date + 'T' + time + ':00' + sign + hh + ':' + mm;
}

function loadEvents() {
  const file = path.join(root, 'events', 'events-data.js');
  if (!fs.existsSync(file)) {
    return { present: false, events: [], comingSoon: {} };
  }
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  const data = context.window.DOMO_EVENTS;
  if (!data || !Array.isArray(data.events)) {
    throw new Error('events/events-data.js did not set window.DOMO_EVENTS.events');
  }
  for (const event of data.events) {
    if (!event || !event.date || !event.title) {
      throw new Error('Each event in events-data.js needs a date and a title');
    }
  }
  return {
    present: true,
    events: data.events,
    comingSoon: data.comingSoon || {}
  };
}

function eventNodes(events) {
  return events.map((event, index) => {
    const node = {
      '@type': 'Event',
      '@id': 'https://www.domokuncafe.com/events.json#event-' + (index + 1),
      name: event.title,
      startDate: pacificIso(event.date, event.startTime || ''),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@id': 'https://www.domokuncafe.com/#restaurant' },
      organizer: { '@id': 'https://www.domokuncafe.com/#restaurant' }
    };
    if (event.endTime) node.endDate = pacificIso(event.date, event.endTime);
    if (event.description) node.description = event.description;
    if (event.link) node.url = event.link;
    else if (fs.existsSync(path.join(root, 'events', 'index.html'))) node.url = 'https://www.domokuncafe.com/events/';
    return node;
  });
}

function eventsDocument(facts, loaded) {
  const nodes = eventNodes(loaded.events);
  const programSentence = facts.programs
    .map((program) => program.name + ': ' + program.description)
    .join(' ');
  const description = loaded.events.length
    ? 'Dated events from events/events-data.js.'
    : 'No dated events are published on this version of the site. ' + programSentence;
  return {
    readOnly: true,
    eventsFile: 'events/events-data.js',
    eventsFilePresent: loaded.present,
    regenerate: 'node tools/build-agent-files.js',
    note: loaded.present
      ? 'Generated from events/events-data.js. This file is read-only. Do not POST to it.'
      : 'events/events-data.js is not on this branch. Dated events are not invented. After that file lands, run node tools/build-agent-files.js and commit the generated files. GitHub Pages does not run the script on deploy.',
    programs: facts.programs,
    comingSoon: loaded.comingSoon,
    events: loaded.events,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      '@id': 'https://www.domokuncafe.com/events.json#list',
      name: 'Domo Cafe events',
      url: 'https://www.domokuncafe.com/events.json',
      description: description,
      numberOfItems: nodes.length,
      itemListElement: nodes.map((node, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: node
      }))
    }
  };
}

function jsonBlock(value) {
  return JSON.stringify(value, null, 2);
}

function upsertJsonLd(html, graph) {
  const json = jsonBlock(graph)
    .split('\n')
    .map((line) => '  ' + line)
    .join('\n');
  const block =
    '<!-- AGENT-JSONLD:START -->\n' +
    '  <script type="application/ld+json">\n' +
    json +
    '\n  </script>\n' +
    '  <!-- AGENT-JSONLD:END -->';
  const markerRe = /<!-- AGENT-JSONLD:START -->[\s\S]*?<!-- AGENT-JSONLD:END -->/;
  if (markerRe.test(html)) return html.replace(markerRe, block);
  const scriptRe = /<script type="application\/ld\+json">[\s\S]*?<\/script>/;
  if (!scriptRe.test(html)) throw new Error('index.html is missing its JSON-LD script');
  return html.replace(scriptRe, block);
}

function patchIndex(html, facts, graph) {
  if (!html.includes(facts.licensing.copyright)) {
    throw new Error('Refusing to continue: homepage copyright line is missing or was changed');
  }
  if (!html.includes('G-MYQJZDB2MR') || !html.includes('/ga4.js')) {
    throw new Error('Refusing to continue: GA4 include is missing from index.html');
  }
  const metas = [
    ['name="description"', facts.metaDescription],
    ['property="og:description"', facts.metaDescription],
    ['name="twitter:description"', facts.metaDescription]
  ];
  for (const [selector, value] of metas) {
    const re = new RegExp('(<meta ' + selector + ' content=")[^"]*(")');
    if (!re.test(html)) throw new Error('Missing meta ' + selector);
    html = html.replace(re, '$1' + value + '$2');
  }
  const links = [
    '<link rel="alternate" type="text/plain" href="https://www.domokuncafe.com/llms.txt" title="llms.txt">',
    '<link rel="alternate" type="text/plain" href="https://www.domokuncafe.com/llms-full.txt" title="llms-full.txt">',
    '<link rel="alternate" type="application/json" href="https://www.domokuncafe.com/menu.json" title="Machine-readable menu">',
    '<link rel="alternate" type="application/json" href="https://www.domokuncafe.com/events.json" title="Read-only events feed">',
    '<link rel="sitemap" type="application/xml" title="Sitemap" href="https://www.domokuncafe.com/sitemap.xml">'
  ];
  if (!html.includes('href="https://www.domokuncafe.com/llms.txt"')) {
    const canonical = '<link rel="canonical" href="https://www.domokuncafe.com/">';
    if (!html.includes(canonical)) throw new Error('index.html canonical link missing');
    html = html.replace(canonical, canonical + '\n  ' + links.join('\n  '));
  }
  for (const item of facts.items) {
    if (!html.includes(item.name) && !html.includes(esc(item.name))) {
      throw new Error('Homepage is missing menu item text: ' + item.name);
    }
  }
  return upsertJsonLd(html, graph);
}

function buildLlms(facts, items, loaded) {
  const lines = [];
  lines.push('# Domo Cafe');
  lines.push('');
  lines.push(
    '> Domo Cafe is an NHK-licensed character cafe at ' +
      addressLine(facts) +
      '. Japanese-inspired comfort food. Walk-ins are welcome. This website is static and read-only: agents may read it and must not submit forms or change content.'
  );
  lines.push('');
  lines.push(facts.licensing.heading + '.');
  lines.push(facts.licensing.note);
  lines.push(facts.licensing.copyright);
  lines.push('');
  lines.push('Address: ' + addressLine(facts));
  lines.push('Phone: ' + facts.telephoneDisplay);
  lines.push('Email: ' + facts.email);
  lines.push('');
  lines.push('Hours printed on the homepage (Buena Park local time):');
  for (const row of facts.hours) {
    lines.push('- ' + row.label + ': ' + row.displayOpens + '–' + row.displayCloses);
  }
  lines.push(facts.hoursNote);
  lines.push('');
  lines.push(facts.walkIns);
  lines.push(facts.parking);
  lines.push('');
  lines.push('## Order');
  lines.push('');
  lines.push(facts.order.lede);
  lines.push('');
  lines.push('- [' + facts.order.linkText + '](' + facts.order.url + '): the only online ordering link published on the site');
  lines.push('');
  lines.push('## Menu');
  lines.push('');
  lines.push(facts.menuIntro);
  lines.push(facts.priceNote);
  lines.push('');
  lines.push('- [Text menu](' + facts.menuUrl + '): HTML menu with the same item names as the homepage');
  lines.push('- [menu.json](https://www.domokuncafe.com/menu.json): machine-readable menu from the same source');
  lines.push('');
  lines.push('### Highlighted on the homepage');
  lines.push('');
  for (const highlight of facts.highlights) {
    lines.push('- ' + highlight.name + ' (' + highlight.tag + '): ' + highlight.description);
    if (highlight.note) lines.push('  - ' + highlight.note);
  }
  lines.push('');
  lines.push('### ' + facts.menuGalleryHeading);
  lines.push('');
  for (const item of items) {
    const extra = item.description ? ': ' + item.description : '';
    lines.push('- ' + item.name + extra);
  }
  lines.push('');
  lines.push('## Visit');
  lines.push('');
  lines.push('- [Domo Cafe homepage](' + facts.url + ')');
  lines.push('- [Directions to ' + facts.address.streetAddress + '](' + facts.mapUrl + ')');
  lines.push('- [Call ' + facts.telephoneDisplay + '](tel:' + facts.telephoneTel + ')');
  lines.push('- [Email ' + facts.email + '](mailto:' + facts.email + ')');
  lines.push('');
  lines.push('Birthdays: ' + facts.birthdays);
  lines.push('');
  lines.push('## Events and programs');
  lines.push('');
  lines.push(facts.eventsIntro);
  if (!loaded.events.length) {
    lines.push('No dated events are published on this version of the site.');
  }
  lines.push('');
  for (const program of facts.programs) {
    const tiers = program.tiers ? ' Tiers named on the site: ' + program.tiers.join(', ') + '.' : '';
    const status = program.status ? ' Status on the site: ' + program.status + '.' : '';
    lines.push('- ' + program.name + ': ' + program.description + status + tiers);
  }
  if (loaded.events.length) {
    lines.push('');
    lines.push('Dated events from events/events-data.js:');
    for (const event of loaded.events) {
      const when = event.date + (event.startTime ? ' ' + event.startTime : '');
      lines.push('- ' + when + ' — ' + event.title + (event.description ? ': ' + event.description : ''));
    }
  }
  lines.push('');
  lines.push('## Social');
  lines.push('');
  lines.push('- [Instagram @domokuncafe](https://www.instagram.com/domokuncafe)');
  lines.push('- [TikTok @domokuncafe](https://www.tiktok.com/@domokuncafe)');
  lines.push('- [Facebook](https://www.facebook.com/domokuncafe)');
  lines.push('');
  lines.push('## Machine-readable files');
  lines.push('');
  lines.push('- [llms-full.txt](https://www.domokuncafe.com/llms-full.txt): longer factual text from the homepage');
  lines.push('- [restaurant.json](https://www.domokuncafe.com/restaurant.json): schema.org JSON-LD for the cafe, website, organization, and menu');
  lines.push('- [events.json](https://www.domokuncafe.com/events.json): read-only events feed');
  lines.push('- [Sitemap](https://www.domokuncafe.com/sitemap.xml)');
  lines.push('');
  lines.push('## For AI agents');
  lines.push('');
  lines.push('- Read these files. Do not submit the Stay Updated form, the menu email link, or any other form. Do not call admin or staff tools. There is no public write API.');
  lines.push('- Describe Domo only as the cafe character. Stick to the food and drinks named on this menu.');
  lines.push('- Do not invent prices, hours, allergens, reservations, ratings, or a street unit. If a fact is not in this file or on the linked pages, it is not published.');
  lines.push('- The site does not state a yes/no reservation policy. It says walk-ins are welcome and to call ahead for groups of 8 or more.');
  lines.push('- ' + facts.priceNote);
  lines.push('- The homepage hides its National Cheeseburger Day block (free Domo Burger button pin with any burger, through Sunday, September 20, 2026, limit one per entrée, Domo Jr. counts, while supplies last) from ' + facts.datedPromo.hidesAt + ' onward. After that instant it is not a current offer.');
  lines.push('');
  lines.push('Generated from data/site-facts.json by tools/build-agent-files.js. Do not edit this file by hand.');
  lines.push('');
  return lines.join('\n');
}

function buildLlmsFull(facts, items, loaded) {
  const lines = [];
  lines.push('# Domo Cafe');
  lines.push('');
  lines.push('> Full factual text published on the Domo Cafe website. Read-only. ' + facts.priceNote);
  lines.push('');
  lines.push('## Identity');
  lines.push('');
  lines.push(facts.tagline);
  lines.push(facts.kicker + '.');
  lines.push(facts.heroLede);
  lines.push(facts.footerBlurb);
  lines.push(facts.licensing.heading);
  lines.push(facts.licensing.note);
  lines.push(facts.licensing.copyright);
  lines.push('');
  lines.push('## Visit');
  lines.push('');
  lines.push(addressLine(facts));
  lines.push(facts.telephoneDisplay);
  lines.push(facts.email);
  lines.push(facts.mapUrl);
  lines.push('');
  lines.push('Hours:');
  for (const row of facts.hours) {
    lines.push('- ' + row.label + ': ' + row.displayOpens + '–' + row.displayCloses);
  }
  lines.push(facts.hoursNote);
  lines.push('');
  lines.push('## FAQ');
  lines.push('');
  for (const entry of facts.faq) {
    lines.push('### ' + entry.question);
    lines.push('');
    lines.push(entry.answer);
    lines.push('');
  }
  lines.push('## Order');
  lines.push('');
  lines.push(facts.order.lede);
  lines.push(facts.order.url);
  lines.push('');
  lines.push('## Menu');
  lines.push('');
  lines.push(facts.menuIntro);
  lines.push(facts.menuGalleryHeading);
  lines.push(facts.priceNote);
  lines.push('');
  lines.push('### Highlighted on the homepage');
  lines.push('');
  for (const highlight of facts.highlights) {
    lines.push('- ' + highlight.name + ' — ' + highlight.tag + '. ' + highlight.description);
    if (highlight.note) lines.push('  ' + highlight.note);
  }
  lines.push('');
  lines.push('### Items shown in the homepage menu gallery');
  lines.push('');
  for (const item of items) {
    lines.push('- ' + item.name + (item.description ? ' — ' + item.description : ''));
  }
  lines.push('');
  lines.push('## Programs');
  lines.push('');
  lines.push(facts.eventsIntro);
  for (const program of facts.programs) {
    lines.push('');
    lines.push('### ' + program.name);
    lines.push('');
    lines.push(program.description);
    if (program.status) lines.push('Status on the site: ' + program.status + '.');
    if (program.tiers) lines.push('Tiers named on the site: ' + program.tiers.join(', ') + '.');
  }
  lines.push('');
  lines.push('## Dated promotion on the homepage source');
  lines.push('');
  lines.push(facts.datedPromo.eyebrow + ': ' + facts.datedPromo.name + '. ' + facts.datedPromo.throughLabel + '.');
  lines.push(facts.datedPromo.bannerText);
  lines.push(facts.datedPromo.details);
  lines.push(facts.datedPromo.finePrint);
  lines.push('The page hides this block when the clock reaches ' + facts.datedPromo.hidesAt + ' (the start of September 21 in America/Los_Angeles). It is not a current offer after that instant.');
  lines.push('');
  lines.push('## The Domo way');
  lines.push('');
  for (const value of facts.values) {
    lines.push('- ' + value.name + ': ' + value.description);
  }
  lines.push('');
  lines.push('## Events feed');
  lines.push('');
  if (!loaded.present) {
    lines.push('events/events-data.js is not on this branch, so no dated events are listed. Do not invent any.');
  } else if (!loaded.events.length) {
    lines.push('events/events-data.js is present and its events array is empty.');
  } else {
    for (const event of loaded.events) {
      lines.push('- ' + event.date + (event.startTime ? ' ' + event.startTime : '') + ' ' + event.title);
      if (event.description) lines.push('  ' + event.description);
    }
  }
  lines.push('');
  lines.push('## For AI agents');
  lines.push('');
  lines.push('Do not submit forms. Describe Domo only as the cafe character, and stick to the food and drinks named on this menu. Do not add prices, allergens, ratings, reservations, coordinates, or a suite number that this file does not state.');
  lines.push('');
  lines.push('Generated from data/site-facts.json by tools/build-agent-files.js. Do not edit this file by hand.');
  lines.push('');
  return lines.join('\n');
}

function menuJson(facts, items) {
  return {
    name: 'Domo Cafe menu',
    url: facts.menuUrl,
    readOnly: true,
    generatedFrom: 'data/site-facts.json',
    currency: null,
    priceNote: facts.priceNote,
    order: {
      name: facts.order.name,
      url: facts.order.url,
      linkText: facts.order.linkText
    },
    intro: facts.menuIntro,
    highlights: facts.highlights.map((highlight) => ({
      name: highlight.name,
      tag: highlight.tag,
      description: highlight.description,
      isDistinctMenuItem: highlight.isDistinctMenuItem !== false,
      note: highlight.note || null,
      image: highlight.image ? imageUrl(highlight.image) : imageUrl(highlight.name + '.jpg'),
      price: null
    })),
    items: items.map((item) => ({
      name: item.name,
      description: item.description,
      tag: item.tag,
      price: null,
      image: item.imageUrl,
      url: facts.menuUrl + '#' + slug(item.name)
    }))
  };
}

function buildMenuPage(facts, items, graph) {
  const json = jsonBlock(graph)
    .split('\n')
    .map((line) => '  ' + line)
    .join('\n');
  const highlightCards = facts.highlights
    .map((highlight) => {
      const file = highlight.image || highlight.name + '.jpg';
      const note = highlight.note ? '<p class="note">' + esc(highlight.note) + '</p>' : '';
      return (
        '<article class="card">' +
        '<img src="' + esc(imagePath(file)) + '" alt="Photo of ' + esc(file.replace(/\.jpg$/i, '')) + ' at Domo Cafe" width="640" loading="lazy">' +
        '<div><p class="tag">' + esc(highlight.tag) + '</p><h3>' + esc(highlight.name) + '</h3><p>' + esc(highlight.description) + '</p>' +
        note +
        '</div></article>'
      );
    })
    .join('\n');
  const itemCards = items
    .map((item) => {
      const desc = item.description ? '<p>' + esc(item.description) + '</p>' : '';
      const tag = item.tag ? '<p class="tag">' + esc(item.tag) + '</p>' : '';
      return (
        '<article class="item" id="' + esc(slug(item.name)) + '">' +
        '<img src="' + esc(item.imagePath) + '" alt="Photo of ' + esc(item.name) + ' at Domo Cafe" loading="lazy">' +
        '<div>' + tag + '<h3>' + esc(item.name) + '</h3>' + desc + '</div></article>'
      );
    })
    .join('\n');
  const hourRows = facts.hours
    .map(
      (row) =>
        '<li><span>' +
        esc(row.label) +
        '</span><strong><time datetime="' +
        esc(row.opens) +
        '">' +
        esc(row.displayOpens) +
        '</time>–<time datetime="' +
        esc(row.closes) +
        '">' +
        esc(row.displayCloses) +
        '</time></strong></li>'
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!-- Generated from data/site-facts.json by tools/build-agent-files.js. Do not edit by hand. -->
  <!-- Google tag (gtag.js) G-MYQJZDB2MR — shared include; live www only -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-MYQJZDB2MR"></script>
  <script src="/ga4.js"></script>
  <meta name="theme-color" content="#CC2222">
  <meta name="description" content="${esc(facts.menuIntro)} ${esc(facts.priceNote)}">
  <title>Menu | Domo Cafe</title>
  <link rel="canonical" href="${esc(facts.menuUrl)}">
  <link rel="icon" type="image/png" href="/domo-cafe-logo-transparent.png">
  <link rel="alternate" type="application/json" href="https://www.domokuncafe.com/menu.json" title="Machine-readable menu">
  <link rel="alternate" type="text/plain" href="https://www.domokuncafe.com/llms.txt" title="llms.txt">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Domo Cafe">
  <meta property="og:locale" content="en_US">
  <meta property="og:title" content="Menu | Domo Cafe">
  <meta property="og:description" content="${esc(facts.menuIntro)} ${esc(facts.priceNote)}">
  <meta property="og:url" content="${esc(facts.menuUrl)}">
  <meta property="og:image" content="${esc(facts.image)}">
  <meta property="og:image:alt" content="${esc(facts.imageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Menu | Domo Cafe">
  <meta name="twitter:description" content="${esc(facts.menuIntro)} ${esc(facts.priceNote)}">
  <meta name="twitter:image" content="${esc(facts.image)}">
  <script type="application/ld+json">
${json}
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Darumadrop+One&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root { --red: #CC2222; --red-dark: #971919; --brown-dark: #4A250D; --cream: #FDF6EE; --gold: #C8922A; --ink: #2B1A12; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--cream); color: var(--ink); font: 16px/1.6 "DM Sans", system-ui, sans-serif; }
    img { max-width: 100%; display: block; }
    a { color: var(--red); }
    h1, h2, h3 { font-family: "Darumadrop One", "Trebuchet MS", cursive; font-weight: 400; line-height: 1.1; margin: 0 0 .4rem; }
    h1 { font-size: clamp(2.8rem, 7vw, 4.6rem); }
    h2 { font-size: clamp(2rem, 4vw, 2.8rem); margin: 2rem 0 1rem; }
    .skip { position: absolute; left: 1rem; top: -4rem; background: var(--gold); color: var(--brown-dark); padding: .6rem 1rem; border-radius: 999px; }
    .skip:focus { top: 1rem; }
    .wrap { width: min(980px, calc(100% - 2rem)); margin: 0 auto; }
    header { background: rgba(253,246,238,.94); border-bottom: 1px solid rgba(139,69,19,.12); position: sticky; top: 0; }
    .bar { align-items: center; display: flex; flex-wrap: wrap; gap: .6rem 1rem; justify-content: space-between; min-height: 76px; padding: .6rem 0; }
    .brand img { height: 54px; width: auto; }
    nav { display: flex; flex-wrap: wrap; gap: .8rem 1.1rem; }
    nav a { color: var(--brown-dark); font-weight: 700; text-decoration: none; }
    .button { background: var(--red); border-radius: 999px; color: #fff; display: inline-flex; font-weight: 700; padding: .7rem 1.1rem; text-decoration: none; }
    .button:hover, .button:focus-visible { background: var(--red-dark); }
    .lede { font-size: 1.05rem; max-width: 42rem; }
    .note, .fine { color: #694d3b; }
    .cards, .items { display: grid; gap: 1rem; }
    .card, .item { background: #fff; border-radius: 1.2rem; display: grid; gap: 0; overflow: hidden; }
    .card img, .item img { aspect-ratio: 3 / 2; object-fit: cover; width: 100%; }
    .card div, .item div { padding: 1rem 1.1rem 1.2rem; }
    .tag { color: var(--red); font-size: .72rem; font-weight: 700; letter-spacing: .08em; margin: 0 0 .2rem; text-transform: uppercase; }
    .visit { background: #fff; border-radius: 1.2rem; margin: 1.5rem 0 2rem; padding: 1.2rem 1.3rem; }
    address { font-style: normal; }
    .hours { list-style: none; margin: .8rem 0; padding: 0; }
    .hours li { border-bottom: 1px solid rgba(139,69,19,.15); display: flex; justify-content: space-between; padding: .55rem 0; }
    .contacts { display: flex; flex-wrap: wrap; gap: .8rem 1.2rem; }
    footer { background: var(--brown-dark); color: #F9EBDD; padding: 1.4rem 0; }
    footer a { color: #FFD98B; }
    .footer-row { display: flex; flex-wrap: wrap; gap: .8rem 1.4rem; justify-content: space-between; }
    @media (min-width: 760px) {
      .cards { grid-template-columns: 1fr 1fr; }
      .items { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header>
    <div class="wrap bar">
      <a class="brand" href="/" aria-label="Domo Cafe home"><img src="/domo-cafe-logo-transparent.png" alt="Domo Cafe"></a>
      <nav aria-label="Main">
        <a href="/">Home</a>
        <a href="/menu/" aria-current="page">Menu</a>
        <a href="/#visit">Visit</a>
        <a href="${esc(facts.order.url)}" target="_blank" rel="noopener" aria-label="${esc(facts.order.linkText)}">Order on Toast</a>
      </nav>
    </div>
  </header>
  <main id="main">
    <div class="wrap">
      <p class="tag">What we're serving</p>
      <h1>Menu</h1>
      <p class="lede">${esc(facts.menuIntro)}</p>
      <p class="fine">${esc(facts.priceNote)} The names below are the dishes shown on the <a href="/#menu">homepage</a>.</p>
      <p><a class="button" href="${esc(facts.order.url)}" target="_blank" rel="noopener">${esc(facts.order.linkText)}</a></p>
      <section class="visit" aria-labelledby="visit-heading">
        <h2 id="visit-heading">Plan your visit</h2>
        <address>
          <a href="${esc(facts.mapUrl)}">Directions to ${esc(facts.address.streetAddress)}, ${esc(facts.address.addressLocality)}, ${esc(facts.address.addressRegion)} ${esc(facts.address.postalCode)}</a>
        </address>
        <ul class="hours">${hourRows}</ul>
        <p class="fine">Hours may vary on holidays. Follow <a href="${esc(facts.instagramHoursUrl)}">@domokuncafe</a> for updates.</p>
        <div class="contacts">
          <a href="tel:${esc(facts.telephoneTel)}">Call ${esc(facts.telephoneDisplay)}</a>
          <a href="mailto:${esc(facts.email)}">${esc(facts.email)}</a>
        </div>
        <p>${esc(facts.walkInsShort)} Free parking is available in the large Buena Park Downtown lot.</p>
      </section>
      <section aria-labelledby="highlights-heading">
        <h2 id="highlights-heading">Highlighted on the homepage</h2>
        <div class="cards">
          ${highlightCards}
        </div>
      </section>
      <section aria-labelledby="lineup-heading">
        <h2 id="lineup-heading">${esc(facts.menuGalleryHeading)}</h2>
        <div class="items">
          ${itemCards}
        </div>
      </section>
      <p class="fine">This page is read-only. Machine-readable copy: <a href="/menu.json">menu.json</a>. Longer site text for assistants: <a href="/llms.txt">llms.txt</a>.</p>
      <p class="fine">${esc(facts.licensing.heading)}. ${esc(facts.licensing.note)}</p>
    </div>
  </main>
  <footer>
    <div class="wrap footer-row">
      <span>${esc(facts.licensing.copyright)}</span>
      <span>${esc(facts.credit.line).replace('Super Power Studios', '')}<a href="${esc(facts.credit.url)}" target="_blank" rel="noopener">Super Power Studios</a> · ${esc(facts.credit.note)}</span>
    </div>
  </footer>
</body>
</html>
`;
}

function buildRobots() {
  const rules = DISALLOW.map((path) => 'Disallow: ' + path).concat(['Allow: /']);
  const groups = ['*', ...CRAWLERS].map((agent) => ['User-agent: ' + agent, ...rules].join('\n'));
  return [
    '# Domo Cafe (https://www.domokuncafe.com/) is a static, read-only website.',
    '# Reputable search and AI crawlers may read the public pages.',
    '# Disallowed paths are internal tools or stale drafts, not the cafe menu, hours, or visit information.',
    '# There is no public write API.',
    '',
    groups.join('\n\n'),
    '',
    'Sitemap: https://www.domokuncafe.com/sitemap.xml',
    ''
  ].join('\n');
}

function buildSitemap() {
  const urls = [
    { loc: 'https://www.domokuncafe.com/', changefreq: 'weekly', priority: '1.0' },
    { loc: 'https://www.domokuncafe.com/menu/', changefreq: 'weekly', priority: '0.8' },
    { loc: 'https://www.domokuncafe.com/llms.txt', changefreq: 'monthly', priority: '0.4' },
    { loc: 'https://www.domokuncafe.com/llms-full.txt', changefreq: 'monthly', priority: '0.3' },
    { loc: 'https://www.domokuncafe.com/menu.json', changefreq: 'weekly', priority: '0.5' },
    { loc: 'https://www.domokuncafe.com/events.json', changefreq: 'weekly', priority: '0.4' },
    { loc: 'https://www.domokuncafe.com/restaurant.json', changefreq: 'monthly', priority: '0.4' }
  ];
  if (fs.existsSync(path.join(root, 'events', 'index.html'))) {
    urls.push({ loc: 'https://www.domokuncafe.com/events/', changefreq: 'weekly', priority: '0.7' });
  }
  if (fs.existsSync(path.join(root, 'domoween', 'index.html'))) {
    urls.push({ loc: 'https://www.domokuncafe.com/domoween/', changefreq: 'weekly', priority: '0.7' });
  }
  const body = urls
    .map(
      (url) =>
        '  <url>\n' +
        '    <loc>' + url.loc + '</loc>\n' +
        '    <changefreq>' + url.changefreq + '</changefreq>\n' +
        '    <priority>' + url.priority + '</priority>\n' +
        '  </url>'
    )
    .join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '\n</urlset>\n';
}

function write(rel, contents) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function main() {
  const facts = loadFacts();
  assertMenuImages(facts);
  const items = itemsWithCopy(facts);
  const loaded = loadEvents();
  const homeGraph = pageGraph(facts, items, 'home');
  const menuGraph = pageGraph(facts, items, 'menu');
  if (loaded.events.length) {
    homeGraph['@graph'].push(...eventNodes(loaded.events));
  }
  const indexPath = path.join(root, 'index.html');
  const indexHtml = patchIndex(fs.readFileSync(indexPath, 'utf8'), facts, homeGraph);
  fs.writeFileSync(indexPath, indexHtml);
  write('llms.txt', buildLlms(facts, items, loaded));
  write('llms-full.txt', buildLlmsFull(facts, items, loaded));
  write('menu.json', jsonBlock(menuJson(facts, items)) + '\n');
  write('events.json', jsonBlock(eventsDocument(facts, loaded)) + '\n');
  write('restaurant.json', jsonBlock(homeGraph) + '\n');
  write('menu/index.html', buildMenuPage(facts, items, menuGraph));
  write('robots.txt', buildRobots());
  write('sitemap.xml', buildSitemap());
  console.log('Wrote agent files from data/site-facts.json');
  console.log('Events file present: ' + loaded.present + ', dated events: ' + loaded.events.length);
}

module.exports = { pacificIso, loadFacts, main };

if (require.main === module) main();
