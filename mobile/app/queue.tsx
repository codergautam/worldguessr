/**
 * Queue screen — shown while searching for a multiplayer match.
 * Animated radar "sonar" pulse behind a spinning compass, ranked/unranked
 * theming, an ELO range chip for ranked, and an elapsed timer. The shared
 * back button (top-left) is the single cancel affordance.
 *
 * Layout is orientation-aware: a vertical stack in portrait, and a centered
 * radar-beside-info row in landscape so everything fits one screen without
 * scrolling or clipping on short viewports.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import { colors, t } from '../src/shared';
import { spacing, fontSizes, borderRadius } from '../src/styles/theme';
import { wsService } from '../src/services/websocket';
import { useMultiplayerStore } from '../src/store/multiplayerStore';
import BackButton from '../src/components/ui/BackButton';
import WgWordmark from '../src/components/ui/WgWordmark';

const RADAR_MAX = 240; // radar container ceiling; everything inside derives from this

/** Expanding "sonar" rings that ripple outward from the center. */
function PulseRings({ accent, size }: { accent: string; size: number }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 2600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      );
    const anims = [make(a, 0), make(b, 870), make(c, 1740)];
    anims.forEach((x) => x.start());
    return () => anims.forEach((x) => x.stop());
  }, [a, b, c]);

  return (
    <>
      {[a, b, c].map((v, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            { position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2 },
            { borderColor: accent },
            {
              transform: [
                { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.55] }) },
              ],
              opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] }),
            },
          ]}
        />
      ))}
    </>
  );
}

