import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Animated,
  Easing,
} from 'react-native';
import { Pressable } from './ui/SfxPressable';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, t, USERNAME_MAX_LENGTH } from '../shared';
import { useAuthStore } from '../store/authStore';

/**
 * A small ring spinner that mirrors the web modal's CSS border spinner
 * (16×16, 2px translucent ring with a solid-white top, rotating 1s linear
 * infinite). Rendered inside the Save button while a request is in flight.
 */
function ButtonSpinner() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]} />
  );
}

/**
 * Forces a newly-signed-in account with no username to choose one before they
 * can do ANYTHING else. Mounted globally at the root so it overlays every
 * screen (home, onboarding, game, etc). It cannot be dismissed — there is no
 * close affordance and tapping the backdrop does nothing — mirroring the web
 * modal (components/setUsernameModal.js).
 *
 * IMPORTANT: this is a plain in-tree absolute overlay, NOT a native `Modal`.
 * It used to be a `<Modal>`, but on first sign-in the sign-in sheet
 * (`AccountSelectSheet`, itself a native Modal) dismisses at the exact moment
 * this one tries to present. Two native modals transitioning in the same frame
 * leaves iOS/Android in a broken state: the username modal's touch-blocking
 * backdrop mounts (whole app frozen) but its content never presents — which is
 * only "fixed" by a hard restart. An absolute View can't collide with another
 * native modal, so it presents reliably every time.
 *
 * Visible whenever the user is authenticated but has no username. On a
 * successful save the auth store sets `user.username`, which flips this to
 * hidden automatically.
 */
export default function SetUsernameModal() {
  const { isAuthenticated, user, setUsername: setUsernameApi } = useAuthStore();
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const visible = isAuthenticated && !user?.username;

  // Keep the overlay mounted through its exit animation. `mounted` lags `visible`
  // on the way out so the fade/slide-down can play before we unmount.
  const [mounted, setMounted] = useState(visible);
  // 0 = fully hidden/dismissed, 1 = fully presented. Drives both the backdrop
  // fade and the card's slide-up + scale (mirrors web's slideInUp keyframe).
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(anim, {
        toValue: 1,
        damping: 18,
        stiffness: 220,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, anim]);

  const canSave = !!username.trim() && !isLoading;

  const handleSave = async () => {
    if (!canSave) return;

    setIsLoading(true);
    setError('');

    const result = await setUsernameApi(username.trim());

    if (!result.success) {
      setError(result.error || t('error', undefined, 'An error occurred'));
      setIsLoading(false);
    }
    // On success, the store updates user.username which hides this modal.
    // We intentionally keep isLoading true so the spinner stays until unmount.
  };

  if (!mounted) return null;

  // Backdrop just fades. The card fades, slides up (30→0) and scales (0.94→1) —
  // an RN take on web's slideInUp + the card's soft entrance.
  const backdropOpacity = anim;
  const cardOpacity = anim;
  const cardTranslateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0],
  });
  const cardScale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });

  return (
    <View style={styles.root} pointerEvents="auto">
      {/* Absolute-fill catcher so no touch leaks to the (frozen) UI beneath. */}
      <Pressable sfx="none" style={StyleSheet.absoluteFill} onPress={() => {}} />
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="none"
      />
      {/* behavior="padding" on BOTH platforms: with edgeToEdgeEnabled the
          Android window never resizes for the keyboard (adjustResize is dead
          under edge-to-edge), so the old `undefined` meant NO avoidance at all
          — on shorter devices / taller keyboards the IME covered this centered
          card's input. 'padding' works from keyboard events, not window
          resize, so it holds everywhere. */}
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior="padding"
        pointerEvents="box-none"
      >
        <Animated.View
          style={{
            width: '100%',
            alignItems: 'center',
            opacity: cardOpacity,
            transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
          }}
        >
        <LinearGradient
          colors={[
            'rgb(26, 71, 31)',
            'rgb(20, 55, 24)',
            'rgb(17, 43, 24)',
          ]}
          locations={[0, 0.57, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Text style={styles.title}>{t('welcomeToWorldguessr')}</Text>
          <Text style={styles.subtitle}>{t('enterUsername')}</Text>

          <View style={styles.form}>
            <TextInput
              style={[styles.input, isLoading && styles.inputDisabled]}
              placeholder={t('enterUsernameBox')}
              placeholderTextColor="#999"
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                setError('');
              }}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={USERNAME_MAX_LENGTH}
              editable={!isLoading}
              onSubmitEditing={handleSave}
              returnKeyType="done"
            />

            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                !canSave && styles.saveButtonDisabled,
                pressed && canSave && styles.saveButtonPressed,
              ]}
              onPress={handleSave}
              disabled={!canSave}
            >
              {isLoading ? (
                <ButtonSpinner />
              ) : (
                <Text style={styles.saveButtonText}>{t('letsGo')}</Text>
              )}
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </LinearGradient>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-screen in-tree overlay. Mounted last at the app root, with a very high
  // zIndex/elevation so it paints above every sibling (tabs, sheets, banners).
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20000,
    elevation: 20000,
  },
  // Web: overlay rgba(0,0,0,0.8) + blur. RN has no cheap blur here, so a slightly
  // darker scrim approximates the blurred dim. Animated separately so it can fade.
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // .join-party-card
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    padding: 36,
    width: '100%',
    maxWidth: 480,
    minWidth: 320,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 12,
  },
  // .join-party-title
  title: {
    color: colors.white,
    fontSize: 28,
    fontFamily: 'Lexend-SemiBold',
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    fontFamily: 'Lexend',
    marginBottom: 25,
    textAlign: 'center',
    lineHeight: 22,
  },
  // .join-party-form
  form: {
    width: '100%',
    gap: 16,
  },
  // .join-party-input
  input: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 18,
    fontFamily: 'Lexend-SemiBold',
    color: '#333',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 2,
    borderColor: colors.primaryDark,
    borderRadius: 12,
    textAlign: 'center',
    letterSpacing: 2,
  },
  inputDisabled: {
    opacity: 0.7,
  },
  // .join-party-button
  saveButton: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 24,
    minHeight: 56,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.primaryDark,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 18,
    fontFamily: 'Lexend-SemiBold',
  },
  // Ring spinner (matches web's 16×16 border spinner)
  spinner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderTopColor: colors.white,
  },
  // .join-party-error
  errorContainer: {
    marginTop: 16,
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 71, 87, 0.3)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '100%',
  },
  errorText: {
    color: '#ff4757',
    fontSize: 15,
    fontFamily: 'Lexend-Medium',
    textAlign: 'center',
  },
});
