import { useState } from 'react';
import {
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/shared';
import { borderRadius, fontSizes, spacing } from '../../src/styles/theme';
import { onboardingAnalytics } from '../../src/services/onboardingAnalytics';

interface Tile {
  id: string;
  label: string;
  emoji: string;
  /** When `subMode === 'continent'`, the picker should always start a continent guesser game.
   *  All other tiles play country guesser, scoped to the given region (or world for "all"). */
  subMode: 'country' | 'continent';
  region: string;
}

const TILES: Tile[] = [
  { id: 'all',           label: 'World',           emoji: '🌐',   subMode: 'country',   region: 'all' },
  { id: 'continent',     label: 'Continent Mode',  emoji: '🗺️',   subMode: 'continent', region: 'all' },
  { id: 'Africa',        label: 'Africa',          emoji: '🦒',   subMode: 'country',   region: 'Africa' },
  { id: 'Asia',          label: 'Asia',            emoji: '🐼',   subMode: 'country',   region: 'Asia' },
  { id: 'Europe',        label: 'Europe',          emoji: '🏰',   subMode: 'country',   region: 'Europe' },
  { id: 'North America', label: 'North America',   emoji: '🦅',   subMode: 'country',   region: 'North America' },
  { id: 'South America', label: 'South America',   emoji: '🌴',   subMode: 'country',   region: 'South America' },
  { id: 'Oceania',       label: 'Oceania',         emoji: '🐨',   subMode: 'country',   region: 'Oceania' },
];

export default function CountryGuesserConfig() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<string>('all');

  const cols = width >= 700 ? 4 : width >= 500 ? 3 : 2;

  const onPlay = () => {
    const tile = TILES.find((t) => t.id === selected) ?? TILES[0];
    onboardingAnalytics.casualConfigured(tile.subMode, tile.region);
    router.push({
      pathname: '/countryGuesser/play',
      params: { subMode: tile.subMode, region: tile.region },
    });
  };

  return (
    <View style={styles.root}>
      <ImageBackground
        source={require('../../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
      <View style={styles.darkOverlay} />
      <LinearGradient
        colors={[
          'rgba(20, 65, 25, 0.95)',
          'rgba(20, 65, 25, 0.7)',
          'rgba(20, 65, 25, 0.3)',
          'transparent',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="arrow-back" size={22} color={colors.white} />
            <Text style={styles.backBtnText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Country Guesser</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>Pick your challenge</Text>
          <Text style={styles.subheading}>
            Identify the country (or continent) you've been dropped into.
          </Text>

          <View style={styles.grid}>
            {TILES.map((tile) => {
              const isActive = selected === tile.id;
              return (
                <View key={tile.id} style={[styles.cell, { width: `${100 / cols}%` }]}>
                  <Pressable
                    onPress={() => setSelected(tile.id)}
                    style={({ pressed }) => [
                      styles.tile,
                      isActive && styles.tileActive,
                      pressed && !isActive && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                    <Text style={styles.tileLabel} numberOfLines={2}>
                      {tile.label}
                    </Text>
                    {isActive && (
                      <View style={styles.tileCheck}>
                        <Ionicons name="checkmark" size={14} color={colors.white} />
                      </View>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View style={[styles.playWrap, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <Pressable
            onPress={onPlay}
            style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.playBtn}
            >
              <Text style={styles.playBtnText}>Play</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1a0c' },
  darkOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  backBtnText: {
    color: colors.white,
    fontFamily: 'Lexend-Medium',
    fontSize: fontSizes.md,
  },
  title: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes.xl,
  },
  headerSpacer: {
    width: 60,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  heading: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes['2xl'],
    marginBottom: spacing.xs,
  },
  subheading: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Lexend',
    fontSize: fontSizes.sm,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  cell: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  tile: {
    aspectRatio: 1,
    backgroundColor: 'rgba(15, 35, 22, 0.85)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    gap: spacing.xs,
    overflow: 'hidden',
  },
  tileActive: {
    borderColor: colors.warning,
    backgroundColor: 'rgba(40, 80, 50, 0.9)',
  },
  tileEmoji: {
    fontSize: 36,
  },
  tileLabel: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  tileCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.warning,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playWrap: {
    paddingHorizontal: spacing.lg,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  playBtnText: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes.lg,
  },
});
