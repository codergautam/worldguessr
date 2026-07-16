/**
 * App-wide render error boundary — the mobile counterpart of web's
 * components/ErrorBoundary.js. A class component is the only way to intercept a
 * render/commit-phase throw in React; without it any screen that throws unwinds
 * past the root and white-screens the whole app with no recovery.
 *
 * Mirrors web's interception pattern (getDerivedStateFromError +
 * componentDidCatch), the non-fatal logging (console.error + an analytics
 * event, both try/catch'd so the handler itself NEVER throws), and a branded
 * fallback offering reset ("Try Again") and a home escape hatch ("Go Home").
 * Unlike web (which has no global root boundary) this is intentionally global —
 * a single crash shouldn't kill the whole native app.
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './ui/SfxPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useReducedMotion,
} from 'react-native-reanimated';
import { colors, t } from '../shared';
import { borderRadius, fontSizes, spacing } from '../styles/theme';
import WgWordmark from './ui/WgWordmark';
import { dismissAllSafe } from '../utils/navigation';
import { logEvent } from '../services/analytics';

const STREET2 = require('../../assets/street2.jpg');

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The handler must NEVER throw (web parity, ErrorBoundary.js): a throw here
    // would escape the boundary and crash for real. Both sinks are try/catch'd.
    try {
      console.error('[GlobalErrorBoundary] render error', error, info?.componentStack);
    } catch {}
    try {
      // Mobile equivalent of web's errorTracking→GA non-fatal exception.
      // logEvent is fire-and-forget and firebaseReady-guarded.
      logEvent('app_render_error', {
        message: String(error?.message).slice(0, 200),
        stack: (info?.componentStack || '').slice(0, 500),
      });
    } catch {}
  }

  reset = () => this.setState({ error: null });

  goHome = () => {
    // Reset FIRST so the <Stack> remounts, THEN navigate on the next frame.
    // Dispatching a navigation while the navigator is unmounted throws
    // "The action ... was not handled by any navigator" (see utils/navigation.ts),
    // so we defer to rAF and route through dismissAllSafe() (no-ops when there's
    // nothing to dismiss). Wrapped in try/catch so it can never crash.
    this.reset();
    requestAnimationFrame(() => {
      try {
        dismissAllSafe();
        router.replace('/(tabs)/home');
      } catch {}
    });
  };

  render() {
    if (this.state.error) {
      return <ErrorFallback onReset={this.reset} onGoHome={this.goHome} />;
    }
    return this.props.children;
  }
}

interface FallbackProps {
  onReset: () => void;
  onGoHome: () => void;
}

function ErrorFallback({ onReset, onGoHome }: FallbackProps) {
  // A crash screen must never feel jittery — gate every entrance on Reduce Motion
  // (→ undefined entering = instant), exactly like ReloadButton/ToastProvider.
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      style={styles.overlay}
      entering={reduceMotion ? undefined : FadeIn.duration(240)}
    >
      <ImageBackground
        source={STREET2}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        fadeDuration={0}
      />
      <View style={styles.dim} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View
          style={styles.card}
          entering={
            reduceMotion
              ? undefined
              : FadeInDown.duration(280).easing(Easing.out(Easing.cubic))
          }
        >
          <WgWordmark />
          <Ionicons name="warning" size={42} color={colors.error} style={styles.icon} />
          <Text style={styles.title}>{t('unexpectedErrorOccurred')}</Text>
          <Text style={styles.body}>{t('errorBoundaryMessage')}</Text>
          <Pressable
            onPress={onReset}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
            ]}
          >
            <Text style={styles.primaryText}>{t('errorBoundaryRetry')}</Text>
          </Pressable>
          <Pressable
            onPress={onGoHome}
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
            ]}
          >
            <Text style={styles.secondaryText}>{t('goHome')}</Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5000,
    backgroundColor: colors.background,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  safe: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    alignItems: 'center',
    gap: spacing.md,
    maxWidth: 420,
    width: '100%',
  },
  icon: {
    marginTop: spacing.sm,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.xl,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
  },
  body: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  primaryText: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-SemiBold',
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.md,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  secondaryText: {
    color: colors.white,
    fontFamily: 'Lexend-Medium',
    fontSize: fontSizes.md,
  },
});
