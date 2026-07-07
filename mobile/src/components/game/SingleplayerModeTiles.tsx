import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, t } from '../../shared';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';

export type SingleplayerModeTile = 'world' | 'country' | 'continent';

interface Props {
  currentMode?: SingleplayerModeTile | null;
  onSelect: (mode: SingleplayerModeTile) => void;
}

// Store the locale KEY (not a t() call) at module scope — t() reads a table set
// to the user language only after module load, so calling it here would capture
// English permanently. Resolve titleKey -> t(titleKey) at render time instead.
const TILES: Array<{
  mode: SingleplayerModeTile;
  titleKey: string;
  image: string;
}> = [
  {
    mode: 'world',
    titleKey: 'world',
    image: 'https://www.worldguessr.com/world.jpg',
  },
  {
    mode: 'country',
    titleKey: 'countryGuesser',
    image: 'https://www.worldguessr.com/flags.jpg',
  },
  {
    mode: 'continent',
    titleKey: 'continentGuesser',
    image: 'https://www.worldguessr.com/continents.jpg',
  },
];

export default function SingleplayerModeTiles({
  currentMode,
  onSelect,
}: Props) {
  return (
    <View style={styles.wrap}>
      {TILES.map((tile) => {
        const active = tile.mode === currentMode;
        return (
          <Pressable
            key={tile.mode}
            onPress={() => onSelect(tile.mode)}
            style={({ pressed }) => [
              styles.tile,
              active && styles.tileActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <ImageBackground
              source={{ uri: tile.image }}
              resizeMode="cover"
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.68)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Text style={styles.title} numberOfLines={2}>
              {t(tile.titleKey)}
            </Text>
            {active && (
              <View style={styles.check}>
                <Ionicons name="checkmark" size={14} color={colors.white} />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tile: {
    flex: 1,
    aspectRatio: 1.25,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tileActive: {
    borderColor: colors.warning,
  },
  title: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes.sm,
    lineHeight: 17,
  },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
