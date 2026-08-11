import { Tooltip } from 'react-leaflet';
import CountryFlag from './countryFlag';
import { cachedNameGlowProps, GLOW_LIGHT } from './usernameWithFlag';

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
 *   • THE FULL nameGlowProps PAIR — inline style AND className — NOT just the
 *     shadow. This label wore `nameGlowShadow()` alone for its whole life, which
 *     is the STATIC stack and nothing else: the @keyframes live on
 *     `.wg-nameglow--flame|cycle|orbit` (styles/nameGlow.css) and a class is the
 *     only way to reach them, so every animated sku sold as animated rendered
 *     dead on every guess pin while the same purchase moved correctly two inches
 *     away on the HUD. The reasoning that produced it was sound and the
 *     conclusion was still wrong: the inline stack is required because no
 *     stylesheet reaches the mobile embed, but "inline is required" was read as
 *     "a class is forbidden". It is not — nameGlow.css is a global import
 *     (pages/_app.js), and a Leaflet tooltip is portalled out of the REACT tree,
 *     never out of the DOCUMENT, so a global class lands on it like any other
 *     node. The embed now injects nameGlow.css itself (embed/entry.jsx); on any
 *     surface that still lacks it the class is inert and the inline static halo
 *     underneath is exactly the documented fallback.
 *   • `ownBox: true`, because this span already IS a box (display: flex, for the
 *     flag). The boxless `.wg-nameglow` carrier would fight it for `display`.
 *   • Children, not Leaflet's `content` option: `content` takes an HTML STRING
 *     and a username is user input, so it is an XSS hole. The first-paint
 *     half-width offset that `content` exists to avoid does not bite here —
 *     these labels only appear alongside a camera fly-to.
 * ======================================================================== */

/* ── The same label, as a DOM node ──────────────────────────────────────────
 *
 * WHY A SECOND FORM EXISTS AT ALL. The LIVE map's own-guess tooltips
 * (components/Map.js YourGuessLayer / CountryGuessLayer) cannot use the
 * component above. They pass Leaflet's `content` OPTION instead of React
 * children, deliberately, and that is a first-paint fix rather than a style
 * choice: a children tooltip is portalled in only AFTER the tooltip element has
 * been created and positioned, so frame 1 centres an EMPTY box and the text
 * lands half a width to the right until a post-paint update() corrects it. On
 * the results maps that never bites (those labels only appear alongside a
 * camera fly-to), but the live map's "Your guess" label pops in the instant you
 * drop a pin, right under the cursor, where the jump is the most visible thing
 * on screen. `content` is measured BEFORE the first _setPosition, so it is
 * correct on frame 1.
 *
 * Leaflet's `content` takes a String, an HTMLElement or a Function, and a string
 * goes through innerHTML — so element it is, with `textContent` and never
 * markup, which is what keeps this out of the XSS hole the component above
 * warns about even though this particular label is a locale string today.
 *
 * THIS LABEL WEARS NO GLOW, AND THAT IS THE POINT OF IT BEING SEPARATE NOW.
 * Every node this function makes says "Your guess" — a UI string, not a name.
 * A glow is IDENTITY paint: it says whose pin you are looking at, which is
 * exactly why opponents' labels (the component above) still carry one. There is
 * nobody to identify on your own pin; you already know it is yours, the label
 * says so in words, and a halo around two words of chrome on a ~90x22px white
 * tooltip was the loudest glow on the map for the least information. It briefly
 * had one and it was removed on sight.
 *
 * DO NOT "RESTORE PARITY" BY WIRING THE VIEWER'S SKU BACK IN HERE. The
 * asymmetry is deliberate and it is the rule: the glow follows the NAME. The
 * one own-pin label that is a real name — mod view, where the "your guess" pin
 * belongs to the player being inspected — goes through the component above and
 * keeps its glow, which is the same rule, not an exception to it.
 *
 * The caller MEMOISES on the label and keys the <Tooltip> on it too:
 * react-leaflet never syncs an option change into a live instance, so a new
 * node with no new key would simply never be shown.
 *
 * @param {string} label Text to show ("Your guess").
 * @returns {?HTMLElement} null when there is no label to draw.
 */
export function guessPinLabelNode(label) {
  if (!label || typeof document === 'undefined') return null;
  const el = document.createElement('span');
  el.textContent = label;
  // Leaflet's tooltip chrome is white and its text is forced black.
  el.style.color = 'black';
  return el;
}

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
  // Cached, not fresh: a results map draws one of these per shown player per
  // shown round, and the props are a pure function of (sku, surface).
  const glow = cachedNameGlowProps(nameGlow, GLOW_LIGHT, { ownBox: true });
  return (
    <Tooltip
      direction="top"
      offset={[0, big ? -55 : -45]}
      opacity={1}
      permanent
    >
      <span
        className={glow?.className}
        style={{
          color: 'black',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          // LAST: the glow's static text-shadow (and the two custom properties)
          // are what the keyframes take over from. Nothing above is touched —
          // `{...undefined}` is a no-op when no glow resolves.
          ...glow?.style,
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
