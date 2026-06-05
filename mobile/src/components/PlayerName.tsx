import { type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  type ImageStyle,
} from 'react-native';
import CountryFlag from './CountryFlag';

interface PlayerNameProps {
  /** The name/label text, shown first. */
  name: string;
  /** ISO-2 country code. When set, the flag is rendered AFTER the name. */
  countryCode?: string | null;
  /** Flag height in px (width auto-derives as size * 1.5). */
  flagSize?: number;
  /** Style applied to the name <Text>. */
  textStyle?: StyleProp<TextStyle>;
  /** Style applied to the flag <Image>. */
  flagStyle?: StyleProp<ImageStyle>;
  /** Style merged onto the row container (gap/justify/wrap overrides etc.). */
  style?: StyleProp<ViewStyle>;
  /** Horizontal gap between name, flag and any trailing children. */
  gap?: number;
  /** Lines before truncating the name. 0 = unlimited. Defaults to 1. */
  numberOfLines?: number;
  /** Extra nodes rendered AFTER the flag — inline ELO, host/supporter badges, etc. */
  children?: ReactNode;
}

/**
 * Canonical "[username] [flag]" pair — the ONE place this layout lives.
 *
 * The flag ALWAYS follows the name so ordering stays consistent everywhere it
 * appears (duel HUD, lobby/leaderboards, results, profile header, emotes). If a
 * country code is missing, only the name renders.
 *
 * - Inline trailing bits (ELO, host/supporter badges) → pass as `children`
 *   (they render after the flag).
 * - Leading bits (rank number, trophy, medal) → keep them as a sibling in the
 *   parent row, before <PlayerName>.
 */
export default function PlayerName({
  name,
  countryCode,
  flagSize = 16,
  textStyle,
  flagStyle,
  style,
  gap = 6,
  numberOfLines = 1,
  children,
}: PlayerNameProps) {
  return (
    <View style={[styles.row, { gap }, style]}>
      <Text style={[styles.name, textStyle]} numberOfLines={numberOfLines}>
        {name}
      </Text>
      {countryCode ? (
        <CountryFlag countryCode={countryCode} size={flagSize} style={flagStyle} />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  name: {
    flexShrink: 1,
  },
});
