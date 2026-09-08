/**
 * One home menu entry — web's components/ui/modeItem.js + styles/homeMenu.css,
 * verbatim. A row: an outline glyph, then the mode's name in semi-bold.
 *
 * ONE SIZE FEEDS EVERYTHING, like the CSS: homeMenuTextSize (webType.ts) is
 * the row em; a glyph is 1.05x of its row, paddings and gaps the same
 * fractions the stylesheet uses. A rotation re-derives all of it the way the
 * vw/vh clamps do.
 *
 * TOUCH SPACING (Sep 4, owner: "too easy to mistap the mode buttons on
 * mobile, increase the gap"): rows pad 0.4em top and bottom (web desktop
 * keeps 0.25em, a mouse does not mistap) and HomeMenuGroup puts a 0.25em
 * dead gap between the rows of a group, so a tap on the seam lands on
 * nothing rather than on the neighbour. ~46px rows on a 52px pitch at the
 * 23px phone floor. Web's phone branch (homeMenu.css compact query) carries
 * the same numbers.
 *
 * `accessory` trails the label (the daily streak pill). HomeMenuRule is the
 * thin line between groups (web .home__menu__hr): the widest row's width,
 * same as web. A 3.5em dash and an 8em cap were both tried and rejected
 * (owner, Sep 4: "just change it to the original widths"). Since Sep 5 the
 * menu also has a floor on phones, the hero plate's minimum (home.tsx
 * modeMenu), so the rules never run shorter than the plate.
 */
import type { ComponentProps, ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from '../ui/SfxPressable';
import { colors } from '../../shared';
import { useSiteAccent } from '../../store/siteBackgroundStore';
import { HOME_MAX_FONT_MULT, homeMenuTextSize } from '../../styles/webType';

interface Props {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessory?: ReactNode;
}

export default function ModeItem({ icon, label, onPress, disabled = false, accessory }: Props) {
  const { width, height } = useWindowDimensions();
  const base = homeMenuTextSize(width, height);

  return (
    <Pressable
      // Home main-menu scope plays ui_click, not click_2 (web .g2_nav_ui
      // parity via the delegated listener).
      sfx="ui"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.row,
        {
          gap: Math.round(base * 0.5),
          paddingVertical: Math.round(base * 0.4),
          paddingHorizontal: Math.round(base * 0.25),
        },
        pressed && styles.rowPressed,
        disabled && styles.disabled,
      ]}
    >
      <Ionicons name={icon} size={Math.round(base * 1.05)} color="rgba(255, 255, 255, 0.9)" />
      <Text
        style={[styles.label, { fontSize: base, lineHeight: Math.round(base * 1.2) }]}
        maxFontSizeMultiplier={HOME_MAX_FONT_MULT}
        // One line, always (web: white-space nowrap).
        numberOfLines={1}
      >
        {label}
      </Text>
      {/* The row's gap is the whole distance to the pill, like web (the
          pill's own margin-left was removed there, 96e69392b); an extra 0.5em
          here doubled it (owner, Sep 5: "reduce gap between daily challenge
          button and label"). */}
      {accessory ? <View>{accessory}</View> : null}
    </Pressable>
  );
}

/* The hero row (mobile only; web has no equivalent): the one action on the
 * screen. Same 2px/16 accent frame as PlayerCard and StampsTile, but the
 * FILLED accent face (the corner cards wear the translucent glass), plus the
 * glow ProfileView gives its active tab. Pressed = accent.deep, no opacity
 * dip. Inside: a 1.35em filled glyph, a SemiBold label over a 0.62em subline,
 * and a bare white arrow-forward at the trailing edge in its own flex box
 * (never overlaid on the text, nothing drawn behind it). Width = the menu's
 * width (alignSelf stretch; home.tsx modeMenu sets the 13.5 row-em floor);
 * the text column takes the slack so the arrow sits at the edge. A
 * shrink-wrapped plate and a full-screen-width plate were both rejected on
 * device, as were a darker face and a disc behind the arrow. */
interface HeroProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  /** One short line under the label: `singleplayerSub`, translated in every
   *  public/locales common.json (mobile is its only reader; web has no hero row). */
  sub: string;
  onPress: () => void;
  disabled?: boolean;
}

