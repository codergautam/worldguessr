import { StyleSheet, Text, View, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from '../ui/SfxPressable';
import PlayerName from '../PlayerName';
import { colors, resolveLeague, t } from '../../shared';
import { useSiteAccent } from '../../store/siteBackgroundStore';

/* ===========================================================================
 *  THE PLAYER CARD — the top-right corner of the home screen.
 *
 *  IT SAYS TWO THINGS. Who you are, then what you are rated:
 *
 *      Gautam 🇮🇳         ⌄
 *      1043 ELO 🏆       <- digits tinted with the tier's colour
 *
 *  Everything else that was ever here has left. The BALANCE became its own tile
 *  below (rendered by home.tsx). The TIER NAME ("Voyager") is gone — the badge
 *  already says it in one glyph, and spelling it out put a fourth fact on a chip
 *  that lives in the corner of a game.
 *
 *  ALIGNMENT, because this took three passes to get right:
 *
 *   - THE CARET IS A SIBLING OF BOTH LINES, not a member of line 1. It used to
 *     live inside the name's row, which centred it against the NAME rather than
 *     against the card: it sat high and read as crowding the text it happened to
 *     share a line with.
 *   - THE BADGE IS LAST. Leading line 2 with the emoji pushed that line's
 *     visible start right by the glyph's side bearing, so the two lines stopped
 *     sharing a left edge even though their boxes did. A digit starts flush; an
 *     emoji does not.
 *   - THE RATING IS RIGHT-ALIGNED inside its reservation. The reservation is the
 *     FINAL rating's width and the count-up climbs into it, so right-aligning
 *     keeps the number flush against "ELO" the whole way up. Left-aligned, the
 *     gap before the unit shrank digit by digit for the length of the animation.
 *   - NO ROW `gap` ON LINE 2. One gap spaces a word and an emoji identically and
 *     they do not read that way — the emoji carries its own side bearings. Each
 *     element buys its own space, scaled off the font size.
 *
 *  TWO TYPE SIZES, and the name leads by ~14% rather than by a tier. Weight and
 *  dimming do the rest: 700 white on the digits, 400 at 72% on the unit.
 *
 *  SKIN = GameTimer's pill recipe, restated (src/components/game/GameTimer.tsx).
 *  That is the app's sanctioned HUD chrome and the native twin of the web
 *  `.timer`: translucent green, 2px --primary border, 16px radius, platform
 *  shadow. Not a gradient card, and no blur.
 *
 *  THE MEASUREMENT CLONE. home.tsx renders this twice — once in the interactive
 *  absolute overlay and once, invisibly, in the in-flow header, because that
 *  hidden copy is what reserves the header's height. `ghost` renders the exact
 *  same tree with the text blanked, so the guest state reserves the SIGNED-IN
 *  height and the menu below cannot jump the moment auth resolves. Blank text is
 *  height-exact by construction: both line boxes are a fixed lineHeight, and the
 *  flag is always shorter than the line it sits on.
 * ======================================================================== */

export interface PlayerCardMetrics {
  paddingHorizontal: number;
  paddingVertical: number;
  /** Line 1. A touch above textFontSize, not a tier above it. */
  nameFontSize: number;
  nameLineHeight: number;
  /** Line 2 — the rating, its unit and the badge all share this. */
  textFontSize: number;
  textLineHeight: number;
  flagSize: number;
  /** Gap between the two-line block and the caret. */
  caretGap: number;
  caretSize: number;
  /** The stamps tile under the card. Community Maps left for the footer. */
  chipHeight: number;
  /** The currency mark inside that tile, and the balance beside it. */
  chipMarkSize: number;
  chipValueSize: number;
}

export const CORNER_GAP = 8;
/** Vertical space between the card's two lines. */
const LINE_GAP = 2;

/* THE STAMPS TILE IS SIZED AGAINST THIS CARD, not against the shop.
 *
 * It used to take STAMP_MARK_SIZE (45) verbatim at every breakpoint, and that
 * number is right for a shop surface — which can grow to hold the artwork — and
 * wrong for this corner, which cannot. The card steps 18/20/24px of name; the
 * mark did not step at all, so on a phone the balance rendered at 28px beside an
 * 18px name: the currency was the largest thing in the corner, on a card whose
 * whole point is that the name leads, and the chip under the card stood nearly
 * as tall as the card.
 *
 * So the mark is a RATIO of the name now and stays one. Same two numbers web
 * uses (.stampsTile in styles/playerCard.css, which points the identical ratios
 * at its fluid --pcardName):
 *   mark   1.5x the name, floored at 30 — below roughly that the artwork stops
 *          being a picture of anything, and it is a stamp, not a glyph.
 *   digits 0.62 of the mark, the same ratio every other surface uses.
 * The tile's height is the mark plus 4px either side, as it always was. */
const chipMark = (nameFontSize: number) => Math.max(30, Math.round(nameFontSize * 1.5));
const chipValue = (markSize: number) => Math.round(markSize * 0.62);

/**
 * ONE table, three breakpoints, NUMBERS ONLY — the card is the same component
 * at every size. Keyed on the shortest side so a rotation cannot change tier.
 *
 * It lives here rather than in home.tsx because home is not the only consumer:
 * WsIndicator has to sit below this corner and is mounted app-wide, so it needs
 * the same numbers. One table, two readers, no chance of the badge landing on
 * the card because someone re-tuned a padding.
 *
 * (Web sizes this fluidly with clamp() because a browser window is dragged;
 * a device's width is fixed for the session, so a step here is never seen.)
 *
 * THE THREE chip* FIELDS ARE NOT IN THE TABLE, and that is the point: they are
 * COMPUTED from the tier's nameFontSize by the block above, so the tile cannot
 * drift out of proportion with the card the next time a name size is retuned.
 * They used to be one constant (the 45px mark plus 8) repeated in all three
 * rows, which is exactly how the chip ended up bigger than the name.
 *
 * (Removed) chipFontSize. It was the pair's LABEL size, and pointing it at the
 * mark as well is what dragged the word "Maps" up to 28px — which is what sent
 * that button to the footer. With Maps gone the stamps tile is the only chip
 * left, and its balance is chipValueSize now.
 */
type PlayerCardTier = Omit<PlayerCardMetrics, 'chipHeight' | 'chipMarkSize' | 'chipValueSize'>;

export function playerCardMetrics(shortestSide: number): PlayerCardMetrics {
  const tier = playerCardTier(shortestSide);
  const chipMarkSize = chipMark(tier.nameFontSize);
  return {
    ...tier,
    chipMarkSize,
    chipValueSize: chipValue(chipMarkSize),
    chipHeight: chipMarkSize + 8,
  };
}

function playerCardTier(shortestSide: number): PlayerCardTier {
  if (shortestSide >= 768) {
    return {
      paddingHorizontal: 18,
      paddingVertical: 12,
      nameFontSize: 24,
      nameLineHeight: 30,
      textFontSize: 21,
      textLineHeight: 27,
      flagSize: 19,
      caretGap: 18,
      caretSize: 16,
    };
  }
  if (shortestSide >= 430) {
    return {
      paddingHorizontal: 14,
      paddingVertical: 10,
      nameFontSize: 20,
      nameLineHeight: 26,
      textFontSize: 18,
      textLineHeight: 23,
      flagSize: 16,
      caretGap: 15,
      caretSize: 15,
    };
  }
  return {
    paddingHorizontal: 12,
    paddingVertical: 8,
    nameFontSize: 18,
    nameLineHeight: 23,
    textFontSize: 16,
    textLineHeight: 21,
    flagSize: 15,
    caretGap: 13,
    caretSize: 13,
  };
}

/** The card alone. Both line boxes are a fixed lineHeight, so this is exact. */
export function playerCardHeight(m: PlayerCardMetrics): number {
  return m.paddingVertical * 2 + m.nameLineHeight + LINE_GAP + m.textLineHeight;
}

/**
 * How far down the home screen's top-right corner reaches: the card, then the
 * stamps tile's row beneath it. WsIndicator reads this so it can sit
 * below the corner instead of guessing with the hardcoded `insets.top + 100` it
 * used to carry.
 */
export function homeCornerHeight(shortestSide: number): number {
  const m = playerCardMetrics(shortestSide);
  return playerCardHeight(m) + CORNER_GAP + m.chipHeight;
}

interface PlayerCardProps {
  metrics: PlayerCardMetrics;
  username: string;
  countryCode?: string | null;
  nameGlow?: string | null;
  /** Resolved by the caller so both copies agree. */
  elo: number | null;
  league: ReturnType<typeof resolveLeague> | null;
  /** The counting rating. Digits only. */
  animatedElo: number;
  onPress?: () => void;
  /** Blank clone used by the header's height reservation. */
  ghost?: boolean;
}

export default function PlayerCard({
  metrics,
  username,
  countryCode,
  nameGlow,
  elo,
  league,
  animatedElo,
  onPress,
  ghost = false,
}: PlayerCardProps) {
  const nameText = {
    fontSize: metrics.nameFontSize,
    lineHeight: metrics.nameLineHeight,
  };
  const statText = {
    fontSize: metrics.textFontSize,
    lineHeight: metrics.textLineHeight,
  };
  // THE DIGITS CARRY THE TIER'S COLOUR, the badge beside them repeats it as a
  // glyph — one fact said two ways on purpose. The colour is what reads at a
  // glance; the emoji is what stays legible to anyone who cannot separate
  // bronze from gold. Web does exactly this in components/ui/playerCard.js.
  //
  // `light` FIRST, then `color`: Trekker's base is #808080, a grey barely
  // brighter than the shadow under it. `light` is that tier's readable variant
  // and no other tier defines one, so this is a one-tier fix costing nothing.
  const leagueColor = ghost ? null : (league?.light ?? league?.color ?? null);
  const eloTint = leagueColor ? { color: leagueColor } : null;
  // THIS CARD FOLLOWS THE EQUIPPED BACKGROUND; GameTimer DOES NOT. The two
  // share a recipe and nothing else — the timer is in-game chrome and stays
  // WorldGuessr green, which is exactly why the recipe was restated in each
  // file rather than shared from one. Do not "fix" that duplication by pulling
  // this skin back into a common style; it would drag the accent into the
  // middle of a round.
  const accent = useSiteAccent();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          paddingHorizontal: metrics.paddingHorizontal,
          paddingVertical: metrics.paddingVertical,
          gap: metrics.caretGap,
          borderColor: accent.primary,
          backgroundColor: pressed && !ghost
            ? accent.primary
            : Platform.OS === 'android' ? accent.androidFlat : accent.primaryTransparent,
        },
      ]}
      onPress={ghost ? undefined : onPress}
      disabled={ghost}
      accessibilityRole="button"
      accessibilityLabel={t('profile')}
    >
      <View style={styles.body}>
        {ghost ? (
          <Text style={[styles.name, nameText]}> </Text>
        ) : (
          <PlayerName
            name={username}
            countryCode={countryCode}
            flagSize={metrics.flagSize}
            gap={Math.round(metrics.nameFontSize * 0.34)}
            textStyle={[styles.name, nameText]}
            glow={nameGlow}
          />
        )}

        <View style={styles.stat}>
          {/* THE WIDTH IS A HIDDEN COPY OF THE SETTLED RATING, not digits x an
              assumed digit width. That estimate was the same guess web made
              with `ch`: it takes no account of letter-spacing, of the bold
              weight, or of the placeholder that renders before the rating
              arrives, so the reserved box and the real text were never the same
              width and line 2 sat at a different width from line 1.

              The sizer holds the box at the settled value's REAL measured width
              for the whole count-up; the live value is laid over it, right
              aligned, so it climbs into that box and stays flush against "ELO".
              At rest the two are the same string, so line 2's left edge lands on
              line 1's exactly. */}
          <View>
            <Text
              style={[styles.elo, statText, styles.eloSizer]}
              numberOfLines={1}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {ghost || elo === null ? ' ' : Math.round(elo)}
            </Text>
            <Text style={[styles.elo, statText, eloTint, styles.eloLive]} numberOfLines={1}>
              {ghost || elo === null ? ' ' : animatedElo}
            </Text>
          </View>
          {!ghost && elo !== null && (
            <Text
              style={[styles.eloUnit, statText, { marginLeft: metrics.textFontSize * 0.34 }]}
              numberOfLines={1}
            >
              {t('elo')}
            </Text>
          )}
          {/* 0.2, SMALLER than the unit's 0.34, and not a typo: an emoji is
              drawn inside its own em box with side bearings, so that padding is
              already in the glyph and an identical margin reads visibly wider
              beside the badge than beside a word. Web uses the same ratio
              (.pcard__leagueEmoji, styles/playerCard.css). */}
          {!ghost && league && (
            <Text style={[styles.badge, statText, { marginLeft: metrics.textFontSize * 0.2 }]}>
              {league.emoji}
            </Text>
          )}
        </View>
      </View>

      <Ionicons
        name="chevron-down"
        size={metrics.caretSize}
        color="rgba(255,255,255,0.6)"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // GameTimer.tsx's pill, restated. Android gets the flat colour: a translucent
  // fill under an elevation shadow renders the shadow THROUGH the surface.
  //
  // A ROW: the two-line block, then the caret. `alignItems: center` is what puts
  // the caret on the card's optical centre instead of on line 1's.
  // Border and fill come from useSiteAccent at the call site above.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  // The two lines share a left edge, and that edge is the card's only vertical
  // alignment — which is why the rating is right-aligned inside its reservation.
  body: {
    flexShrink: 1,
    alignItems: 'flex-start',
    gap: LINE_GAP,
  },
  // NO `gap`: one gap spaces a word and an emoji identically and they do not
  // read that way. Each child carries its own marginLeft, off the font size.
  stat: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  name: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
  },
  elo: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  // Occupies space, paints nothing. opacity rather than visibility (RN has no
  // visibility) plus the accessibility hide, so the duplicate number is never
  // announced.
  eloSizer: {
    opacity: 0,
  },
  // RIGHT-aligned over the sizer, so the count-up climbs into the reservation
  // and stays flush against "ELO" the whole way up.
  eloLive: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  // Same size as the number, one step down in weight and dimmed. That is the
  // only hierarchy on this line and it is enough.
  eloUnit: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: 'Lexend',
    letterSpacing: 0.5,
  },
  badge: {
    color: colors.white,
  },
});
