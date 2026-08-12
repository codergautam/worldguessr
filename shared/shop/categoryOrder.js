/**
 * Storefront reading order shared by web and native.
 *
 * Pins lead because they are the cosmetic players see during a round.
 * Backgrounds follow as the largest visual customization, then name glows.
 * Emotes and consumable passes remain after the three appearance shelves.
 * Empty categories are filtered by each storefront without changing this order.
 */
export const CATEGORY_ORDER = Object.freeze([
  'marker',
  'background',
  'glow',
  'emote',
  'pass',
]);
