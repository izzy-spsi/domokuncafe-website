/*
 * DOMO HOUR — the one file for Domo Hour copy, menu, prices and photos.
 * Rendered by /domo-hour/domo-hour.js into <section id="domo-hour"> on the home page.
 * See domo-hour/DOMO-HOUR.md for how to edit, swap photos, or remove the Domo-ween badge.
 *
 * Rules: keep menu names, prices and descriptions exactly as the kitchen staff approved them;
 * don't add descriptions of your own, and no alcohol wording. Photos must be existing approved
 * Domo Cafe photography.
 */
window.DOMO_HOUR = {
  // ONE switch for the menu. false = hide the "See the Domo Hour menu" button, the menu panel AND the
  // price callouts everywhere (they are left out of the page entirely, not just hidden).
  // Set to true once staff confirm the menu. The menu data below stays here either way.
  showMenu: true,

  eyebrow: "NEW AT DOMO CAFE",
  title: "DOMO HOUR",
  tagline: "THE BEST HOUR JUST GOT DOMO-FIED.",
  schedule: "Monday–Friday • 3–6 PM",
  scheduleShort: "MON–FRI • 3–6 PM",          // shown instead of `schedule` on small phones
  hoursNote: "Available Monday–Friday • 3–6 PM. Excluding holidays.",   // always shown
  sub: "Japanese-inspired bites, Domo favorites, and special-priced sips made for sharing.",

  // Price callouts: only shown when showMenu is true.
  offers: [
    { label: "EATS FROM", price: "$8" },
    { label: "SIPS FROM", price: "$6" },
    { label: "SINGLE SMASH BURGER", price: "$12", hero: true }
  ],

  menuButton: "SEE THE DOMO HOUR MENU",        // only shown when showMenu is true
  visitButton: "PLAN YOUR VISIT",
  visitHref: "#visit",                           // existing hours / location / directions section

  // Menu: only shown when showMenu is true. Final staff menu. `desc` and `add` are optional and
  // shown under the item; use only wording the kitchen staff supplied.
  menu: [
    {
      heading: "BITES",
      items: [
        { name: "Single Smash Burger", price: "$12", desc: "Single wagyu smash patty, melted American cheese, pickles, caramelized onions and yum yum sauce on a toasted Domo brioche bun. Served with furikake waffle fries." },
        { name: "Domo Sliders", price: "$10", desc: "Two sliders with a beef patty, lettuce, tomato, ketchup and mayo." },
        { name: "Domo Bites Back", price: "$10", desc: "Crispy breaded cauliflower bites. Option to sub karaage chicken." },
        { name: "Domo Style Fries", price: "$8", desc: "Melted American cheese, caramelized onions and house sauce on furikake waffle fries." },
        { name: "Yakisoba Noodles", price: "$10", desc: "Springy noodles, shiitake, stir-fry vegetables, yakisoba glaze, furikake, seaweed, scallions and a signature Domo egg.", add: "Add bulgogi beef +$8" },
        { name: "Side Curry Mac & Cheese", price: "$8" },
        { name: "Domo Churro Fries", price: "$8" }
      ]
    },
    {
      heading: "SIPS",
      items: [
        { name: "Strawberry Matcha", price: "$7" },
        { name: "Cinnamon Roll Matcha", price: "$7" },
        { name: "Sparkling Strawberry Lime Refresher", price: "$7" },
        { name: "Dirty Soda", price: "$6", desc: "Paradise Fizz or Berry Bliss" },
        { name: "Mango Lemonade", price: "$6" },
        { name: "Domo's Iced Cookie Coffee", price: "$6" },
        { name: "Strawberry Lemonade", price: "$6" },
        { name: "Milo Dinosaur", price: "$6" },
        { name: "Domo Palmer", price: "$6" }
      ]
    }
  ],
  availability: "Available Monday–Friday • 3–6 PM. Not available on holidays or special events.",

  // Photo collage. The first photo is shown large. `temporary: true` marks a stand-in
  // photo until a real one exists; replace `src`/`alt` and delete `temporary` when it does.
  images: [
    { src: "/assets/menu/doordash/Smash%20Burger.jpg", alt: "Smash burger with a Domo-face bun, avocado and waffle fries on a skillet", standInFor: "Single Smash Burger", temporary: true },
    { src: "/assets/menu/doordash/Domo%20Style%20Fries.jpg", alt: "Domo Style Fries: sauced waffle fries in a Domo Cafe paper-lined skillet" },
    { src: "/assets/menu/doordash/Churro%20Fries.jpg", alt: "Churro fries with a chocolate dipping sauce in a Domo Cafe paper-lined skillet" },
    { src: "/assets/menu/doordash/Strawberry%20Refresher.jpg", alt: "Strawberry refresher in a Domo Cafe cup", standInFor: "Domo Hour Sips", temporary: true }
  ],

  // Seasonal badge, shown only while that seasonal theme is active (html[data-theme]).
  // Delete the `domoween` entry to remove the badge; styling lives in seasons/domoween/domoween.css.
  seasonal: {
    domoween: { badge: "Domo-ween Edition • All October" }
  }
};
