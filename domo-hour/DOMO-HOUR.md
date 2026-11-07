# Domo Hour

> **Unpublished (November 2026).** The homepage section, nav and footer links, the
> events-calendar listing, the Community Tuesday comparisons, and the Domoween October
> note are commented out or removed while this program is revamped. The files in this
> folder are unchanged. `robots.txt` asks crawlers to skip `/domo-hour/`.
>
> To publish it again:
> 1. Uncomment the stylesheet and scripts in `index.html`, and the data script in `community.html`.
> 2. Uncomment the `<section class="dh" id="domo-hour">` block in `index.html`.
> 3. Put the nav and footer links back on the homepage, events, Domoween, and community pages (see git history).
> 4. Uncomment the listing in `events/events-data.js` and the schedule filler in `community.js`.
> 5. Remove `Disallow: /domo-hour` from `robots.txt`.

Domo Hour is a weekday program (Monday–Friday, 3–6 PM). When it is published it has its own
section on the home page, right before "What we're serving", and it shows in every
theme. During Domo-ween it gets a seasonal skin; on the normal site it doesn't.

## Files

| File | What it is |
| --- | --- |
| `domo-hour/domo-hour-data.js` | **Edit this.** Copy, value callouts, menu, prices, photos, seasonal badge |
| `domo-hour/domo-hour.js` | Renders the section into `<section id="domo-hour">` and runs the menu reveal |
| `domo-hour/domo-hour.css` | Normal-theme styles |
| `seasons/domoween/domoween.css` → "Domo Hour: Domo-ween Edition" | October-only skin |
| `events/events-data.js` → "Domo Hour" | The weekday listing on `/events/` (links to the menu here) |

## Menu on/off switch (`showMenu`)

The menu is **switched on** (`showMenu: true` at the top of `domo-hour/domo-hour-data.js`) with the
final menu from the kitchen staff.

- **When it's `true`,** the section shows the three price callouts (Eats from $8, Sips from $6,
  $12 Single Smash Burger), the "See the Domo Hour menu" button and the menu panel.
- **When it's `false`,** the button, the menu panel and the price callouts are left out of the page entirely.
  They aren't hidden; they're never written to the page in any theme, so no menu names or prices
  appear in the rendered HTML or structured data. A `/#domo-hour-menu` link just scrolls to the
  section.
- **When the section is published, these show:** the heading, the "Monday–Friday • 3–6 PM" hours pill, the line
  "Available Monday–Friday • 3–6 PM. Excluding holidays." (`hoursNote`), the copy, the photos,
  "Plan your visit", the nav pill, the Domo-ween layer, and the `/events/` listing with its
  calendar invites. Right now the whole section is commented out, so none of this is on the site.

**To turn the menu off again,** set `showMenu: false`.

**To turn it back on:**

1. Set `showMenu: true`.
2. Optionally, in `events/events-data.js`, set the Domo Hour entry's `link` to `"/#domo-hour-menu"`
   and its `linkLabel` to `"See the Domo Hour menu"`, so the calendar and the October events
   tickets open the menu directly.

**Note:** the menu items and prices still sit inside `domo-hour/domo-hour-data.js`, which is a
public file anyone can open directly. If they must not be reachable at all before launch, keep
unconfirmed items out of that file until they're approved.

## Edit the menu or prices

Open `domo-hour/domo-hour-data.js` and change `menu` (the items under `BITES` and
`SIPS`) or `offers` (the three big callouts). Both only show while `showMenu` is
`true`. Each item has a `name` and `price`, plus an optional `desc` (shown under
the item) and `add` (an add-on line, such as "Add bulgogi beef +$8"). Keep the
names, prices and descriptions exactly as the kitchen staff approved them; don't
write descriptions of your own, and no alcohol wording. If a price changes,
check that the callouts still match the menu (Eats from = the lowest bite price,
Sips from = the lowest sip price). `availability` is the line at the bottom of
the menu panel. The `/events/` listing and `/domoween/` link to this menu, so
there's nothing else to update.

## Swap photos

The collage uses `images` in `domo-hour/domo-hour-data.js`. The first photo is
shown large. Each entry has `src` (an existing approved photo) and `alt` (describe
what's actually in the photo).

Temporary stand-ins are marked `temporary: true`:

- **Single Smash Burger:** `Smash Burger.jpg` is standing in for it.
- **Domo Hour Sips:** `Strawberry Refresher.jpg` is standing in for them.

When a real photo exists, add it under `assets/` and update `src` and `alt`. Then
delete `temporary` and `standInFor`.

## Remove the Domo-ween treatment

The section works on its own; the seasonal look is a removable layer.

- **Automatically:** it only applies while `seasons/seasons.js` has Domoween active
  (Oct 1 to Nov 1, 2026, Pacific time). From Mon Nov 2, or with `?theme=normal`,
  there's no badge and no Halloween styling.
- **To remove it early or for good:**
  1. Delete the `seasonal.domoween` entry in `domo-hour/domo-hour-data.js`. This
     removes the "Domo-ween Edition • All October" badge.
  2. Delete the "Domo Hour: Domo-ween Edition" block in
     `seasons/domoween/domoween.css`. This removes the purple and orange skin and
     the candy-corn stripe.
- **A future season** (e.g. a November theme) can add its own badge under
  `seasonal.<theme id>` and style `html[data-theme="<theme id>"] .dh` in its own
  stylesheet.

## Links

- `/#domo-hour` scrolls to the section from any page. The nav and footer use it.
- `/#domo-hour-menu` scrolls to the section and opens the menu. The `/events/`
  listing and `/domoween/` use it.
- **Menu button:** "See the Domo Hour menu" is a real button with `aria-expanded`,
  so it works with the keyboard.
- **Plan your visit:** the button goes to the existing `#visit` hours and location
  section.

## Navigation

When the program is published, "Domo Hour" is the first, highlighted nav item on every page. It's followed by
"Domoween" (during the season) and "Events", then the rest of the links. Those links are removed while it is unpublished.

- **851–959px wide:** only those priority links and Order Now show inline; the ☰
  button opens every link.
- **Phones:** everything is in the ☰ menu, with Domo Hour first.
