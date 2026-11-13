/*
 * DOMO HOUR — the one file for Domo Hour copy, menu, prices and photos.
 * Rendered by /domo-hour/domo-hour.js into <section id="domo-hour"> on the home page.
 * See domo-hour/DOMO-HOUR.md.
 *
 * Menu names, prices and descriptions must match the approved Domo Hour menu.
 * Do not add items, prices or descriptions that are not on that menu.
 */
window.DOMO_HOUR = {
  // false leaves the price callouts, menu button and menu panel out of the page.
  showMenu: true,

  title: "DOMO HOUR",
  tagline: "Domo Hour — Our Daily Happy Hour, 3–6 PM",
  sub: "Happy hour in Buena Park, every day from 3–6 PM.",
  schedule: "Domo Hour runs every day 3–6 PM.",
  scheduleShort: "Domo Hour runs every day 3–6 PM.",
  weekendNote: "For a limited time, Domo Hour is now available on weekends too!",
  hoursNote: "Not available on holidays or during special events.",
  availability: "Domo Hour runs every day 3–6 PM. For a limited time, Domo Hour is now available on weekends too! Not available on holidays or during special events.",

  // Lowest bite and sip prices, plus the named burger, from the menu below.
  offers: [
    { label: "BITES FROM", price: "$5" },
    { label: "SIPS FROM", price: "$4" },
    { label: "SINGLE SMASH BURGER", price: "$10", hero: true }
  ],

  menuButton: "SEE THE DOMO HOUR MENU",
  visitButton: "PLAN YOUR VISIT",
  visitHref: "#visit",

  menu: [
    {
      heading: "Bites",
      items: [
        {
          name: "Single Smash Burger",
          price: "$10",
          description: "Single wagyu smash patty, melted American cheese, pickles, caramelized onions and yum yum sauce on a toasted Domo brioche bun. Served with furikake waffle fries."
        },
        {
          name: "Domo Bites Back",
          price: "$6",
          description: "Crispy breaded cauliflower bites tossed in sweet & spicy gochujang or house buffalo sauce."
        },
        {
          name: "Domo Style Fries",
          price: "$5",
          description: "Melted American cheese, caramelized onions and house sauce on furikake waffle fries."
        },
        { name: "Side Curry Mac & Cheese", price: "$5" },
        { name: "Domo Churro Fries", price: "$6" }
      ]
    },
    {
      heading: "Sips",
      items: [
        { name: "Sparkling Strawberry Lime Refresher", price: "$5" },
        { name: "Dirty Soda", price: "$5", description: "Paradise Fizz or Berry Bliss" },
        { name: "Mango Lemonade", price: "$4" },
        { name: "Domo's Iced Cookie Coffee", price: "$4" },
        { name: "Strawberry Lemonade", price: "$4" },
        { name: "Milo Dinosaur", price: "$4" },
        { name: "Domo Palmer", price: "$4" }
      ]
    }
  ],

  // Existing Domo Cafe food photography. The first photo is shown large.
  images: [
    { src: "/assets/menu/doordash/Smash%20Burger.jpg", alt: "Smash burger with a Domo-face bun, avocado and waffle fries on a skillet" },
    { src: "/assets/menu/doordash/Domo%20Style%20Fries.jpg", alt: "Domo Style Fries: sauced waffle fries in a Domo Cafe paper-lined skillet" },
    { src: "/assets/menu/doordash/Churro%20Fries.jpg", alt: "Churro fries with a chocolate dipping sauce in a Domo Cafe paper-lined skillet" },
    { src: "/assets/domoween/lto/bites-back-gochujang.jpg", alt: "Domo Bites Back breaded cauliflower bites in sweet and spicy gochujang sauce" }
  ]
};
