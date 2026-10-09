# Domo Cafe marketing-skills SEO audit

Audit date: October 9, 2026. Branch started from `main` at `865cd80` (merged PR #26). Skills read from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) (not vendored): `seo-audit`, `schema`, `ai-seo`, `events`, and `directory-submissions`, plus seo-audit's local SEO notes. Pages reviewed in the repo: `/`, `/domoween/`, `/events/`, `sitemap.xml`, `robots.txt`, and the noindex pages those files already block.

This pass did not check Search Console, analytics, or live rankings. It did not submit the site to any directory, validator login, or review form.

## Executive summary

The apex canonical host, Domoween dates, crawlable homepage and events links, `/dashboard` noindex, `data-nosnippet` off-season lines, and the verified hours in `openingHoursSpecification` were already in place from PR #26. Those stay.

The gaps were on-page: short titles and descriptions, a homepage events heading that said everything was "coming soon" during Domoween, no self-contained answer for "what is Domo Cafe / Domoween," no `llms.txt`, and a noindex hours prototype that still said weekends close at 8pm. Those are fixed here without new business facts.

Top issues:

1. Homepage title and description did not carry the address, hours, or "character cafe."
2. The homepage events block contradicted the live Domoween season.
3. Answer-shaped facts (what the cafe is, hours, where, what Domoween is) were split across the page instead of sitting under a question heading.
4. Third-party listings disagree with the verified phone and hours. Corrections are a manual checklist only. Nothing was submitted.

## Technical SEO

| Issue | Impact | Evidence | What we did | Priority |
| --- | --- | --- | --- | --- |
| Crawl rules already allow the public pages and point at the sitemap | — | `robots.txt` allows `/`, disallows `/dashboard`, `/staff`, `/community`, and the two preview HTML files, and lists `https://domokuncafe.com/sitemap.xml` | Left the rules. Added a comment pointing at `/llms.txt`. Search and AI crawlers stay allowed because `User-agent: *` is `Allow: /`. | Pass |
| Sitemap lists only the three indexable URLs, all on the apex host | — | `sitemap.xml` | Updated `lastmod` to 2026-10-09. Did not add dashboard, staff, community, previews, or `llms.txt`. | Pass |
| Canonicals are self-referencing apex URLs | — | `/`, `/domoween/`, `/events/` | Unchanged: `https://domokuncafe.com/`, `https://domokuncafe.com/domoween/`, `https://domokuncafe.com/events/`. | Pass |
| Important pages are linked from the header and footer | — | Homepage, Domoween, and events nav | Kept those links. Added in-body links from the homepage events section to `/domoween/` and `/events/`. | High, fixed |
| `/dashboard`, `/staff`, `/community`, and the two preview HTML files are `noindex, nofollow` and disallowed | — | Those files and `robots.txt` | Left that behavior. | Pass |
| Restaurant hours in JSON-LD already matched the verified hours | — | Mon–Fri 11:00–20:00, Sat–Sun 10:00–21:00 on `/` and `/domoween/` | Kept those values and copied the same node onto `/events/`, which previously had no Restaurant node. | Pass |
| No confirmed latitude/longitude for the cafe | Medium for map features | The only coordinates in the repo are an approximate ZIP center in `dashboard.html` | Did not add `geo`. Existing TODO stays. | Open |
| No `llms.txt` | Medium for non-Google AI systems | Google does not require this file. Other assistants use it when it is present. | Added `/llms.txt` with verified facts and the three public URLs. | Fixed |
| Speed, Core Web Vitals, and Search Console coverage | Unknown | Not measured in this pass | No change. | Open |

## On-page SEO

| Issue | Impact | Evidence | What we did | Priority |
| --- | --- | --- | --- | --- |
| Homepage title was 26 characters and the description was 95, with no address or hours | High | `Domo Cafe - Buena Park, CA` | Title is now `Domo Cafe in Buena Park | Character Cafe, Hours & Menu` (54 characters). Description is 155 characters and includes the address and verified hours. Open Graph and Twitter tags match. | Fixed |
| Off-season homepage H1 is still "Come for the good vibes." During Domoween the theme hides that hero and shows a Domoween H1. | Low, accepted | `seasons.js` sets `.hero{display:none}` from Oct 1 through Nov 1 | Left both headlines so the layouts do not change. The seasonal lede and the off-season lede, title, and "What is Domo Cafe?" heading carry the name, city, and hours. | Deliberate |
| Homepage events heading said "coming soon" while Domoween is on the calendar | High | Section `#events` | Heading is now "Good times, on the calendar." The paragraph names Domoween (October 1–November 1, 2026) and links to `/domoween/` and `/events/`. Community nights stay "coming soon." | Fixed |
| Domoween title was already 50 characters and included Halloween and Buena Park | — | Existing title kept | Description rewritten to 151 characters so it names the address and "Halloween event in Buena Park." | Fixed |
| Events title was 42 characters and did not mention Domoween | Medium | Old title | Now `Events at Domo Cafe in Buena Park | Domoween Calendar` (53). Description includes the address, Domoween dates, and cafe hours (157 characters). The callout includes the year 2026. | Fixed |
| One H1 per public page, and heading levels step in order | — | Homepage, Domoween, events | Kept a single H1. Domoween's about H2 is now "What is Domoween?" | Pass |
| Image alt text on the public pages already describes the photos | — | Hero, menu, and Domoween art | No alt rewrites. Open Graph image dimensions were checked against the files (homepage hero 1024×605, Domoween banner 1600×803) and already matched. Added the missing Twitter image alt on `/` and `/events/`. | Fixed |
| Internal links to Domoween and the calendar exist in nav, footer, and the seasonal teaser | — | Those links | Added body copy links so the Halloween page is not only in the nav and the date-gated teaser. | Fixed |

## Schema

JSON-LD is in the static HTML, so it does not depend on client-side injection. Local parse checked every `application/ld+json` block. This pass did not submit URLs to a schema validator.

Restaurant / LocalBusiness on `/`, `/domoween/`, and `/events/` uses one `@id`, `https://domokuncafe.com/#restaurant`.

- Name: Domo Cafe. Alternate name: Domo Kun Cafe.
- Phone: `+1-415-360-3666`. Email: `info@domokuncafe.com`.
- Address: 8340 La Palma Ave, Buena Park, CA 90620, US.
- `openingHoursSpecification`: Monday–Friday 11:00–20:00, Saturday–Sunday 10:00–21:00.
- Added `servesCuisine` "Japanese-inspired", `hasMenu` pointing at `https://domokuncafe.com/#menu`, and a customer-service `contactPoint`, because those match visible copy.
- `sameAs` stays Instagram, TikTok, and Facebook.

Homepage also has `WebSite` (name and URL only, no sitelinks `SearchAction`). Google retired the sitelinks search box in November 2024.

Domoween `Event` is unchanged: name "Domoween at Domo Cafe", start `2026-10-01T11:00:00-07:00`, end `2026-11-01T21:00:00-08:00` (DST ends the morning of November 1, 2026, and 9pm is Pacific Standard Time), place and organizer are the restaurant, image and URL are the Domoween page. No `offers`, `isAccessibleForFree`, or `performer`.

`FAQPage` was added on `/` and `/domoween/` only for questions that are visible on the page. Google stopped showing FAQ rich results on May 7, 2026. This markup is for schema.org and non-Google AI systems, not for that retired Google feature.

The events calendar still injects a Domo Hour `Event` with JavaScript from `events/events-data.js`. That listing is weekdays 3–6pm and the feed's `until` is 2026-10-31. The events page now states those hours in static HTML. The feed end date was not extended.

## Content and AI readability

Visible answer blocks, using only facts already on the site or in the verified list:

- Homepage visit section, heading "What is Domo Cafe?": name, alternate name, address, cuisine wording, hours, phone, walk-ins.
- Homepage FAQ: hours, address, and what Domoween is, plus the older walk-in, parking, birthday, delivery, fundraiser, and social answers.
- Domoween, heading "What is Domoween?": a direct definition with the dates, address, and regular hours, followed by the existing Halloween copy.
- Events hero: Domoween dates, Domo Hour (Monday–Friday 3–6pm), address, phone, and cafe hours.
- `/llms.txt`: the same facts and links to the three public pages.

The seasonal teaser and `data-nosnippet` upcoming/ended lines on `/domoween/` were not changed.

`/llms.txt` does not include prices, a cover charge, performers, ratings, review counts, coordinates, or a founding date.

## Local listings (read only)

Checked on October 9, 2026. Nothing was submitted or edited. Details and checkboxes are in `docs/seo/listing-corrections-checklist.md`.

- North Orange County Chamber member page shows phone (562) 441-6190 and hours that do not match. Confirmed URL: `https://business.nocchamber.com/list/member/domo-cafe-25398`.
- Yelp shows weekdays 10:00 AM–8:00 PM. The verified weekday hours are 11am–8pm. Public URL from search: `https://www.yelp.com/biz/domo-kun-cafe-buena-park`.
- Visit Buena Park already has a business page. Its fetched text shows the verified street address and does not show phone or hours. No Domoween event page was found.
- A Google Business Profile place URL was not confirmed. Do not invent one.

The `directory-submissions` skill is written for software directories (Product Hunt, G2, and similar). Those tiers do not fit a cafe, and the skill says not to submit without explicit approval. The local slice is the checklist. The `events` skill is written for webinars, booths, and conferences. Domoween is an owned in-cafe season, so this pass only made the public page state the dates, the place, and what a visitor can do. No outreach, no attendance numbers, no sponsor plan.

## What changed

- Titles, meta descriptions, and matching Open Graph / Twitter tags on `/`, `/domoween/`, and `/events/`.
- Homepage kicker, lede, events intro, visit definition, and three FAQ items. From October 1 through November 1 the visible homepage hero is the Domoween theme in `seasons/domoween/domoween.js` (the regular hero is hidden). That seasonal lede now states the Domoween dates, Buena Park, and the verified cafe hours, and links to `/domoween/` with the anchor "Halloween at Domo Cafe."
- Domoween "What is Domoween?" answer paragraph.
- Events page year on the Domoween callout, plus a static NAP / hours / Domo Hour sentence.
- JSON-LD: `WebSite` on the homepage, Restaurant fields (`servesCuisine`, `hasMenu`, `contactPoint`) on the three public pages, Restaurant node on `/events/`, `FAQPage` on `/` and `/domoween/`.
- `/llms.txt`, sitemap `lastmod`, robots comment.
- `index-hours-test.html`: weekend close corrected from 8pm to 9pm in the visible hours, the contact line, and the countdown script. Removed the unverified "last seating at 8:00 PM" line.

## What we deliberately did not change

- Apex canonical host, sitemap URL set, robots disallow list, dashboard noindex, Domoween date window, `data-nosnippet` behavior, and the Domoween Event start/end.
- Homepage H1 and the visual layout. No redesign.
- Cover charge, performers, `priceRange`, ratings, review counts, geo coordinates, "Unit R", owner names, and any founding or opening date. Third-party pages mention some of those. They are not in the verified fact list, so they were not copied onto the site.
- Domo Hour's feed end date of 2026-10-31.
- `preview-july4-banner.html`. It is noindex and disallowed. Its July 4 hours are a design mock, not the regular schedule, and were not verified.
- Menu item names, prices, DoorDash or Grubhub listing URLs, and CHOMPS (still "coming soon").
- Railway, GitHub Pages, PR #22, and the protected branches named in the task.

## TODO(Izzy)

- Confirm the exact map pin before any `geo` or `hasMap` markup. Do not use the ZIP-center coordinates in `dashboard.html`.
- Confirm whether Domoween has a cover charge or is included with a regular visit before adding Event `offers` or `isAccessibleForFree`.
- Confirm a performer name and URL before adding `performer`. No dated October appearances are in `events/events-data.js`.
- Confirm a verified price range before adding `priceRange`. Do not copy a range from Toast, Yelp, or any other listing.
- Confirm whether "Unit R" belongs on the public address. The chamber listing shows it. The verified address used on the site does not.
- Confirm official X and LinkedIn profiles before adding them to `sameAs`. `index-hours-test.html` links to `https://www.x.com/domokuncafe`. That URL is not on the public pages.
- Confirm whether the Domo Hour calendar listing should continue past October 31, 2026. The homepage treats Domo Hour as an ongoing weekday program. The events feed stops on that date.
- Confirm last seating or kitchen close before publishing a time. The old prototype claimed 8:00 PM. That claim was removed.
- Correct the Chamber, Yelp, Google Business Profile, and Visit Buena Park listings using the checklist. This pass did not contact them.
- After approval, merging this branch deploys production (GitHub Pages from `main` and Railway `www`). Do not merge until you want that.
