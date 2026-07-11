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
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, t } from '../../src/shared';
import { spacing, fontSizes, borderRadius } from '../../src/styles/theme';
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
  // Insets via the hook (correct on first paint) instead of the native
  // <SafeAreaView> component, whose padding lands a frame late and — under the
  // 'fade' transition — flashes the header up under the status bar before
  // snapping down. Must match MultiplayerLobby so the skeleton→lobby swap is
  // seamless.
  const insets = useSafeAreaInsets();
  // Mirror MultiplayerLobby's landscape two-column split so the skeleton→lobby
  // swap stays aligned in both orientations.
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const verified = useMultiplayerStore((s) => s.verified);
  const inGame = useMultiplayerStore((s) => s.inGame);
  // `mode=2v2` → create a 2v2 staging lobby instead of a party (home's 2v2
  // entry reuses this route for its instant skeleton shell).
  const { mode } = useLocalSearchParams<{ mode?: string }>();
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
      // Store action (one create path for party AND 2v2 staging lobbies) —
      // it stamps lobbyIntent alongside the send. `mode=2v2` rides the route
      // params from home's 2v2 entry; everything else on this screen (the
      // skeleton shell) is shared as-is.
      useMultiplayerStore.getState().createPrivateGame(mode === '2v2' ? '2v2' : 'party');
    }
  }, [verified, inGame, mode]);

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

      <View
        style={[
          styles.flex,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        {/* Header mirrors the lobby so the swap is seamless. */}
        <View style={[styles.header, isLandscape && styles.headerLandscape]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('yourPrivateGame')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={[styles.bodyWrap, isLandscape && styles.bodyWrapLandscape]}>
          <View style={[styles.body, isLandscape && styles.bodyLandscape]}>
            {/* Game code card skeleton */}
            <View style={[styles.codeSection, isLandscape && styles.codeSectionLandscape]}>
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
          <View
            style={[
              styles.footer,
              isLandscape && styles.footerLandscape,
              isLandscape && { width: Math.min(320, Math.max(260, width * 0.4)) },
            ]}
          >
            <SkeletonBlock width="100%" height={34} shimmer={shimmerX} />
            <SkeletonBlock width="100%" height={48} radius={borderRadius.lg} shimmer={shimmerX} />
            <SkeletonBlock width="100%" height={48} radius={borderRadius.lg} shimmer={shimmerX} />
          </View>
        </View>
      </View>
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
  headerLandscape: { paddingVertical: spacing.xs },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: colors.white, fontSize: fontSizes.lg, fontFamily: 'Lexend-Bold' },
  // Wraps body + footer: column in portrait, row in landscape (footer → sidebar).
  bodyWrap: { flex: 1 },
  bodyWrapLandscape: { flexDirection: 'row' },
  body: { flex: 1, padding: spacing.lg, gap: spacing.xl },
  bodyLandscape: { gap: spacing.md },
  codeSection: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: spacing.xl,
  },
  codeSectionLandscape: { padding: spacing.md },
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
  footerLandscape: {
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255, 255, 255, 0.1)',
  },
});
