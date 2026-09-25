/*
 * DOMOWEEN 2026 — edit this file for the Spooky specials menu and the hashtag.
 * (Events live in events/events-data.js, shared with the /events/ calendar.)
 * ------------------------------------------------------------------------------
 * How to edit (the GitHub web editor is fine):
 *   - Keep the quotes and commas exactly as they are. Text goes inside "double quotes".
 *   - To add an item, copy one { ... } block, paste it after a comma, and change the text.
 *   - Delete the `placeholder: true,` line once an entry holds real info. Placeholders show a
 *     "Coming soon" look to guests and a yellow PLACEHOLDER sticker in preview mode.
 *   - Leave a field as "" to hide it (e.g. no price yet → price: "").
 *   - Preview before publishing: add ?theme=domoween to the end of the site URL.
 *
 * Art (official artwork in assets/domoween/, use the name without the file extension):
 *   wc_44_frankenstein     wc_40_mummy            wc_41_jack-o-lantern
 *   wc_43_witch-broom      wc_53_mr-usagi-pumpkin-mask                tashanna_pumpkin-head
 *   Low-res until originals arrive (look soft when large): wc_42_witch-cauldron,
 *   wc_45_dracula, wc_46_jiangshi, wc_47_skeleton, wc_48_werewolf, wc_52_pumpkin
 *
 * Licensor rules for anything you type here: copy may talk ABOUT Domo ("Domo's Halloween
 * party") but must never quote Domo saying anything except "Domo". Keep it cute-spooky:
 * no alcohol, tobacco, drugs, religion, politics, violence or gore. Domoween blocks use
 * official art only; don't add food photos here (art and photos can't share a layout).
 */
window.DOMOWEEN_DATA = {

  // Photo-sharing hashtag, e.g. "#YourTagHere". Leave "" until one is chosen;
  // the social callout then just asks guests to tag @domokuncafe.
  hashtag: "",

  // Set to false to hide a whole block.
  showMenu: true,
  showEvents: true,

  menu: {
    heading: "Spooky specials",
    intro: "Limited-time Domoween treats are brewing. Check back soon for the big reveal.",
    items: [
      // Real item example (copy this shape, then delete the placeholders below):
      // { name: "Item name", description: "One short, tasty sentence.", price: "$0.00",
      //   tag: "Domoween special", art: "wc_41_jack-o-lantern" },
      {
        placeholder: true,
        name: "Mystery special",
        description: "Spooky specials coming soon. Follow @domokuncafe for the reveal.",
        price: "",
        tag: "Coming soon",
        art: "wc_44_frankenstein"
      },
      {
        placeholder: true,
        name: "Mystery special",
        description: "Spooky specials coming soon. Follow @domokuncafe for the reveal.",
        price: "",
        tag: "Coming soon",
        art: "wc_41_jack-o-lantern"
      },
      {
        placeholder: true,
        name: "Mystery special",
        description: "Spooky specials coming soon. Follow @domokuncafe for the reveal.",
        price: "",
        tag: "Coming soon",
        art: "wc_40_mummy"
      }
    ]
  }

  // October events are NOT edited here: add them to events/events-data.js. They show up in
  // the Domoween "October events" block, on /events/ and on /domoween/ automatically.
};
