// Facts the About panel (components/aboutPanel.js) and the page JSON-LD
// (components/headContent.js) both state. ONE source so the structured data
// never claims something the visible page does not show: Google only accepts
// a rating or an FAQ in JSON-LD when the same text is visible on the page.

export const GITHUB_URL = "https://github.com/codergautam/worldguessr";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.codergautamyt.worldguessr";
export const APP_STORE_URL = "https://apps.apple.com/app/id6778672486";
export const DISCORD_URL = "https://discord.gg/ADw47GAyS5";
export const YOUTUBE_URL = "https://www.youtube.com/@worldguessr";

// Google Play listing, read 2026-08-27. Refresh both numbers together when
// the listing moves; the count only ever grows, so a stale value understates.
export const PLAY_STORE_RATING = { value: "4.8", count: 662 };

// Links the homepage passes authority to. The home HTML otherwise links to
// nothing inside the site except /leaderboard (the menu is JavaScript), so
// this is how PageRank reaches the map hub and the biggest maps. Country
// maps are stable repo entries; the community slugs are the evergreen
// top-played maps (600k+ plays each), not a live ranking.
export const FEATURED_MAPS = [
  { name: "United States", slug: "united-states" },
  { name: "Japan", slug: "japan" },
  { name: "United Kingdom", slug: "united-kingdom" },
  { name: "Germany", slug: "germany" },
  { name: "France", slug: "france" },
  { name: "Brazil", slug: "brazil" },
  { name: "Capitals of the World", slug: "capitals-of-the-world" },
  { name: "World Soccer Stadiums", slug: "soccer-stadiums-by-jack" },
  { name: "Famous Places", slug: "famous-places" },
  { name: "All NFL Teams", slug: "all-nfl-teams" },
];

// One definition per page that carries the panel. Every string is a locale
// key. faq entries render as <h3>/<p> in the panel and as Questions in the
// FAQPage JSON-LD; gameSchema adds the VideoGame node (the product itself,
// so the homepage only).
export const ABOUT_HOME = {
  h1: "aboutH1",
  paragraphs: ["aboutP1", "aboutP2", "aboutP3", "aboutP4"],
  faq: [
    { q: "aboutFaqQ1", a: "aboutFaqA1" },
    // "Is WorldGuessr the same as GeoGuessr?" sits second so the free /
    // separate-game / not-affiliated answer is next to "Is GeoGuessr free?".
    { q: "aboutFaqQ7", a: "aboutFaqA7" },
    { q: "aboutFaqQ2", a: "aboutFaqA2" },
    { q: "aboutFaqQ3", a: "aboutFaqA3" },
    { q: "aboutFaqQ4", a: "aboutFaqA4" },
    { q: "aboutFaqQ5", a: "aboutFaqA5" },
    { q: "aboutFaqQ6", a: "aboutFaqA6" },
  ],
  showRating: true,
  showLinks: true,
  showFeaturedMaps: true,
  // The long-form sections (components/aboutSections.js), English home only.
  showSections: true,
  gameSchema: true,
};

// /daily targets "geoguessr daily challenge". Numbers come from
// shared/daily/constants.js (3 rounds, 5000 per round) and
// api/dailyChallenge/locations.js (60s per round); the reset is the player's
// local midnight (shared/daily/dailyDate.js). Keep the copy in step.
export const ABOUT_DAILY = {
  h1: "dailyAboutH1",
  paragraphs: ["dailyAboutP1", "dailyAboutP2", "dailyAboutP3"],
  faq: [
    { q: "dailyFaqQ1", a: "dailyFaqA1" },
    { q: "dailyFaqQ2", a: "dailyFaqA2" },
    { q: "dailyFaqQ3", a: "dailyFaqA3" },
    { q: "dailyFaqQ4", a: "dailyFaqA4" },
    { q: "dailyFaqQ5", a: "dailyFaqA5" },
    { q: "dailyFaqQ6", a: "dailyFaqA6" },
  ],
  showRating: false,
  showLinks: false,
  showFeaturedMaps: false,
  showSections: false,
  gameSchema: false,
};
