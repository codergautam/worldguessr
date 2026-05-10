import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../shared';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';

export type SingleplayerModeTile = 'world' | 'country' | 'continent';

interface Props {
  currentMode?: SingleplayerModeTile | null;
  searchQuery?: string;
  onSelect: (mode: SingleplayerModeTile) => void;
}

const TILES: Array<{
  mode: SingleplayerModeTile;
  title: string;
  image: string;
}> = [
  {
    mode: 'world',
    title: 'World',
    image: 'https://www.worldguessr.com/world.jpg',
  },
  {
    mode: 'country',
    title: 'Country Guesser',
    image: 'https://www.worldguessr.com/flags.jpg',
  },
  {
    mode: 'continent',
    title: 'Continent Guesser',
    image: 'https://www.worldguessr.com/continents.jpg',
  },
];

export default function SingleplayerModeTiles({
  currentMode,
  searchQuery = '',
  onSelect,
}: Props) {
  const query = searchQuery.trim().toLowerCase();
  const tiles = query
    ? TILES.filter((tile) => tile.title.toLowerCase().includes(query))
    : TILES;

  if (tiles.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {tiles.map((tile) => {
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
              {tile.title}
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
