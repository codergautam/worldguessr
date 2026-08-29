/**
 * One home menu entry — web's components/ui/modeItem.js + styles/homeMenu.css,
 * verbatim. A row: an outline glyph, then the mode's name in semi-bold.
 *
 * ONE SIZE FEEDS EVERYTHING, like the CSS: homeMenuTextSize (webType.ts) is
 * the row em; a glyph is 1.05x of its row, paddings and gaps the same
 * fractions the stylesheet uses. A rotation re-derives all of it the way the
 * vw/vh clamps do.
 *
 * `accessory` trails the label (the daily streak pill). HomeMenuRule is the
 * thin line between groups (web .home__menu__hr).
 */
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from '../ui/SfxPressable';
import { colors } from '../../shared';
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
          paddingVertical: Math.round(base * 0.25),
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
      {accessory ? <View style={{ marginLeft: Math.round(base * 0.5) }}>{accessory}</View> : null}
    </Pressable>
  );
}

/** The thin line between menu groups — web .home__menu__hr. */
export function HomeMenuRule() {
  const { width, height } = useWindowDimensions();
  const base = homeMenuTextSize(width, height);
  // No width: it stretches to the menu, and the menu shrink-wraps to its
  // widest row (home.tsx modeMenu), so the rule runs the length of the text.
  return <View style={[styles.rule, { marginVertical: Math.round(base * 0.35) }]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
  },
  rowPressed: {
    opacity: 0.7,
  },
  label: {
    flexShrink: 1,
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
  rule: {
    alignSelf: 'stretch',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
});
