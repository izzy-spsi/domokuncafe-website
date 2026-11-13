/*
 * DOMO CAFE EVENTS — the one file that feeds the events calendar (/events/), the
 * Domoween "October events" block on the home page, and the /domoween/ page.
 * ------------------------------------------------------------------------------
 * To add an event, copy the example below, remove the leading // from each line,
 * and fill it in. Keep the quotes and commas. Times are Buena Park time (Pacific).
 *
 *   date:        "YYYY-MM-DD"  (required unless the event repeats; see `repeat`)
 *   startTime:   "HH:MM" 24-hour, e.g. "18:30" for 6:30pm. Leave "" for an all-day event.
 *   endTime:     "HH:MM" or "". Without an end time, calendar invites default to 1 hour.
 *   title:       short name (required)
 *   description: one or two sentences
 *   link:        optional URL for details/RSVP, e.g. "https://www.instagram.com/domokuncafe"
 *   linkLabel:   button text for the link, e.g. "RSVP"
 *   series:      optional group name, e.g. "Domoween" or "Community Tuesday"
 *   repeat:      optional, for a weekly listing instead of `date`:
 *                { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], from: "YYYY-MM-DD", until: "YYYY-MM-DD" }
 *                It shows on every matching day in the calendar grid, but as ONE card in the lists,
 *                and its calendar invite repeats weekly until the `until` date.
 *                Leave `until` off for an ongoing listing (no end date is invented).
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
    "2026-10": "More October events are coming soon! Follow @domokuncafe on Instagram, TikTok and Facebook for announcements."
  },

  events: [
    {
      date: "2026-10-31",
      startTime: "19:30",
      endTime: "21:00",
      title: "Spooky Dinner with Domo",
      description: "From $50. Private ticketed dinner — every guest needs a ticket. This is not a walk-in. Cafe walk-ins are still welcome outside the event.",
      link: "https://toast.app/r/domo-cafe-8340-la-palma-avenue/events/dine-with-domo?deeplink=true",
      linkLabel: "Get tickets",
      art: "wc_41_jack-o-lantern"
    },
    {
      title: "Domo Hour",
      description: "Domo Hour is our daily happy hour in Buena Park and runs every day 3–6 PM. For a limited time, Domo Hour is now available on weekends too! Not available on holidays or during special events.",
      startTime: "15:00",
      endTime: "18:00",
      // Weekdays from the Nov 9, 2026 relaunch. Weekends start Friday, Nov 13, 2026.
      // Nov 9–12 has no weekend, so one every-day listing from Nov 9 is the same calendar.
      repeat: { days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], from: "2026-11-09" },
      link: "/#domo-hour-menu",
      linkLabel: "See the Domo Hour menu"
    },

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
