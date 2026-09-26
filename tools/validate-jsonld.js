#!/usr/bin/env node
/**
 * Local schema checks plus validator.schema.org when the network allows it.
 * Usage: node tools/validate-jsonld.js
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pacificIso } = require('./build-agent-files');

const root = path.join(__dirname, '..');
const facts = JSON.parse(fs.readFileSync(path.join(root, 'data', 'site-facts.json'), 'utf8'));
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function extractJsonLd(html, label) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  if (!blocks.length) fail(label + ' has no JSON-LD');
  return blocks.map((block, index) => {
    try {
      return JSON.parse(block);
    } catch (error) {
      fail(label + ' JSON-LD block ' + index + ' is not valid JSON: ' + error.message);
      return null;
    }
  }).filter(Boolean);
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item) => walk(item, visit));
    return;
  }
  visit(node);
  for (const value of Object.values(node)) walk(value, visit);
}

function typesOf(node) {
  const value = node['@type'];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function findType(graph, type) {
  const nodes = graph['@graph'] || [graph];
  return nodes.filter((node) => typesOf(node).includes(type));
}

function checkGraph(graph, label) {
  assert(graph && graph['@context'] === 'https://schema.org', label + ' @context');
  assert(Array.isArray(graph['@graph']), label + ' uses @graph');
  const restaurants = findType(graph, 'Restaurant');
  assert(restaurants.length === 1, label + ' has one Restaurant');
  const cafe = restaurants[0];
  assert(typesOf(cafe).includes('CafeOrCoffeeShop'), label + ' Restaurant is also CafeOrCoffeeShop');
  assert(cafe['@id'] === facts.id, label + ' restaurant @id');
  assert(cafe.telephone === facts.telephoneE164, label + ' telephone');
  assert(cafe.email === facts.email, label + ' email');
  assert(cafe.servesCuisine === facts.cuisine, label + ' cuisine');
  assert(cafe.address.streetAddress === facts.address.streetAddress, label + ' street');
  assert(cafe.address.postalCode === facts.address.postalCode, label + ' postal code');
  assert(!('address' in cafe) || !String(cafe.address.streetAddress).includes('Unit'), label + ' must not invent a unit');
  assert(cafe.openingHoursSpecification.length === facts.hours.length, label + ' hours rows');
  facts.hours.forEach((row, index) => {
    const spec = cafe.openingHoursSpecification[index];
    assert(spec.opens === row.opens && spec.closes === row.closes, label + ' hours ' + row.label);
    assert(spec.opens < spec.closes, label + ' opens before closes');
  });
  assert(JSON.stringify(cafe.sameAs) === JSON.stringify(facts.sameAs), label + ' sameAs');
  assert(!('acceptsReservations' in cafe), label + ' must not set acceptsReservations');
  assert(!('aggregateRating' in cafe) && !('review' in cafe), label + ' must not invent ratings');
  assert(!cafe.geo, label + ' must not invent geo');
  const actions = cafe.potentialAction || [];
  assert(actions.some((action) => action['@type'] === 'OrderAction' && action.target === facts.order.url), label + ' OrderAction');
  const menus = findType(graph, 'Menu');
  assert(menus.length === 1, label + ' has one Menu');
  const section = menus[0].hasMenuSection;
  const menuItems = section.hasMenuItem;
  assert(menuItems.length === facts.items.length, label + ' menu item count');
  const names = menuItems.map((item) => item.name);
  facts.items.forEach((item) => assert(names.includes(item.name), label + ' missing ' + item.name));
  menuItems.forEach((item) => {
    assert(!('offers' in item), label + ' menu item has an offer: ' + item.name);
    assert(!('price' in item), label + ' menu item has a price: ' + item.name);
  });
  assert(findType(graph, 'WebSite').length === 1, label + ' WebSite');
  assert(findType(graph, 'Organization').length === 1, label + ' Organization');
  assert(findType(graph, 'BreadcrumbList').length === 1, label + ' BreadcrumbList');
  const crumbs = findType(graph, 'BreadcrumbList')[0].itemListElement;
  crumbs.forEach((crumb, index) => assert(crumb.position === index + 1, label + ' breadcrumb position'));
  walk(graph, (node) => {
    const blob = JSON.stringify(node);
    if (/\$\d/.test(blob)) fail(label + ' JSON-LD contains a price');
    if (/\b(alcohol|alcoholic|beer|wine|cocktail|whiskey|whisky|vodka)\b/i.test(blob)) {
      fail(label + ' JSON-LD mentions alcohol');
    }
  });
}

function checkPlain(rel) {
  const text = read(rel);
  if (/\$\d/.test(text)) fail(rel + ' contains a price');
  if (/Unit R/i.test(text)) fail(rel + ' invents Unit R');
  if (/\b(alcohol|alcoholic|beer|wine|cocktail|whiskey|whisky|vodka)\b/i.test(text)) fail(rel + ' mentions alcohol');
  assert(text.includes(facts.address.streetAddress), rel + ' has the street address');
  assert(text.includes(facts.telephoneDisplay), rel + ' has the phone number');
  assert(text.includes(facts.order.url), rel + ' has the Toast URL');
  assert(text.includes('read-only') || text.includes('Read-only') || text.includes('read only'), rel + ' says the site is read-only');
}

function checkHoursOffset() {
  const cases = [
    ['2026-07-15', '11:00', '2026-07-15T11:00:00-07:00'],
    ['2026-01-15', '11:00', '2026-01-15T11:00:00-08:00'],
    ['2026-10-01', '11:00', '2026-10-01T11:00:00-07:00'],
    ['2026-10-31', '21:00', '2026-10-31T21:00:00-07:00'],
    ['2026-11-01', '11:00', '2026-11-01T11:00:00-08:00']
  ];
  for (const [date, time, expected] of cases) {
    const actual = pacificIso(date, time);
    assert(actual === expected, 'Pacific offset ' + date + ' ' + time + ' got ' + actual + ' expected ' + expected);
  }
  assert(pacificIso('2026-10-06', '') === '2026-10-06', 'all-day date stays a date');
}

const GENERATED = [
  'index.html',
  'llms.txt',
  'llms-full.txt',
  'menu.json',
  'events.json',
  'restaurant.json',
  'menu/index.html',
  'robots.txt',
  'sitemap.xml'
];

function generatedHash() {
  return GENERATED.map((rel) => crypto.createHash('sha256').update(read(rel)).digest('hex')).join('');
}

function runBuilder(label) {
  const built = spawnSync('node', ['tools/build-agent-files.js'], { cwd: root, encoding: 'utf8' });
  if (built.status !== 0) {
    fail(label + ' failed:\n' + built.stdout + '\n' + built.stderr);
    return false;
  }
  return true;
}

async function remoteValidate(label, html) {
  const body = new URLSearchParams();
  body.set('html', html);
  let response;
  try {
    response = await fetch('https://validator.schema.org/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body
    });
  } catch (error) {
    warnings.push(label + ' schema.org validator unreachable: ' + error.message);
    return { label, unreachable: true, error: error.message };
  }
  let text = await response.text();
  text = text.replace(/^\)\]\}',?\s*/, '');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    warnings.push(label + ' schema.org validator returned non-JSON (HTTP ' + response.status + ')');
    return { label, status: response.status, unparsed: text.slice(0, 500) };
  }
  const types = [];
  function collectTypes(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(collectTypes);
      return;
    }
    if (node.typeGroup) {
      types.push({
        type: node.typeGroup,
        errors: node.numErrors || 0,
        warnings: node.numWarnings || 0
      });
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') collectTypes(value);
    }
  }
  collectTypes(parsed.tripleGroups);
  const byType = {};
  for (const row of types) {
    if (!byType[row.type]) byType[row.type] = { type: row.type, nodes: 0, errors: 0, warnings: 0 };
    byType[row.type].nodes += 1;
    byType[row.type].errors += row.errors;
    byType[row.type].warnings += row.warnings;
  }
  const summary = {
    label,
    status: response.status,
    totalNumErrors: parsed.totalNumErrors,
    totalNumWarnings: parsed.totalNumWarnings,
    numObjects: parsed.numObjects,
    types: Object.values(byType)
  };
  if (typeof parsed.totalNumErrors === 'number' && parsed.totalNumErrors > 0) {
    fail(label + ' schema.org validator reported ' + parsed.totalNumErrors + ' errors');
  }
  return { summary };
}

