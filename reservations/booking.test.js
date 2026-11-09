const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const booking = require('./booking');
const config = require('./config');

const root = path.join(__dirname, '..');
const GUID = '48703a4e-b67b-4229-92a8-8dddd4775b18';
const RESTAURANT_ID = '328883';
const ORDER_URL = 'https://www.toasttab.com/domo-cafe-8340-la-palma-avenue/';
const EVENT_URL = 'https://toast.app/r/domo-cafe-8340-la-palma-avenue/events/dine-with-domo?deeplink=true';
const SAMPLE_RESERVATION = 'https://www.toasttab.com/example-guest/reservations?ref=copied';
const SAMPLE_WAITLIST = 'https://toast.app/r/example-guest/waitlist';

function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

test('shipped config stays closed and does not invent a guest URL', () => {
  assert.equal(config.reservationUrl, '');
  assert.equal(config.waitlistUrl, '');
  assert.equal(config.reservationsApproved, false);
  assert.equal(config.waitlistApproved, false);
  const shipped = read('reservations/config.js') + read('reservations/index.html') + read('reservations/reservations.js');
  assert.equal(shipped.includes(GUID), false);
  assert.equal(shipped.includes(RESTAURANT_ID), false);
  const plan = booking.planBooking(config);
  assert.equal(plan.reservationsOpen, false);
  assert.equal(plan.waitlistOpen, false);
  assert.equal(plan.heading, booking.COPY.unavailableHeading);
  assert.equal(plan.reservationUrl, '');
});

test('a Toast URL is not advertised until its own flag is exactly true', () => {
  assert.equal(booking.planBooking({ reservationUrl: SAMPLE_RESERVATION, reservationsApproved: false }).reservationsOpen, false);
  assert.equal(booking.planBooking({ reservationUrl: SAMPLE_RESERVATION, reservationsApproved: 'true' }).reservationsOpen, false);
  assert.equal(booking.planBooking({ reservationsApproved: true, reservationUrl: '   ' }).reservationsOpen, false);
  const open = booking.planBooking({ reservationsApproved: true, reservationUrl: SAMPLE_RESERVATION });
  assert.equal(open.reservationsOpen, true);
  assert.equal(open.reservationUrl, SAMPLE_RESERVATION);
  assert.equal(open.heading, booking.COPY.openHeading);
  assert.equal(open.lead, booking.COPY.openLead);
  assert.equal(open.waitlistOpen, false);
});

test('ordering and event links cannot become the booking button', () => {
  for (const url of [ORDER_URL, EVENT_URL, 'https://order.toasttab.com/online/domo-cafe-8340-la-palma-avenue']) {
    const plan = booking.planBooking({ reservationsApproved: true, reservationUrl: url, waitlistApproved: true, waitlistUrl: url });
    assert.equal(plan.reservationsOpen, false, url);
    assert.equal(plan.waitlistOpen, false, url);
  }
});

test('rejects non-https, non-Toast, and credentialed URLs', () => {
  const rejected = [
    'http://www.toasttab.com/reservations/example',
    'javascript:alert(1)',
    'https://eviltoasttab.com/reservations',
    'https://toasttab.com.evil.example/reservations',
    'https://user:pass@www.toasttab.com/reservations/example',
    'https://example.com/reservations',
    ''
  ];
  for (const url of rejected) {
    assert.equal(booking.guestBookingUrl(url), '', url);
  }
});

test('waitlist is a separate action and is hidden when it repeats the reservation URL', () => {
  const both = booking.planBooking({
    reservationsApproved: true,
    reservationUrl: SAMPLE_RESERVATION,
    waitlistApproved: true,
    waitlistUrl: SAMPLE_WAITLIST
  });
  assert.equal(both.reservationsOpen, true);
  assert.equal(both.waitlistOpen, true);
  assert.notEqual(both.reservationUrl, both.waitlistUrl);
  assert.equal(both.reserveLabel, 'Reserve a table');
  assert.equal(both.waitlistLabel, 'Join the waitlist');

  const duplicate = booking.planBooking({
    reservationsApproved: true,
    reservationUrl: SAMPLE_RESERVATION,
    waitlistApproved: true,
    waitlistUrl: SAMPLE_RESERVATION
  });
  assert.equal(duplicate.reservationsOpen, true);
  assert.equal(duplicate.waitlistOpen, false);

  const waitlistOnly = booking.planBooking({ waitlistApproved: true, waitlistUrl: SAMPLE_WAITLIST });
  assert.equal(waitlistOnly.reservationsOpen, false);
  assert.equal(waitlistOnly.waitlistOpen, true);
  assert.equal(waitlistOnly.heading, booking.COPY.unavailableHeading);
});

test('public pages tell the truth and do not ship a booking call to action', () => {
  const page = read('reservations/index.html');
  const home = read('index.html');
  const events = read('events/index.html');
  assert.match(page, new RegExp(booking.COPY.unavailableHeading));
  assert.match(page, new RegExp(booking.COPY.unavailableLead.replace(/[.]/g, '\\.')));
  assert.equal(page.includes('Reserve a table'), false);
  assert.equal(page.includes('Join the waitlist'), false);
  assert.equal(page.includes(GUID), false);
  assert.match(page, /Walk-ins are welcome/);
  assert.match(page, /tel:4153603666/);
  assert.match(page, /8\+/);
  assert.match(page, /birthday package/i);
  assert.equal(page.includes('acceptsReservations'), false);
  const toastHrefs = [...page.matchAll(/href="([^"]*toast[^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(toastHrefs, [ORDER_URL]);
  assert.match(home, /href="\/reservations\/">Reservations<\/a>/);
  assert.match(home, /Online reservations are not available yet/);
  assert.match(events, /href="\/reservations\/">Reservations<\/a>/);
  assert.match(read('server.js'), /\/reservations/);
  assert.match(read('sitemap.xml'), /https:\/\/domokuncafe\.com\/reservations\//);
  assert.equal(read('reservations/reservations.js').includes('https://'), false);
});

test('Railway and the static folder both serve the reservations page', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not listen\n' + stderr)), 8000);
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes(String(port))) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error('server exited ' + code + '\n' + stderr));
      });
    });
    const slash = await get(port, '/reservations/');
    const bare = await get(port, '/reservations');
    assert.equal(slash.status, 200);
    assert.match(slash.body, /<h1>Reservations<\/h1>/);
    assert.match(slash.body, /Online reservations are not available yet/);
    assert.equal(slash.body.includes('Reserve a table'), false);
    assert.equal(bare.status, 200);
    assert.match(bare.body, /<h1>Reservations<\/h1>/);
    const home = await get(port, '/');
    assert.match(home.body, /href="\/reservations\/"/);
    assert.doesNotMatch(home.body, /<h1>Reservations<\/h1>/);
  } finally {
    child.kill('SIGTERM');
  }
});

function freePort() {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function get(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathname }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
  });
}
