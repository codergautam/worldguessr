import { StyleSheet, Text, View, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from '../ui/SfxPressable';
import PlayerName from '../PlayerName';
import { colors, resolveLeague, t } from '../../shared';

/* ===========================================================================
 *  THE PLAYER CARD — the top-right corner of the home screen.
 *
 *  IT SAYS TWO THINGS. Who you are, then what you are rated:
 *
 *      Gautam 🇮🇳         ⌄
 *      1043 ELO 🏆
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
  /** The two small chips under the card (Stamps tile, Community Maps). */
  chipHeight: number;
  chipFontSize: number;
}

export const CORNER_GAP = 8;
/** Vertical space between the card's two lines. */
const LINE_GAP = 2;

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
 */
export function playerCardMetrics(shortestSide: number): PlayerCardMetrics {
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
      chipHeight: 40,
      chipFontSize: 15,
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
      chipHeight: 36,
      chipFontSize: 14,
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
    chipHeight: 32,
    chipFontSize: 13,
  };
}

/** The card alone. Both line boxes are a fixed lineHeight, so this is exact. */
export function playerCardHeight(m: PlayerCardMetrics): number {
  return m.paddingVertical * 2 + m.nameLineHeight + LINE_GAP + m.textLineHeight;
}

/**
 * How far down the home screen's top-right corner reaches: the card, then ONE
 * row holding both chips side by side. WsIndicator reads this so it can sit
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

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          paddingHorizontal: metrics.paddingHorizontal,
          paddingVertical: metrics.paddingVertical,
          gap: metrics.caretGap,
        },
        pressed && !ghost && styles.cardPressed,
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
            <Text style={[styles.elo, statText, styles.eloLive]} numberOfLines={1}>
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
          {!ghost && league && (
            <Text style={[styles.badge, statText, { marginLeft: metrics.textFontSize * 0.5 }]}>
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: Platform.OS === 'android' ? '#1a4423' : colors.primaryTransparent,
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
  cardPressed: {
    backgroundColor: colors.primary,
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