async function main() {
  checkHoursOffset();
  if (!runBuilder('initial build')) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  const index = read('index.html');
  const menu = read('menu/index.html');
  assert(index.includes('G-MYQJZDB2MR') && index.includes('/ga4.js'), 'GA4 still on the homepage');
  assert(menu.includes('G-MYQJZDB2MR') && menu.includes('/ga4.js'), 'GA4 on the menu page');
  assert(index.includes(facts.licensing.copyright), 'copyright line still on the homepage');
  assert(menu.includes(facts.licensing.copyright), 'copyright line on the menu page');
  assert(index.includes(facts.datedPromo.hidesAt), 'homepage still hides the dated promo with the published instant');
  const visible = index
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
  for (const entry of facts.faq) {
    assert(visible.includes(entry.answer), 'Homepage is missing FAQ answer: ' + entry.question);
  }
  for (const item of facts.items) {
    assert(index.includes(item.name) || index.includes(item.name.replace(/&/g, '&amp;')), 'Homepage missing ' + item.name);
    assert(menu.includes(item.name) || menu.includes(item.name.replace(/&/g, '&amp;')), 'Menu page missing ' + item.name);
  }
  const homeGraphs = extractJsonLd(index, 'index.html');
  const menuGraphs = extractJsonLd(menu, 'menu/index.html');
  assert(homeGraphs.length === 1, 'homepage should have one JSON-LD block');
  assert(menuGraphs.length === 1, 'menu page should have one JSON-LD block');
  if (homeGraphs[0]) checkGraph(homeGraphs[0], 'homepage');
  if (menuGraphs[0]) checkGraph(menuGraphs[0], 'menu');
  const restaurant = JSON.parse(read('restaurant.json'));
  checkGraph(restaurant, 'restaurant.json');
  assert(JSON.stringify(restaurant) === JSON.stringify(homeGraphs[0]), 'restaurant.json matches the homepage JSON-LD');
  const menuDoc = JSON.parse(read('menu.json'));
  assert(menuDoc.items.length === facts.items.length, 'menu.json item count');
  assert(menuDoc.items.every((item) => item.price === null), 'menu.json prices are unpublished');
  assert(menuDoc.order.url === facts.order.url, 'menu.json order URL');
  const events = JSON.parse(read('events.json'));
  assert(events.readOnly === true, 'events.json is marked read-only');
  assert(events.schema['@type'] === 'ItemList', 'events.json schema is an ItemList');
  assert(Array.isArray(events.events), 'events.json events array');
  if (!events.eventsFilePresent) {
    assert(events.events.length === 0, 'no invented events while events-data.js is absent');
    assert(events.schema.numberOfItems === 0, 'event count is zero');
  }
  ['llms.txt', 'llms-full.txt', 'menu/index.html'].forEach(checkPlain);
  const robots = read('robots.txt');
  for (const agent of ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Claude-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot']) {
    assert(robots.includes('User-agent: ' + agent), 'robots.txt names ' + agent);
  }
  assert(robots.includes('Sitemap: https://www.domokuncafe.com/sitemap.xml'), 'robots.txt sitemap');
  assert(robots.includes('Allow: /'), 'robots.txt allows the public site');
  const sitemap = read('sitemap.xml');
  assert(sitemap.includes('https://www.domokuncafe.com/'), 'sitemap home');
  assert(sitemap.includes('https://www.domokuncafe.com/menu/'), 'sitemap menu');
  assert(!sitemap.includes('dashboard'), 'sitemap omits the dashboard');
  assert(!sitemap.includes('index-hours-test'), 'sitemap omits the stale hours test');
  const before = generatedHash();
  if (runBuilder('second build')) {
    assert(generatedHash() === before, 'generator is not idempotent');
  }

  const remote = [];
  remote.push(await remoteValidate('homepage', index));
  remote.push(await remoteValidate('menu', menu));
  remote.push(await remoteValidate('restaurant.json', '<!doctype html><html><head><script type="application/ld+json">' + read('restaurant.json') + '</script></head><body></body></html>'));
  const eventsSchema = JSON.stringify(events.schema);
  remote.push(await remoteValidate('events.json schema', '<!doctype html><html><head><script type="application/ld+json">' + eventsSchema + '</script></head><body></body></html>'));

  const report = {
    failures,
    warnings,
    remote: remote.map((entry) => ({
      label: entry.summary ? entry.summary.label : entry.label,
      summary: entry.summary || null,
      unreachable: entry.unreachable || false,
      sample: entry.sample || entry.unparsed || entry.error || null
    }))
  };
  const outDir = '/opt/cursor/artifacts/ai-readability';
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'schema-validation.json'), JSON.stringify(report, null, 2));
  } catch (error) {
    console.log('Could not write validation artifact: ' + error.message);
  }
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) {
    console.error('\n' + failures.length + ' check(s) failed');
    process.exit(1);
  }
  console.log('\nLocal checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
