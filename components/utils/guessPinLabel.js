import { Tooltip } from 'react-leaflet';
import CountryFlag from './countryFlag';
import { nameGlowShadow, GLOW_LIGHT } from './usernameWithFlag';

/* ===========================================================================
 *  Permanent "whose pin is this" label above a guess marker.
 *
 *  THE one recipe, shared by the live map (components/Map.js PlayerLine, which
 *  predates this file and renders the identical markup inline) and both results
 *  maps (components/roundOverScreen.js, components/ResultsMap.js).
 *
 *  WHY IT EXISTS: purchasable marker skins (shop `type: 'marker'`) broke the
 *  old "blue pin = you / green pin = them" read — a skinned pin gives up its
 *  team colour by design, because the skin IS that player's identity. The name
 *  label is what replaces the colour, so it has to say who owns the pin.
 *
 *  ONLY EVER RENDER THIS ON A HIGHLIGHTED ROUND OR A HIGHLIGHTED PLAYER. A
 *  label on every guess of every round turns the all-rounds map into a wall of
 *  white boxes with the pins hidden underneath.
 *
 *  Style notes, all load-bearing:
 *   • Leaflet's tooltip chrome is WHITE and the text is forced black, so a name
 *     glow takes the LIGHT variant — the dark neon is invisible on white.
 *   • Inline styles, never a class: the tooltip is portalled out of the React
 *     tree, and inside the mobile embed globals.scss does not exist at all
 *     (embed/build.mjs bundles JS only).
 *   • Children, not Leaflet's `content` option: `content` takes an HTML STRING
 *     and a username is user input, so it is an XSS hole. The first-paint
 *     half-width offset that `content` exists to avoid does not bite here —
 *     these labels only appear alongside a camera fly-to.
 * ======================================================================== */

/**
 * @param {string}  label       Text to show ("Your guess", or a username).
 * @param {?string} countryCode ISO-2 flag to sit after the name, if any.
 * @param {?string} nameGlow    Equipped glow sku (cosmetics.equipped.nameGlow).
 * @param {boolean} big         True when the pin is the enlarged "Big" tier —
 *                              the taller icon needs the label pushed up 10px
 *                              more or it overlaps the pin head.
 */
export default function GuessPinLabel({ label, countryCode = null, nameGlow = null, big = false }) {
  if (!label) return null;
  return (
    <Tooltip
      direction="top"
      offset={[0, big ? -55 : -45]}
      opacity={1}
      permanent
    >
      <span
        style={{
          color: 'black',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          textShadow: nameGlowShadow(nameGlow, GLOW_LIGHT) || undefined,
        }}
      >
        {label}
        {countryCode && (
          <CountryFlag countryCode={countryCode} style={{ fontSize: '0.9em', marginRight: '0' }} />
        )}
      </span>
    </Tooltip>
  );
}
