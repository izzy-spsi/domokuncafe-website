# Domo Hour

Domo Hour is back on the site starting Monday, November 9, 2026. Starting Friday,
November 13, 2026, **Domo Hour runs every day 3–6 PM.** For a limited time, Domo Hour
is now available on weekends too! It is not available on holidays or during special events.
The menu has no end date.

It has its own section just before "What we're serving", a highlighted **Domo Hour**
link in the nav and footer, a link from the menu section, and a daily listing on `/events/`.
The section keeps `id="domo-hour"`. A `#happy-hour` anchor in the same section is the
happy-hour deep link. The visible subheading is “Domo Hour — Our Daily Happy Hour, 3–6 PM.”

## Files

| File | What it is |
| --- | --- |
| `domo-hour/domo-hour-data.js` | **Edit this.** Schedule, menu, prices, descriptions, photos |
| `domo-hour/domo-hour.js` | Renders the section into `<section id="domo-hour">` and runs the menu toggle |
| `domo-hour/domo-hour.css` | Styles for the section |
| `events/events-data.js` → "Domo Hour" | Every-day listing on `/events/` (links to the menu here) |
| `index.html` noscript block | Same menu text for browsers with JavaScript off |

Keep the noscript menu in `index.html` in step with `domo-hour-data.js`.

## Menu

`showMenu` is `true`. The price callouts, the menu button and the menu are on the page.
The menu is open when the page loads. The button collapses and expands it (`aria-expanded`).

Names, prices and descriptions must match the approved menu. Do not add items.

- **Bites:** Single Smash Burger $10, Domo Bites Back $6, Domo Style Fries $5, Side Curry Mac & Cheese $5, Domo Churro Fries $6.
- **Sips:** Sparkling Strawberry Lime Refresher $5, Dirty Soda $5 (Paradise Fizz or Berry Bliss), Mango Lemonade $4, Domo's Iced Cookie Coffee $4, Strawberry Lemonade $4, Milo Dinosaur $4, Domo Palmer $4.

The three callouts (bites from $5, sips from $4, Single Smash Burger $10) are the lowest
price in each group and the named burger. Change them if those prices change.

## Photos

The collage uses `images` in `domo-hour-data.js`. The first photo is shown large.
Photos are existing Domo Cafe food photography. Alt text describes the photo.

## October wording

The "Domo-ween Edition • All October" badge has been removed. Do not put October dates
back on this program. A Domoween color skin still lives in
`seasons/domoween/domoween.css` and only applies while that theme is active
(`?theme=domoween`, or Oct 1–Nov 1). It does not change the menu text.

## Links

- `/#domo-hour` scrolls to the section. The nav, footer, and menu section use it.
- `/#domo-hour-menu` scrolls to the menu and opens it. The `/events/` listing uses it.
- **Plan your visit** goes to the existing `#visit` hours and location section. Cafe hours are unchanged.

## Navigation

"Domo Hour" is the first, highlighted nav item on the home page and on `/events/`.

- **851–959px wide:** Domo Hour, Events and Order Now stay inline; the ☰ button opens every link.
- **Phones:** everything is in the ☰ menu, with Domo Hour first.
