import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, t } from '../../shared';
import { useGoogleSignIn } from '../../hooks/useGoogleSignIn';
import { useAuthStore } from '../../store/authStore';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';

interface AccountSelectSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Contextual copy for gated-mode upsells (e.g. "Sign in to play Ranked");
   * defaults to the generic sign-in headline. */
  title?: string;
  subtitle?: string;
}

export default function AccountSelectSheet({ visible, onClose, title, subtitle }: AccountSelectSheetProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { signIn: googleSignIn, isReady: googleReady } = useGoogleSignIn();
  const loginWithApple = useAuthStore((s) => s.loginWithApple);
  const authLoading = useAuthStore((s) => s.isLoading);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [providerLoading, setProviderLoading] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useState(() => new Animated.Value(0))[0];
  const sheetTranslateY = useState(() => new Animated.Value(280))[0];

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  useEffect(() => {
    if (visible) setError('');
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          damping: 24,
          stiffness: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 280,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible, mounted, backdropOpacity, sheetTranslateY]);

  const handleGoogle = async () => {
    if (!googleReady || providerLoading || authLoading) return;
    setProviderLoading('google');
    setError('');
    // Keep the sheet open through the whole flow so a failure has somewhere to
    // show — only close once we're actually signed in.
    const res = await googleSignIn();
    if (res.ok) {
      onClose();
    } else if (res.error) {
      setError(res.error);
    }
    // res.cancelled — the user backed out; not an error, show nothing.
    setProviderLoading(null);
  };

  const handleApple = async () => {
    if (!appleAvailable || providerLoading || authLoading) return;
    setProviderLoading('apple');
    setError('');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      if (!credential.identityToken) {
        setError(t('appleNoSignInToken', undefined, 'Apple did not return a sign in token.'));
        return;
      }

      const res = await loginWithApple(credential.identityToken);
      if (res.success) {
        onClose();
      } else {
        setError(res.error || t('appleSignInFailed', undefined, 'Apple sign in failed. Please try again.'));
      }
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        console.error('Apple login error:', e);
        setError(t('appleSignInFailed', undefined, 'Apple sign in failed. Please try again.'));
      }
    } finally {
      setProviderLoading(null);
    }
  };

  const busy = authLoading || providerLoading !== null;
  const isLandscape = width > height;
  const landscapeSheetWidth = Math.min(width * 0.58, 420);
  const landscapeSheetLeft = (width - landscapeSheetWidth) / 2;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable sfx="none" style={StyleSheet.absoluteFillObject} onPress={busy ? undefined : onClose} />
      </Animated.View>
      <Animated.View style={[
        styles.sheet,
        isLandscape && styles.sheetLandscape,
        {
          paddingBottom: Math.max(insets.bottom, isLandscape ? spacing.md : spacing.lg),
          maxHeight: height - Math.max(insets.top, spacing.sm),
          ...(isLandscape ? { left: landscapeSheetLeft, right: undefined, width: landscapeSheetWidth } : null),
          transform: [{ translateY: sheetTranslateY }],
        },
      ]}>
        <Pressable
          sfx="none"
          style={styles.handleHitArea}
          onPress={busy ? undefined : onClose}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('closeSignInOptions')}
        >
          <View style={styles.handle} />
        </Pressable>
        <Text style={styles.title}>{title ?? t('signIn')}</Text>
        <Text style={styles.subtitle} numberOfLines={2} adjustsFontSizeToFit>
          {subtitle ?? t('signInSubtitle', undefined, 'Track your progress and compete with friends!')}
        </Text>

        {Platform.OS === 'ios' && appleAvailable && (
          <Pressable
            style={({ pressed }) => [
              styles.providerButton,
              styles.appleButton,
              pressed && !busy && styles.providerButtonPressed,
              busy && providerLoading !== 'apple' && styles.providerButtonDisabled,
            ]}
            onPress={handleApple}
            disabled={busy}
          >
            {providerLoading === 'apple' ? (
              <ActivityIndicator color="#111" />
            ) : (
              <>
                <Ionicons name="logo-apple" size={22} color="#111" style={styles.appleIcon} />
                <Text style={[styles.providerText, styles.appleText]}>{t('continueWithApple', undefined, 'Continue with Apple')}</Text>
              </>
            )}
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.providerButton,
            styles.googleButton,
            pressed && !busy && styles.providerButtonPressed,
            (!googleReady || busy) && providerLoading !== 'google' && styles.providerButtonDisabled,
          ]}
          onPress={handleGoogle}
          disabled={!googleReady || busy}
        >
          {providerLoading === 'google' ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color={colors.white} />
              <Text style={styles.providerText}>{t('continueWithGoogle', undefined, 'Continue with Google')}</Text>
            </>
          )}
        </Pressable>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: '#17331f',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: spacing.md,
  },
  sheetLandscape: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  handleHitArea: {
    alignSelf: 'center',
    width: 52,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  title: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.xl,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: 'Lexend',
    fontSize: fontSizes.sm,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  providerButton: {
    height: 54,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  appleIcon: {
    marginTop: -2,
  },
  providerButtonPressed: {
    opacity: 0.85,
  },
  providerButtonDisabled: {
    opacity: 0.55,
  },
  appleButton: {
    backgroundColor: colors.white,
  },
  googleButton: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primaryDark,
  },
  providerText: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.md,
  },
  appleText: {
    color: '#111',
  },
  errorText: {
    color: colors.error,
    fontFamily: 'Lexend-Medium',
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
});
