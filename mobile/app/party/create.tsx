/**
 * "Creating game" entry screen.
 *
 * Sends createPrivateGame once the socket is verified. It does NOT navigate to
 * the game — home.tsx is the single owner of "enter the multiplayer screen" and
 * pushes /game/multiplayer (which renders the lobby) as soon as `inGame` flips.
 * All lobby UI + leave logic now live in the unified screen (MultiplayerLobby).
 *
 * To make creation feel INSTANT, this screen renders a skeleton that mirrors the
 * MultiplayerLobby layout (header, game-code card, player list) with a shimmer
 * sweep instead of a generic centred spinner. When the lobby pushes on top, the
 * shapes line up so the swap reads as "the content just filled in".
 */

import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, t } from '../../src/shared';
import { spacing, fontSizes, borderRadius } from '../../src/styles/theme';
import { wsService } from '../../src/services/websocket';
import { useMultiplayerStore } from '../../src/store/multiplayerStore';

/** A single shimmering placeholder block. */
function SkeletonBlock({
  width,
  height,
  radius = borderRadius.md,
  style,
  shimmer,
}: {
  width: number | string;
  height: number;
  radius?: number;
  style?: object;
  shimmer: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { transform: [{ translateX: shimmer }] },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.18)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
    </View>
  );
}

export default function PartyCreateScreen() {
  const verified = useMultiplayerStore((s) => s.verified);
  const inGame = useMultiplayerStore((s) => s.inGame);
  const sentRef = useRef(false);

  // Looping shimmer sweep shared by every skeleton block.
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim]);

  const shimmerX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-260, 260],
  });

  useEffect(() => {
    if (verified && !sentRef.current && !inGame) {
      sentRef.current = true;
      wsService.send({ type: 'createPrivateGame' });
    }
  }, [verified, inGame]);

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        fadeDuration={0}
      />
      <View style={styles.darkOverlay} />
      <LinearGradient
        colors={[
          'rgba(20, 65, 25, 0.85)',
          'rgba(20, 65, 25, 0.6)',
          'rgba(0, 0, 0, 0.7)',
        ]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.flex} edges={['top', 'bottom', 'left', 'right']}>
        {/* Header mirrors the lobby so the swap is seamless. */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('yourPrivateGame')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.body}>
          {/* Game code card skeleton */}
          <View style={styles.codeSection}>
            <Text style={styles.codeLabel}>{t('gameCode')}</Text>
            <SkeletonBlock width={200} height={44} radius={borderRadius.lg} shimmer={shimmerX} style={{ marginTop: spacing.sm }} />
            <Text style={styles.creatingHint}>{t('creating')}</Text>
          </View>

          {/* Players section skeleton */}
          <View style={styles.section}>
            <SkeletonBlock width={120} height={18} shimmer={shimmerX} />
            <View style={styles.playerRow}>
              <SkeletonBlock width={40} height={40} radius={borderRadius.full} shimmer={shimmerX} />
              <SkeletonBlock width={140} height={16} shimmer={shimmerX} />
            </View>
            <View style={styles.playerRowFaded}>
              <SkeletonBlock width={40} height={40} radius={borderRadius.full} shimmer={shimmerX} />
              <SkeletonBlock width={100} height={16} shimmer={shimmerX} />
            </View>
          </View>
        </View>

        {/* Footer skeleton (settings preview + buttons) */}
        <View style={styles.footer}>
          <SkeletonBlock width="100%" height={34} shimmer={shimmerX} />
          <SkeletonBlock width="100%" height={48} radius={borderRadius.lg} shimmer={shimmerX} />
          <SkeletonBlock width="100%" height={48} radius={borderRadius.lg} shimmer={shimmerX} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1a0c' },
  darkOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: colors.white, fontSize: fontSizes.lg, fontFamily: 'Lexend-Bold' },
  body: { flex: 1, padding: spacing.lg, gap: spacing.xl },
  codeSection: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: spacing.xl,
  },
  codeLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  creatingHint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
    marginTop: spacing.md,
  },
  section: { gap: spacing.md },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  playerRowFaded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    opacity: 0.5,
  },
  footer: { padding: spacing.lg, gap: spacing.sm },
});
