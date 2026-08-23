import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import Reanimated, { FadeInDown, FadeOut, LinearTransition, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from './ui/SfxPressable';
import { t, USERNAME_MAX_LENGTH } from '../shared';
import { usernameSyncVerdict, checkUsernameAvailability, type Avail } from './auth/usernameCheck';
import { CARD, GOOD, BAD, MUTED, loginStyleDefs } from './auth/loginTheme';
import { useAuthStore } from '../store/authStore';
import { wsService } from '../services/websocket';

/**
 * The first username after a Google / Apple sign-in. (The email + code flow
 * collects its name BEFORE the account exists, so it never shows this.)
 * Forced: no close affordance, the backdrop does nothing.
 *
 * The SAME surface and the SAME live availability check as the username step
 * of AccountSelectSheet: the charcoal login world (auth/loginTheme.ts, web
 * parity with styles/login.css) and the verdicts in auth/usernameCheck.ts.
 * Two places a player names themselves, one look, one set of rules.
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
const NO_RM = ReduceMotion.Never;

export default function SetUsernameModal() {
  const { isAuthenticated, user, setUsername: setUsernameApi } = useAuthStore();
  const [username, setUsername] = useState('');
  const [avail, setAvail] = useState<Avail>('idle');
  const [err, setErr] = useState('');
  const [focused, setFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const visible = isAuthenticated && !user?.username;

  // Keep the overlay mounted through its exit animation. `mounted` lags `visible`
  // on the way out so the fade/slide-down can play before we unmount.
  const [mounted, setMounted] = useState(visible);
  // 0 = fully hidden/dismissed, 1 = fully presented. Drives both the backdrop
  // fade and the card's slide-up + scale.
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

  // Live availability, debounced. The sync rules answer at once; only names
  // that pass them cost a request (same wiring as the sign-in sheet's step 2).
  useEffect(() => {
    if (!visible) return undefined;
    const name = username;
    const sync = usernameSyncVerdict(name);
    if (sync) { setAvail(sync.avail); setErr(sync.key ? t(sync.key, sync.vars) : ''); return undefined; }
    setAvail('checking'); setErr('');
    let cancelled = false;
    const timer = setTimeout(async () => {
      const verdict = await checkUsernameAvailability(name);
      if (cancelled) return;
      setAvail(verdict.avail);
      setErr(verdict.key ? t(verdict.key, verdict.vars) : '');
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [visible, username]);

  // 'unknown' (the check could not answer) may continue: the server decides.
  const canSave = (avail === 'ok' || avail === 'unknown') && !isLoading;

  const handleSave = async () => {
    if (!canSave) return;

    setIsLoading(true);
    setErr('');

    const result = await setUsernameApi(username.trim());

    if (!result.success) {
      // api/setName.js answers with a sentence, not a locale key: shown as-is.
      setErr(result.error || t('errorNetworkRequest'));
      setIsLoading(false);
      return;
    }
    // setName is HTTP-only, but this socket verified BEFORE the name existed,
    // so the server-side Player is still unnamed — and its unnamed-guard
    // blocks every queue/join until a fresh verify. Web gets this for free
    // (setName reloads the page); mobile must force the reconnect itself.
    // handleReconnect re-reads the name from the DB on the way back in.
    wsService.connect(useAuthStore.getState().secret, true, { isReconnect: false });
    // On success, the store updates user.username which hides this modal.
    // We intentionally keep isLoading true so the spinner stays until unmount.
  };

  if (!mounted) return null;

  // Backdrop just fades. The card fades, slides up (30→0) and scales (0.94→1).
  const cardTranslateY = anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] });
  const cardScale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  return (
    <View style={styles.root} pointerEvents="auto">
      {/* Absolute-fill catcher so no touch leaks to the (frozen) UI beneath. */}
      <Pressable sfx="none" style={StyleSheet.absoluteFill} onPress={() => {}} />
      <Animated.View style={[styles.backdrop, { opacity: anim }]} pointerEvents="none" />
      {/* behavior="padding" on BOTH platforms: with edgeToEdgeEnabled the
          Android window never resizes for the keyboard (adjustResize is dead
          under edge-to-edge), so the old `undefined` meant NO avoidance at all
          — on shorter devices / taller keyboards the IME covered this centered
          card's input. 'padding' works from keyboard events, not window
          resize, so it holds everywhere. */}
      <KeyboardAvoidingView style={styles.overlay} behavior="padding" pointerEvents="box-none">
        <Animated.View
          style={{
            width: '100%',
            alignItems: 'center',
            opacity: anim,
            transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
          }}
        >
          <View style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.title}>{t('welcomeToWorldguessr')}</Text>
              <Text style={styles.subtitle}>{t('enterUsername')}</Text>
            </View>

            {err ? (
              <Reanimated.View
                entering={FadeInDown.duration(220).reduceMotion(NO_RM)}
                exiting={FadeOut.duration(160).reduceMotion(NO_RM)}
              >
                <Text style={styles.errorText}>{err}</Text>
              </Reanimated.View>
            ) : null}

            {/* Everything under the error line slides when it comes and goes. */}
            <Reanimated.View layout={LinearTransition.duration(240).reduceMotion(NO_RM)} style={styles.form}>
              <View style={styles.field}>
                <TextInput
                  style={[
                    styles.input,
                    focused && styles.inputFocused,
                    isLoading && styles.inputDisabled,
                    (avail === 'taken' || avail === 'invalid') && styles.inputError,
                  ]}
                  placeholder={t('enterUsernameBox')}
                  placeholderTextColor={MUTED}
                  value={username}
                  onChangeText={setUsername}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  maxLength={USERNAME_MAX_LENGTH}
                  editable={!isLoading}
                  onSubmitEditing={handleSave}
                  returnKeyType="done"
                  autoFocus
                  accessibilityLabel={t('enterUsernameBox')}
                />
                <View style={styles.avail} pointerEvents="none">
                  {avail === 'checking' && <ActivityIndicator size="small" color={MUTED} />}
                  {avail === 'ok' && (
                    <Reanimated.View entering={ZoomIn.duration(220).reduceMotion(NO_RM)}>
                      <Ionicons name="checkmark-circle" size={22} color={GOOD} />
                    </Reanimated.View>
                  )}
                  {(avail === 'taken' || avail === 'invalid') && (
                    <Ionicons name="close-circle" size={22} color={BAD} />
                  )}
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  !canSave && styles.primaryButtonDisabled,
                  pressed && canSave && styles.primaryButtonPressed,
                ]}
                onPress={handleSave}
                disabled={!canSave}
              >
                {isLoading ? (
                  <ActivityIndicator color="#052e16" />
                ) : (
                  <Text style={[styles.primaryText, !canSave && styles.primaryTextDisabled]}>{t('continue')}</Text>
                )}
              </Pressable>
            </Reanimated.View>
          </View>
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // The login world's card (web: the ui/Modal shell restyled by login.css).
  card: {
    width: '100%',
    maxWidth: 440,
    padding: 28,
    // Web parity: the 14px column rhythm of .wgLogin__step / .wgLogin--card.
    gap: 14,
    backgroundColor: CARD,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 16,
  },
  form: {
    gap: 12,
  },
  ...loginStyleDefs,
});
