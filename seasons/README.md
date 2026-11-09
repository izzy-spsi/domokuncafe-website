# Seasonal themes

The home page (`index.html`) can switch into a seasonal "takeover" theme on a
schedule. Right now there is one theme: **Domoween**, **October 1 – November 1, 2026**
(Halloween is celebrated through the weekend, Sunday Nov 1). The normal site returns Monday Nov 2.

## How the date switch works

- `seasons/seasons.js` runs at the end of `<head>` on `index.html`. It gets
  today's date **in America/Los_Angeles** (not the visitor's own time zone) and
  checks it against each theme's `start`/`end` in the `THEMES` list.
- Domoween is on from **12:00 am Oct 1** through **11:59 pm Sun Nov 1** Pacific time.
  The countdown still targets Halloween itself (`halloween: '2026-10-31'`), and the
  "Happy Halloween" greeting shows on Oct 31 and Nov 1.
  At 12:00 am Nov 1 the page loads exactly as it does today. There's nothing to
  turn off by hand.
- Outside a theme window the script only adds `data-theme="normal"` to `<html>`
  and loads nothing else, so the regular site is unchanged.
- During a theme it loads that theme's fonts, CSS, data and JS. The theme fills
  the empty `<div id="season-slot">` at the top of `<main>` and hides the
  regular photo hero while it's active.

## Preview (for Izzy / staff)

Add one of these to the end of the site address:

| Add to the URL | What you see |
| --- | --- |
| `?theme=domoween` | Domoween, any day of the year |
| `?theme=normal` | The regular site, even during October |
| `?theme=auto` | Back to the calendar (clears the preview) |
| `?themeDate=2026-10-31` | Pretends today is that date in LA (testing only) |
| add `&clean=1` | Guest look while previewing: no preview bar, no PLACEHOLDER stickers (e.g. `?theme=domoween&clean=1` for staff). Sticks for the tab; `?clean=0` brings the stickers back |

Examples: `https://domokuncafe.com/?theme=domoween` once this is merged, or
`http://localhost:3700/?theme=domoween` when running `npm start` locally.

A preview choice sticks for that browser tab until you pick another option or
close the tab. While previewing, a black bar above the header shows the active
theme and lets you switch. Placeholder content also gets a yellow
**PLACEHOLDER** sticker then. Guests never see the bar or the stickers.

## Editing Domoween menu, events and hashtag

- **Spooky specials and hashtag:** [`seasons/domoween/data.js`](domoween/data.js).
  Each item under `menu.items` has `name`, `description`, `price`, `tag` and
  `art`. Delete `placeholder: true` once an item is real. Set
  `hashtag: "#YourTag"` when there is one; while it's `""` the social callout
  only says "Tag @domokuncafe". `showMenu: false` or `showEvents: false` hides a
  block.
- **Events (October and every other month):**
  [`events/events-data.js`](../events/events-data.js). It's one list for the whole
  site. Each event has `date`, `startTime`, `endTime`, `title`, `description`, an
  optional `link`/`linkLabel`, `series` (e.g. `"Domoween"` or
  `"Community Tuesday"`), and optional `art`. Events automatically appear on:
  - the `/events/` calendar, with Add to Google Calendar and a downloadable `.ics`
  - the Domoween "October events" block on the home page (events dated Oct 1 – Nov 1)
  - the `/domoween/` page, including Event structured data for search engines

  With no events in a month, guests see a friendly "coming soon, follow
  @domokuncafe" message rather than placeholder entries.
- **Recurring listings** (Domo Hour is weekdays 3–6 PM from Nov 9, 2026, with no end date;
  its menu lives in `domo-hour/domo-hour-data.js`) use
  `repeat: { days: ["Mon", ...], from, until }`. Leave `until` off when the listing is ongoing.
  They appear on every matching day in the calendar grid but as one card in the
  lists. Their Google Calendar/.ics invites repeat weekly, and their Event
  JSON-LD carries a schema.org `Schedule`.

Then preview with `?theme=domoween` before merging.

Licensor rules for copy in this file: copy can talk *about* Domo, but must never
quote him saying anything except "Domo". Keep it cute-spooky: no alcohol,
tobacco, drugs, religion, politics, violence or gore. Domoween blocks use
official art only, so don't add food photos to them.

## Pages

- The homepage nav, footer, and season teaser do not mention Domoween. Those
  hard-coded links were removed after November 1, 2026. While the theme is on
  (the calendar window, or `?theme=domoween`), `seasons/domoween/domoween.js`
  can still insert a `.dw-nav-link`. It does not run on a normal visit after
  the end date.
- `/domoween/` (`domoween/index.html`) redirects to `/`. GitHub Pages has no
  server redirects, so the file is a meta refresh plus `location.replace("/")`.
  It is not a landing page and is omitted from `sitemap.xml`. Before the next
  season, restore the landing from git history and add the URL back to the sitemap.
- `/events/` (`events/index.html`) is the events calendar: a month grid on
  desktop and a list on phones. `?month=2026-10` opens a specific month.

## Official art

See [`assets/domoween/README.md`](../assets/domoween/README.md) for what each
file is, where to drop high-res originals, and the licensor's usage rules.

## Adding a future season (e.g. Fall / Thanksgiving in November)

1. Create `seasons/<id>/` with `<id>.css`, `data.js`, and `<id>.js`. Use
   `seasons/domoween/` as the template, and scope every CSS rule to
   `html[data-theme="<id>"]`.
2. Add an entry to `THEMES` in `seasons/seasons.js` with `id`, `label`,
   `start`, `end`, `themeColor`, optional `fonts`, the `css` and `js` file
   lists, and a small `critical` CSS string that hides whatever the theme
   replaces. A commented `harvest` example is already there.
3. The windows shouldn't overlap. If they do, the first match in the list wins.
4. Domo Hour (`domo-hour/`) is not part of any theme. It shows all year. See `domo-hour/DOMO-HOUR.md`.
   A seasonal skin can still recolor it; the October "Domo-ween Edition" badge is gone.
5. For next October, copy the Domoween entry and change the year in `start` and
   `end`. The countdown targets the theme's `end` date automatically.

## Files

```
events/
  events-data.js        ← edit this: every event (feeds /events/, Domoween, /domoween/)
  events.js             calendar, Google Calendar links, .ics, event JSON-LD
  index.html            /events/ page
domoween/index.html     /domoween/ redirects home (meta refresh; not a landing page)
seasons/
  seasons.js            date switch, preview override, loader (tiny; runs every visit)
  domoween/
    data.js             ← edit this: Spooky specials menu, hashtag
    domoween.js         renders the Domoween sections + countdown
    domoween.css        Domoween look (all rules scoped to html[data-theme="domoween"])
assets/domoween/        official Domo art, web-sized
tools/domoween-art.py   resizes new official art into assets/domoween/
```
