---
name: WorldGuessr
description: Free-to-play geography guessing game with dark green glass chrome over full-bleed world imagery.
colors:
  primary: "#245734"
  wash-green: "#144119"
  night-green: "#112b18"
  hud-glass: "rgba(36, 87, 52, 0.85)"
  shop-panel: "#06160e"
  shop-raise: "#0f2417"
  shop-well: "#030a06"
  duel-glass: "rgba(8, 8, 8, 0.92)"
  white: "#ffffff"
  ink: "#333333"
  equip-green: "#4ade80"
  stamp-gold: "#ffd700"
  ranked-red: "#ff474c"
  team-pink: "#f06292"
  scrim: "rgba(0, 0, 0, 0.3)"
typography:
  display:
    fontFamily: "Jockey One, Jockey One Fallback"
    fontSize: "max(min(clamp(1.8em, 4vw, 13em), clamp(1.5em, 6vh, 8em)), calc(var(--homeMenuSize, 0px) * 1.5))"
    fontWeight: 400
    lineHeight: 1.1
  headline:
    fontFamily: "Lexend, Lexend Fallback, sans-serif"
    fontSize: "clamp(1.1rem, 2vw, 1.5rem)"
    fontWeight: 500
  title:
    fontFamily: "Lexend, Lexend Fallback, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
  body:
    fontFamily: "Lexend, Lexend Fallback, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Lexend, Lexend Fallback, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 600
  score:
    fontFamily: "Lexend, Lexend Fallback, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
rounded:
  field: "12px"
  button: "15px"
  hud: "16px"
  container: "20px"
  modal-card: "24px"
  pill: "50px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "15px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
  hud-pill:
    backgroundColor: "{colors.hud-glass}"
    textColor: "{colors.white}"
    rounded: "{rounded.hud}"
    padding: "12px 20px"
  input-field:
    backgroundColor: "rgba(255, 255, 255, 0.95)"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "16px 20px"
  shop-card:
    backgroundColor: "{colors.shop-raise}"
    rounded: "{rounded.hud}"
---

# Design System: WorldGuessr

## Overview

**Creative North Star: "The Traveler's Passport"**

WorldGuessr looks like a well-worn passport turned into a game. The real world is always the main image: a live Street View pano or a full-bleed city photo fills the screen. The interface floats over it as small pieces of dark green glass. Stamps, streaks, pins, and collected cosmetics are the player's identity, the way stamps fill a passport. The mood is fun first: friendly, game-like, and never so heavy that it hides the world behind it.

The system is a single fixed dark theme. There is no light mode. Hierarchy comes from tone steps, not from outlines. Color is rationed: the green chrome is constant, and every other color has one job (gold = currency and wins, red = ranked and danger, pink = team play). Purchased cosmetics may retint the menus, but gameplay chrome never changes color.

**Key Characteristics:**
- Full-bleed world imagery under everything; chrome floats and stays small.
- Dark green translucent plates ("glass by opacity, never by blur").
- Tone carves hierarchy; strokes only speak state.
- Color is rationed to a few fixed meanings.
- Numbers are first-class: big, animated, tabular.

## Colors

One accent-aware green family carries all chrome; every other color is a status signal with a single fixed meaning.