export function HeroModeItem({ icon, label, sub, onPress, disabled = false }: HeroProps) {
  const { width, height } = useWindowDimensions();
  const base = homeMenuTextSize(width, height);
  const accent = useSiteAccent();

  return (
    <Pressable
      sfx="ui"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={sub}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.hero,
        {
          gap: Math.round(base * 0.45),
          paddingVertical: Math.round(base * 0.4),
          // 0.7 / 0.6 (were 0.55 / 0.4): "increase width of singleplayer btn
          // slightly" (owner, Sep 5), ~12px on a phone with the arrow's lead-in.
          paddingLeft: Math.round(base * 0.7),
          paddingRight: Math.round(base * 0.6),
          backgroundColor: pressed ? accent.deep : accent.primary,
          borderColor: accent.primary,
          shadowColor: accent.primaryTransparent,
        },
        disabled && styles.disabled,
      ]}
    >
      <Ionicons name={icon} size={Math.round(base * 1.35)} color={colors.white} />
      <View style={styles.heroText}>
        <Text
          style={[styles.heroLabel, { fontSize: base, lineHeight: Math.round(base * 1.2) }]}
          maxFontSizeMultiplier={HOME_MAX_FONT_MULT}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.heroSub,
            { fontSize: Math.round(base * 0.62), lineHeight: Math.round(base * 0.62 * 1.3) },
          ]}
          maxFontSizeMultiplier={HOME_MAX_FONT_MULT}
          numberOfLines={1}
        >
          {sub}
        </Text>
      </View>
      <Ionicons
        name="arrow-forward"
        size={Math.round(base * 1.2)}
        color={colors.white}
        style={{ marginLeft: Math.round(base * 0.45) }}
      />
    </Pressable>
  );
}

/** The rows of one menu group — web .home__menu__group. The gap is the dead
 *  zone between two touch targets. */
export function HomeMenuGroup({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const base = homeMenuTextSize(width, height);
  return <View style={{ gap: Math.round(base * 0.25) }}>{children}</View>;
}

/** The thin line between menu groups — web .home__menu__hr. */
export function HomeMenuRule() {
  const { width, height } = useWindowDimensions();
  const base = homeMenuTextSize(width, height);
  // No width: it stretches to the menu, and the menu shrink-wraps to its
  // widest row above a phone floor (home.tsx modeMenu), so the rule runs the
  // length of the text and never shorter than the hero plate.
  return <View style={[styles.rule, { marginVertical: Math.round(base * 0.35) }]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // ONE LINE, NO MATTER WHAT (owner, Sep 5: "the daily challenge streak
    // badge appears in a new line, overlapping with join our community
    // button ... it should always be on the same line no matter what").
    // The row does not wrap and nothing in it shrinks: a label + pill wider
    // than the column (360-wide phones, ru/de labels) runs on past the
    // padding, like web's white-space nowrap. The wrap that sat here for one
    // day (pill drops below on narrow phones) put the pill on a second line
    // that the row's box did not always include (seen in landscape), so the
    // pill lay on top of the community banner below the menu.
    borderRadius: 12,
  },
  rowPressed: {
    opacity: 0.7,
  },
  label: {
    // Never shrinks: web .home__mode__label keeps min-width auto for the same
    // reason. A label wider than the row on its own (de at 360) overflows the
    // padding like web rather than ellipsizing.
    flexShrink: 0,
    // Web .home__mode font-weight 500.
    fontFamily: 'Lexend-Medium',
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  disabled: {
    opacity: 0.5,
  },
  // Colours arrive inline: they follow the equipped background and a
  // StyleSheet is frozen at module load (ProfileView.tabButtonActive does the
  // same). Geometry lives here.
  hero: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 2,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 15,
      },
      android: { elevation: 4 },
    }),
  },
  heroText: {
    // Takes the slack so the arrow sits at the trailing edge of the plate.
    flex: 1,
    minWidth: 0,
  },
  heroLabel: {
    fontFamily: 'Lexend-SemiBold',
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  heroSub: {
    fontFamily: 'Lexend-Medium',
    color: 'rgba(255,255,255,0.8)',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  rule: {
    alignSelf: 'stretch',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
});
