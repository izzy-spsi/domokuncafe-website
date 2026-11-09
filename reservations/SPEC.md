# Reservations — implementation spec

Domo Cafe’s public site is static HTML. Production is GitHub Pages from `main`. Railway runs `node server.js` for staging and development. This feature adds a public `/reservations/` page that sends guests to Toast-hosted booking only after a copied guest link is configured and explicitly approved. It does not create a reservation database, call a Toast API, or embed a widget.

## Guest experience

- Navigation and footer link: **Reservations** (not “Reserve now”).
- Default, and any incomplete config: the page says online reservations are not available yet. It repeats the verified visit facts already on the site: walk-ins are welcome; parties of 8 or more call ahead at (415) 360-3666; birthday celebrations over 8 guests use the existing call-or-email path. Cafe hours, address, and directions match the homepage. There is no booking button and no success state.
- Approved reservation link: a **Reserve a table** link opens the copied Toast URL in a new tab. Toast confirms the booking. This page does not collect guest data.
- Approved waitlist link, only when it is a different URL: a separate **Join the waitlist** link. No wait-time estimate.

## Configuration

Edit `reservations/config.js` only:

| Field | Meaning |
| --- | --- |
| `reservationUrl` | Exact value from Toast Web → Waitlist & Reservations → Settings → Reservations → Online access → **Copy online reservation link**. |
| `waitlistUrl` | Exact value from Waitlist → Online access → **Copy online waitlist link**. Optional. |
| `reservationsApproved` | `true` only after that reservation link is pasted, online reservation access is on, and the guest policy is confirmed. |
| `waitlistApproved` | `true` only after the waitlist link is pasted and the online waitlist is on. |

A URL is used only when its flag is `true` and it is `https` on `toasttab.com` or `toast.app` (including subdomains). The known online-ordering URL and the Spooky Dinner event URL are rejected. Empty, `http`, non-Toast, and stringly-typed flags stay closed.

The official Toast widget snippet was not supplied. Docs describe it for Squarespace, Wix, and WordPress, and this site is custom HTML. The direct link is the integration. Do not invent a widget from restaurant id `328883` or GUID `48703a4e-b67b-4229-92a8-8dddd4775b18`.

## Files

- `reservations/config.js` — operator settings. Ships closed.
- `reservations/booking.js` — URL checks and the open/closed plan. No DOM.
- `reservations/reservations.js` — adds the Toast link only when the plan is open.
- `reservations/index.html` and `reservations/reservations.css` — the page. Closed copy is in the HTML, so it remains honest with JavaScript off.
- Homepage visit line, FAQ, and events nav/footer point here without saying booking is live.
- `server.js` routes `/reservations` for Railway. GitHub Pages serves the folder directly.

## Activation still required

1. Paste the copied reservation link.
2. Turn online reservation access on in Toast.
3. Confirm party limits, hours, lead time, and cancellation policy, then set `reservationsApproved` to `true`.
4. Replace the homepage sentence that says online reservations are not available yet.
5. Optional: paste and approve a distinct waitlist link.

Until those are done, the public page stays in the closed state.
