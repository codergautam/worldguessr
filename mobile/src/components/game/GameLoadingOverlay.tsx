import { Animated, Image, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, t } from '../../shared';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';
import WgWordmark from '../ui/WgWordmark';
import MatchCountdown from '../ui/MatchCountdown';

/**
 * The single loading/error layer used everywhere a game-y screen needs
 * a "panorama isn't ready yet" cover (per-round loads in GameSurface,
 * the initial location fetch in country guesser, the singleplayer
 * cover in game/[id]). Same visuals: street2 background, dimmer,
 * loader.gif spinner, big "Loading…" text.
 *
 * Pass an `Animated.Value` for `opacity` when the parent drives a fade
 * (e.g. GameSurface's manual round-transition cover). Otherwise leave
 * it at 1 and toggle the parent's mount.
 */
interface Props {
  /** Drive the fade externally — defaults to fully opaque. */
  opacity?: Animated.Value | number;
  /** Caller decides if the overlay should swallow taps. */
  interactive?: boolean;
  message?: string;
  /** When set, render the branded match-start ring countdown instead of the
   *  spinner row (casual multiplayer round 1). Fractional seconds remaining. */
  countdown?: number | null;
  /** When set, the spinner is replaced with an error block + retry. */
  error?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
}

const STREET2 = require('../../../assets/street2.jpg');
const LOADER = require('../../../assets/loader.gif');

export default function GameLoadingOverlay({
  opacity = 1,
  interactive = true,
  message = t('loading'),
  countdown,
  error,
  onRetry,
  retryLabel = t('back'),
}: Props) {
  const showCountdown = countdown != null && !error;
  return (
    <Animated.View
      style={[styles.overlay, { opacity }]}
      pointerEvents={interactive ? 'auto' : 'none'}
    >
      <ImageBackground source={STREET2} style={StyleSheet.absoluteFillObject} resizeMode="cover" fadeDuration={0} />
      <View style={styles.dim} />
      {showCountdown && (
        <SafeAreaView style={styles.brandBar} edges={['top']} pointerEvents="none">
          <WgWordmark size="sm" />
        </SafeAreaView>
      )}
      <View style={styles.center}>
        {showCountdown ? (
          <MatchCountdown
            seconds={countdown as number}
            label={t('getReady', undefined, 'Get Ready!')}
          />
        ) : error ? (
          <>
            <Ionicons name="warning" size={42} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            {onRetry && (
              <Pressable
                onPress={onRetry}
                style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.retryText}>{retryLabel}</Text>
              </Pressable>
            )}
          </>
        ) : (
          <View style={styles.loadingRow}>
            <Image source={LOADER} style={styles.spinner} />
            <Text style={styles.loadingText}>{message}</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    backgroundColor: colors.background,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  brandBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingLeft: spacing.xl,
    paddingTop: spacing.sm,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  spinner: {
    width: 80,
    height: 80,
  },
  loadingText: {
    color: colors.white,
    fontSize: 28,
    fontFamily: 'Lexend-SemiBold',
  },
  errorText: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  retryText: {
    color: colors.white,
    fontFamily: 'Lexend-Medium',
  },
});