### Primary
- **Forest Green** (#245734): The surface green. Fills HUD plates at 85% opacity (`--primaryTransparent`), draws the 2px frame on HUD chrome, and is the focus color for inputs. Exposed as `--primary` / `--surfR,G,B` channels.
- **Wash Green** (#144119): The gradient base (`--r,--g,--b`). All panel gradients (`--grad*` family) are built from these channels.
- **Night Green** (#112b18): `--primaryDark`. The 1.4px border on filled buttons and 1.5px border on footer chips. The darkest structural green.

### Secondary
- **Equip Green** (#4ade80): The default queue accent. Equipped shop cards use a quiet blue selected fill and label, never a green frame.
- **Stamp Gold** (#ffd700): Currency and victory. The stamp mark, won-item frames, purchase celebrations. Never decorative.

### Tertiary
- **Ranked Red** (#ff474c): Ranked mode identity, timer-critical state, errors and losses.
- **Team Pink** (#f06292): 2v2 team mode identity.

### Neutral
- **White** (#ffffff): All text on dark chrome. The dominant text color by far.
- **Ink** (#333333): Text inside light input fields only.
- **Shop Panel** (#06160e), **Shop Raise** (#0f2417), **Shop Well** (#030a06): The three-tone elevation ladder (~11 sRGB units per step). Derived from the site's modal wash over black, so the storefront stays "near-neutral with a whisper of green," never generic dark-mode black.
- **Duel Glass** (rgba(8,8,8,0.92)): The cooler, darker glass for duel HP bars, distinct from the green HUD pill.
- **House Scrim** (rgba(0,0,0,0.3)): The default shadow and scrim alpha, used ~40 times.

### Named Rules
**The Rationed Color Rule.** In the shop grid, green belongs to the buy action; gold belongs to currency and purchase wins. Equipped cards use a quiet blue selected fill without a frame, while the small Equipped action uses the current site accent to match mobile. Never put `--primary` back on every card surface.

**The Menu Rule.** The menu wears its background's colors; gameplay never does. Only the named menu roots (home content, HUD corner, account modal, settings, shop, map modal, maps page, user profile) read the accent variables (`--accWashR/G/B`, `--accSurfR/G/B`, `--accDeep`). Accent application is all-or-nothing: a partial accent resolves to null and everything stays green.

**The Status Colors Stay Rule.** Ranked red, team pink, streak gold, and win/loss ticks are never retinted by an equipped accent. They are information, not chrome.

## Typography

**Display Font:** Jockey One (with metric-matched Arial fallback)
**Body Font:** Lexend (with metric-matched Arial fallback)
**Cyrillic:** Rubik (body) and Oswald (display), registered under the same family names via unicode-range.

**Character:** A tall condensed arcade voice for titles over the loud, quiet readable rounded sans for everything else. Playful at the top, calm in the body.

### Hierarchy
- **Display** (400, fluid `min(clamp(1.8em,4vw,13em), clamp(1.5em,6vh,8em))`): Hero titles over the photo. Always Jockey One.
- **Headline** (500, `clamp(1.1rem, 2vw, 1.5rem)`): HUD pills, section headers.
- **Title** (600, 1rem): Card titles, button labels. 600 is the workhorse weight.
- **Body** (400, 0.9rem): The most common body size. Descriptions, chat, settings.
- **Label** (600, 0.8rem): Small chips and captions. Never uppercase.
- **Score** (700-900, up to 3rem): Big animated numbers (`.summary-score` #4CAF50 3rem is the largest text in the product).

### Named Rules
**The Tabular Numbers Rule.** Every number that changes while visible (timers, counters, ELO, stamps) uses `font-variant-numeric: tabular-nums` so its container never breathes.

**The Photo Text Rule.** Text sitting directly on the photo wears `-webkit-text-stroke: 1px black` plus `text-shadow: 2px 2px black`. Text on a plate wears only a soft `text-shadow: 0 2px 4px rgba(0,0,0,0.3)`; the plate carries the contrast.

**The Shadow Font Rule.** Cyrillic falls through to Rubik/Oswald via unicode-range faces registered under the same family names. Each shadow face's font-weight descriptor must exactly match the real face (`Lexend: 100 900`, `Jockey One: 400`) or Latin text falls to the system font.

**The Storefront Type Rule.** Shop page titles and shelf headings use bold Lexend on the Headline ramp. The storefront is a utility catalogue, not a hero screen, so its navigation stays readable and compact on both web and native instead of switching to the display face.

## Layout

Everything important is pinned to the frame, not to content. The home screen's bottom chrome is three independent `position: fixed` layers sharing the bottom edge: the footer buttons (bottom 50px, z 10000), the community banner above them, and the player count pinned bottom-right (50px/50px). All three enter with the same `footerEnter` rise (translateY 40px → 0, 0.3s) and never replay their entrance when a modal covers them.

Fluid type does the responsive work: hero and button text scale with `min(clamp(vw), clamp(vh))` pairs so both axes bound the size. The HUD corner is a `clamp()`-scaled flex column inset by `clamp(12px, ..., 50px)`.

Modals size from the backdrop, not the viewport: `max-height: min(80vh, 100%)` where 100% is the backdrop's padded box, because vh lies under mobile URL bars. At ≤768px modals go edge-to-edge. The navbar is a click-through shell (`pointer-events: none`) whose children opt back in.

## Elevation & Depth

Depth comes from tone, not from lines and not from blur. A surface is what it is because of the step it sits on. The shop states the model at its purest: the equipped site background remains visible beneath one dark wash, then three flat tones (#06160e panel, #0f2417 raise, #030a06 well) carry the chrome; a card is a card because it is one step lighter than the panel, and a preview stage is a recess because it is two steps darker.

HUD chrome floating over the live pano is glass by opacity: an 85%-opaque green plate with a gradient wash. `backdrop-filter` is banned on anything that sits over the pano or a full-bleed photo, because the browser re-blurs the region every time the pixels behind it change. Do not stack a dark sheet on top either; if a pano is too bright, raise the plate's alpha.

Shadows exist but are tools, not decoration: a tight `0 2px 3px rgba(0,0,0,0.35)` seats shop cards; `0 4px 6px rgba(0,0,0,0.3)` lifts buttons on hover; the HUD pill wears the one rich three-layer stack (ambient drop + accent glow + inset top highlight); modals get `0 10px 40px rgba(0,0,0,0.7)`.

### Shadow Vocabulary
- **Card seat** (`box-shadow: 0 2px 3px rgba(0,0,0,0.35)`): Shop cards at rest. Tight, not bloomed.
- **Button lift** (`box-shadow: 0 4px 6px rgba(0,0,0,0.3)`): Filled buttons on hover, with `scale(1.05)`.
- **Container drop** (`box-shadow: 0 6px 7px rgba(0,0,0,0.3)`): The `.g2_container` panel family.
- **HUD stack** (`0 8px 32px rgba(0,0,0,0.35), 0 4px 12px rgba(36,87,52,0.3), inset 0 1px 0 rgba(255,255,255,0.15)`): The `.timer` pill and everything that copies it.
- **Modal float** (`0 10px 40px rgba(0,0,0,0.7)`): Dialogs over the 75% black backdrop.

### Named Rules
**The Tone-Carves Rule.** Hierarchy is carved by tone steps. Strokes exist only to speak exceptional state: won gold, refused red, or keyboard focus. Equipped shop items use fill and their action label, not a surrounding frame. Never draw a ring around a surface to make it a surface.

**The No-Blur Rule.** No `backdrop-filter` on chrome over the live pano or full-bleed photos (`.timer`, g2 containers, HP bars, player card, shop, queue). Glass is faked with opacity.

**The Compositor Pulse Rule.** Attention pulses animate opacity on a pseudo-element only. Never animate `box-shadow` or `filter` per-frame.

## Shapes

Rounded but never pill-happy. The radius vocabulary is small and semantic: 12px for input fields and modals, 15px for game buttons, 16px for HUD plates and cards, 20px for large containers, 24px for full-page modal cards, 50px only for the nav button capsule, 50% for avatars and dots. `border-radius: 9999px` chips with outline rings were explicitly rejected ("very AI generated").

Structural borders are thick and green when they exist at all: 1.4px `--primaryDark` on filled buttons, 2px `--primary` on HUD plates. Never outline surfaces or separators with decorative 1px hairlines. Use tone, spacing, shadow, or an inset highlight instead.

The one signature silhouette is the map pin: an 87x131 teardrop PNG on a 150x163 canvas with about 32px of transparent glow headroom above and beside it, none below, so the needle tip anchors the ground point exactly.

## Components

### Buttons
- **Shape:** Rounded (15px via `.gameBtn`; nav variant is a 50px capsule).
- **Primary** (`.g2_green_button` + `.gameBtn`): accent gradient fill (`--gradGreenBtn`, 135deg wash fading to transparent), 1.4px Night Green border, white text, fluid `min(clamp())` type.
- **Hover / Focus:** background resolves to solid Forest Green, button lift shadow, `scale(1.05)`; transition `background-color 0.3s, box-shadow 0.3s, transform 0.3s`.
- **Red / Blue variants:** fixed `--gradRed` / `--gradBlue` gradients (never accent-tinted); red is destructive/leave, blue is informational.
- **Home menu** (`.home__mode`, styles/homeMenu.css): Singleplayer is the primary button (`.home__mode--primary` = the `.gameBtn` + `.g2_green_button` recipe: `--gradGreenBtn` face, 1.4px Night Green rim, 15px radius, centred 600 label at 1.1x the rows, no glyph; hover solid `--primary` + lift + scale 1.04). Every other mode is a plain row — an outline glyph then the name in 500 Lexend on the menu's fluid size, `--homeMenuSize` = 55% of the wordmark's formula on desktop layouts (clamp 0.85rem..3rem, so the two scale together), `min(clamp(1.3rem,1.85vw,3.2rem), clamp(1.1rem,3.4vh,3rem))` on phones and short viewports (~36px at 1080p, ~47px at 1440p; the wordmark floors at 1.5x it) — with 2px `rgba(255,255,255,0.26)` rules between the four groups (solo, matchmade, friends, daily). Row hover keeps the text-link behaviour: tint (aqua, or singleplayer #77dd77 / ranked #ff474c / daily #ff7a1a) and a 6px nudge. `.g2_nav_text` survives only in the settings and CountryGuessr sidebars.

### Cards / Containers
- **Corner Style:** 16px (cards), 20px (containers), 24px (page-level).
- **Background:** two-layer stack: accent gradient (`--gradLight`) over a flat dark tint `rgba(6,16,10,0.55)`. Shop cards are flat Shop Raise tone instead.
- **Shadow Strategy:** container drop or card seat (see Elevation).
- **Border:** none at rest. Shop cards hold `border: 2px solid transparent` reserved for state.
- **Internal Padding:** 15px standard.

### Inputs / Fields
- **Style:** opaque white field `rgba(255,255,255,0.95)`, Ink text, 2px Night Green border, 12px radius. One recipe reused from username entry to chat.
- **Focus:** border becomes Forest Green; large fields add a green glow ring `0 0 0 3px rgba(accent, 0.4)` and lift 1px; chat-size fields change border color only.
- **Error / Dark variant:** the destructive-confirm input inside error modals is the one dark field: `rgba(255,255,255,0.05)` fill, white text.

### Navigation
- Top bar is a click-through shell; its children are HUD chrome (the `.timer` recipe) or nav capsules. Home navigation is the one-mode-per-line list (see Buttons). Entrances use `hudEnter` (opacity + translateY(-8px)) for all HUD chrome, one rule for everything.

### The HUD Pill (signature)
The `.timer` recipe is the canonical chrome and the copy source for the player card, wallet chip, team scorebar, season badges, and the mobile GameTimer: `--gradLight` wash over 85%-opaque Forest Green, 2px Forest Green frame, 16px radius, the three-layer HUD stack shadow, soft text-shadow, tabular numbers. Critical state swaps to a red two-stop gradient, pale red border, `scale(1.05)`, and an opacity-only pulse. New HUD chrome copies this recipe verbatim; it never invents a sibling.

### The Modal (signature)
One shared `Modal.js`: 75% black backdrop, 12px radius, no decorative rim, diagonal wash `rgba(0,0,0,0.95) → accent wash 0.9 → rgba(0,0,0,0.95)`, modal float shadow. Close button is a 32px circle that rotates 90° on hover, the one playful micro-interaction in the recipe. Sizing is backdrop-derived (`min(80vh, 100%)`); edge-to-edge at ≤768px. Destination surfaces such as Maps and Shop use explicit full-viewport variants instead of pretending to be oversized dialogs.

### Cosmetics (signature)
- **Name glows** are additive only: they emit `text-shadow`, never `color`, because name fill is rank information. Dark surfaces get a 4-layer 24px-reach halo; light surfaces a 9px-reach one. Every animated keyframe restates the dark legibility layer so a purchase can never reduce readability.
- **The stamp mark** is one drawing at one token size (45px, `--stampMarkSize`); digits derive as ratios (0.62 / 0.36). The shop card's buy button is the single sanctioned 22px exception.
- **Marker skins** are ordinary pin PNGs on the shared canvas spec. A skinned pin gives up team color; the glowing name label restores the "whose pin" read.

## Do's and Don'ts

### Do:
- **Do** build new HUD chrome by restating the `.timer` recipe (fill, frame, radius, shadow) so it takes future corrections at the same time.
- **Do** carve hierarchy with tone steps (~11 sRGB units per step in the shop ladder) and reserve strokes for state.
- **Do** use `tabular-nums` on every live number and animate counters ease-out at 30Hz.
- **Do** keep accent-tinting all-or-nothing, through the one selector allowlist in globals.scss.
- **Do** use opacity-only pulses on pseudo-elements for attention states.
- **Do** ship metric-matched fallback fonts and weight-matched Cyrillic shadow faces.
- **Do** put a 1px black text-stroke + hard offset shadow on any text placed directly over the photo.

### Don't:
- **Don't** draw 1px translucent-white hairline rings around surfaces. The owner vetoed "the whole species" as AI slop; it is the single biggest "someone else's app" tell.
- **Don't** stack gradients. One wash over one flat tint is the maximum; "four gradients deep is tinted haze in front of more tinted haze."
- **Don't** use `backdrop-filter` on anything over the pano or a full-bleed photo, and don't stack a black underlay instead; raise the plate's alpha.
- **Don't** make `9999px` pill chips with outline borders, uppercase micro-labels, or badges that describe the thing they are stuck to ("the movement is the label").
- **Don't** put accent green on shop surfaces or retint status colors (ranked red, team pink, gold) with an equipped accent.
- **Don't** use SVG or glyph map pins; pins are PNG images on the 150x163 glow canvas, always.
- **Don't** let a cosmetic replace a fill color; cosmetics add light on top.
