/*
 * DOMO CAFE EVENTS — the one file that feeds the events calendar (/events/), the
 * Domoween "October events" block on the home page, and the /domoween/ page.
 * ------------------------------------------------------------------------------
 * To add an event, copy the example below, remove the leading // from each line,
 * and fill it in. Keep the quotes and commas. Times are Buena Park time (Pacific).
 *
 *   date:        "YYYY-MM-DD"  (required)
 *   startTime:   "HH:MM" 24-hour, e.g. "18:30" for 6:30pm. Leave "" for an all-day event.
 *   endTime:     "HH:MM" or "". Without an end time, calendar invites default to 1 hour.
 *   title:       short name (required)
 *   description: one or two sentences
 *   link:        optional URL for details/RSVP, e.g. "https://www.instagram.com/domokuncafe"
 *   linkLabel:   button text for the link, e.g. "RSVP"
 *   series:      optional group name, e.g. "Domoween" or "Community Tuesday"
 *   art:         optional official Domo art for the card (Domoween events only), one of:
 *                wc_44_frankenstein, wc_40_mummy, wc_41_jack-o-lantern, wc_43_witch-broom,
 *                wc_53_mr-usagi-pumpkin-mask, tashanna_pumpkin-head
 *
 * Only add real, confirmed events. Copy can talk about Domo but must never quote him
 * saying anything except "Domo". Keep it cute-spooky and family-appropriate.
 */
window.DOMO_EVENTS = {

  // Friendly message for a month that has no events posted yet.
  comingSoon: {
    "2026-10": "October events are coming soon! Follow @domokuncafe on Instagram and TikTok for announcements."
  },

  events: [
    // {
    //   date: "2026-10-00",
    //   startTime: "18:00",
    //   endTime: "20:00",
    //   title: "Event name",
    //   description: "What guests can expect.",
    //   link: "",
    //   linkLabel: "",
    //   series: "Domoween",
    //   art: "wc_43_witch-broom"
    // },
  ]
};