export default function QueueScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const gameQueued = useMultiplayerStore((s) => s.gameQueued);
  const publicDuelRange = useMultiplayerStore((s) => s.publicDuelRange);
  const inGame = useMultiplayerStore((s) => s.inGame);
  const gameState = useMultiplayerStore((s) => s.gameData?.state);
  const exitedRef = useRef(false);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;
  const elapsedStr = `${mm}:${ss < 10 ? '0' : ''}${ss}`;

  // Radar scales to the shorter axis so it never crowds the rest of the screen.
  // Landscape is height-bound; portrait stays comfortably under the ceiling.
  const radarSize = isLandscape
    ? Math.min(RADAR_MAX, height * 0.6)
    : Math.min(RADAR_MAX, height * 0.32, width * 0.72);
  const ringBase = radarSize * 0.625;
  const coreSize = radarSize * 0.43;
  const compassSize = radarSize * 0.25;

  const titleSize = isLandscape
    ? Math.min(34, Math.max(22, height * 0.085))
    : Math.min(40, Math.max(26, width * 0.085));

  // Single exit path. Idempotent — caller can race state updates without double-popping.
  const exitBack = () => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    router.back();
  };

  // Match found → home.tsx owns navigating into /game/multiplayer. Mark this
  // screen exited so the beforeRemove cleanup below won't send leaveQueue when
  // the queue screen is later torn down underneath the game.
  useEffect(() => {
    if (inGame && gameState) {
      exitedRef.current = true;
    }
  }, [inGame, gameState]);

  // Server-side cancellation (gameCancelled etc.) → pop
  useEffect(() => {
    if (!gameQueued && !inGame) {
      exitBack();
    }
  }, [gameQueued, inGame]);

  // Swipe / hardware back → tell server, then let nav unwind naturally
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (!exitedRef.current) {
        exitedRef.current = true;
        wsService.send({ type: 'leaveQueue' });
        useMultiplayerStore.setState({ gameQueued: false, publicDuelRange: null });
      }
    });
    return unsubscribe;
  }, [navigation]);

  const handleCancel = () => {
    if (exitedRef.current) return;
    wsService.send({ type: 'leaveQueue' });
    useMultiplayerStore.setState({ gameQueued: false, publicDuelRange: null });
    exitBack();
  };

  const isRanked = gameQueued === 'publicDuel';
  const theme = isRanked
    ? {
        accent: '#fbbf24',
        glow: '#f59e0b',
        gradient: ['#fbbf24', '#f59e0b'] as const,
        icon: 'trophy' as const,
        label: t('rankedDuel'),
      }
    : {
        accent: '#4ade80',
        glow: '#22c55e',
        gradient: ['#4ade80', '#16a34a'] as const,
        icon: 'flash' as const,
        label: t('unrankedDuel'),
      };

  // Shared building blocks — composed differently per orientation below.
  const radarEl = (
    <View style={[styles.radar, { width: radarSize, height: radarSize }]}>
      <PulseRings accent={theme.accent} size={ringBase} />
      <View
        style={[
          styles.radarCore,
          {
            width: coreSize,
            height: coreSize,
            borderRadius: coreSize / 2,
            borderColor: theme.accent,
            shadowColor: theme.glow,
          },
        ]}
      >
        <Image
          source={require('../assets/loader.gif')}
          style={{ width: compassSize, height: compassSize }}
        />
      </View>
    </View>
  );

  const pillEl = (
    <LinearGradient
      colors={theme.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.modePill}
    >
      <Ionicons name={theme.icon} size={15} color="#1a1205" />
      <Text style={styles.modePillText}>{theme.label.toUpperCase()}</Text>
    </LinearGradient>
  );

  const titleEl = (
    <Text
      style={[styles.title, { fontSize: titleSize, textAlign: isLandscape ? 'left' : 'center' }]}
      numberOfLines={isLandscape ? 2 : 1}
      adjustsFontSizeToFit
    >
      {t('findingGame')}
    </Text>
  );

  const eloEl =
    isRanked && publicDuelRange ? (
      <View style={styles.eloChip}>
        <Ionicons name="podium-outline" size={15} color={theme.accent} />
        <Text style={styles.eloLabel}>{t('eloRange')}</Text>
        <Text style={[styles.eloValue, { color: theme.accent }]}>
          {publicDuelRange[0]} – {publicDuelRange[1]}
        </Text>
      </View>
    ) : null;

  const timerEl = (
    <View style={styles.timerRow}>
      <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.5)" />
      <Text style={styles.timerText}>{elapsedStr}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        fadeDuration={0}
      />
      <LinearGradient
        colors={['rgba(6, 16, 10, 0.72)', 'rgba(6, 16, 10, 0.86)', 'rgba(6, 16, 10, 0.96)']}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
        <BackButton onPress={handleCancel} />
        <WgWordmark size="sm" style={styles.wordmark} />
      </SafeAreaView>

      {isLandscape ? (
        <View
          style={[
            styles.center,
            styles.centerLandscape,
            { paddingHorizontal: spacing.xl + Math.max(insets.left, insets.right) },
          ]}
        >
          {radarEl}
          <View style={[styles.infoLandscape, { maxWidth: width * 0.46 }]}>
            {pillEl}
            {titleEl}
            {eloEl}
            {timerEl}
          </View>
        </View>
      ) : (
        <View style={styles.center}>
          {pillEl}
          <View style={styles.radarSpacer}>{radarEl}</View>
          <View style={styles.infoPortrait}>
            {titleEl}
            {eloEl}
            {timerEl}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingTop: spacing.sm,
  },
  wordmark: {
    marginTop: 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  centerLandscape: {
    flexDirection: 'row',
    gap: spacing['2xl'],
  },
  infoLandscape: {
    alignItems: 'flex-start',
    gap: spacing.md,
    flexShrink: 1,
  },
  infoPortrait: {
    alignItems: 'center',
    gap: spacing.md,
  },
  radarSpacer: {
    marginVertical: spacing['3xl'],
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
  },
  modePillText: {
    color: '#1a1205',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-Bold',
    letterSpacing: 1.5,
  },
  radar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarCore: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  title: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    flexShrink: 1,
  },
  eloChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  eloLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Medium',
  },
  eloValue: {
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Bold',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  timerText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Medium',
    fontVariant: ['tabular-nums'],
  },
});
