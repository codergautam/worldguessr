import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Reanimated, {
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  FadeOutLeft,
  FadeOutRight,
  Easing,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  ZoomIn,
  useReducedMotion,
  withDelay as rnWithDelay,
  withRepeat,
  withSequence as rnWithSequence,
  withTiming as rnWithTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Pressable } from '../ui/SfxPressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../shared';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '../../shared/utils/username';
import { useGoogleSignIn } from '../../hooks/useGoogleSignIn';
import { useAuthStore } from '../../store/authStore';
import { api, ApiError, newLoginSessionId } from '../../services/api';
import { haptics } from '../../services/haptics';
import { spacing } from '../../styles/theme';
import { withTiming } from '../daily/anims';
import { usernameSyncVerdict, checkUsernameAvailability, LEN, type Avail } from './usernameCheck';
import {
  CARD, INK, INK_SOFT, MUTED, FIELD, FIELD_FOCUS, LINE, RULE, BTN, BTN_INK, GOOD, BAD,
  loginStyleDefs,
} from './loginTheme';
import CodeInput, { type CodeInputState } from './CodeInput';

/**
 * THE SIGN-IN SHEET (web parity: components/auth/LoginModal.js + login.css).
 * Email first, then (new accounts only) a username, then the 6-digit code;
 * Apple (iOS) and Google stay as secondary buttons under the email field.
 * Same steps, same copy keys, same server endpoints as web.
 *
 * Its own world, shared with web (styles/login.css): a charcoal sheet with a
 * whisper of green over the dimmed game, dark fields, white type, ONE mint
 * chunky button with a 4px bottom edge that presses down, outlined dark
 * provider buttons with the colored Google mark, green only for "go" and
 * "correct", red only for refusals.
 *
 * Everything happens INSIDE this one native Modal. Never present a second
 * native Modal from here: two native modals transitioning in the same frame
 * freeze iOS/Android (documented in SetUsernameModal.tsx).
 */

interface AccountSelectSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Contextual copy for gated-mode upsells (e.g. "Sign in to play Ranked");
   * defaults to the generic sign-in headline. Step 1 only. */
  title?: string;
  subtitle?: string;
}

type Step = 'email' | 'username' | 'code';

const CODE_LENGTH = 6;
const EMAIL_SYNTAX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NO_RM = ReduceMotion.Never;

// Locale KEY from a failed email-login request (the server speaks in keys).
function keyOf(e: unknown): string {
  if (e instanceof ApiError && typeof e.body?.error === 'string') return e.body.error;
  return '';
}

// Display text for any failure: a known key translates; a raw server sentence
// (e.g. a ban notice) passes through; a network error is already localized.
function textOf(e: unknown, fallbackKey: string): string {
  const key = keyOf(e);
  if (key) return t(key);
  const msg = (e as any)?.message;
  return typeof msg === 'string' && msg ? msg : t(fallbackKey);
}

// The four-colour Google "G" (brand guideline mark).
function GoogleMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

// Sending state: three bouncing dots in the button's ink. A loop, so the raw
// reanimated primitives are used on purpose (they honour the OS Reduce Motion
// setting; see daily/anims.ts).
function BusyDot({ color, delay }: { color: string; delay: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = rnWithDelay(
      delay,
      withRepeat(
        rnWithSequence(
          rnWithTiming(-7, { duration: 300, easing: Easing.out(Easing.quad) }),
          rnWithTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }),
          rnWithTiming(0, { duration: 300 }),
        ),
        -1,
        false,
      ),
    );
  }, [y, delay]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scale: 1 + Math.abs(y.value) / 60 }],
    opacity: 0.55 + Math.abs(y.value) / 16,
  }));
  return <Reanimated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

function BusyDots({ color }: { color: string }) {
  return (
    <View style={styles.dots} accessibilityLabel="Sending">
      <BusyDot color={color} delay={0} />
      <BusyDot color={color} delay={120} />
      <BusyDot color={color} delay={240} />
    </View>
  );
}

export default function AccountSelectSheet({ visible, onClose, title, subtitle }: AccountSelectSheetProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { signIn: googleSignIn, isReady: googleReady } = useGoogleSignIn();
  const loginWithApple = useAuthStore((s) => s.loginWithApple);
  const loginWithEmailCode = useAuthStore((s) => s.loginWithEmailCode);
  const authLoading = useAuthStore((s) => s.isLoading);

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [providerLoading, setProviderLoading] = useState<'apple' | 'google' | null>(null);
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useState(() => new Animated.Value(0))[0];
  // Starts a full screen below; the open effect re-seeds it with the sheet's
  // real measured height once one is known (see sheetHRef).
  const sheetTranslateY = useState(() => new Animated.Value(height))[0];

  // The three-step flow (state names mirror web's LoginModal).
  const [step, setStep] = useState<Step>('email');
  const [dir, setDir] = useState<1 | -1>(1);
  const [email, setEmail] = useState('');
  const [loginId, setLoginId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [username, setUsername] = useState('');
  const [avail, setAvail] = useState<Avail>('idle');
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<CodeInputState>('idle');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [, setTick] = useState(0);
  const [focusedField, setFocusedField] = useState<'email' | 'username' | null>(null);
  const codeRef = useRef(''); // survives the username bounce
  // Pending wrong-code reset. Now that the keyboard stays up through the
  // verdict (CodeInput), the user can start retyping BEFORE the delayed clear
  // fires — typing must cancel it, or their fresh digits get wiped mid-entry.
  const codeResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientIdRef = useRef(''); // this open's session nonce (newLoginSessionId)
  // Set when the server bounced us back to the username step with its verdict
  // on the name: the availability effect skips ONE run so that verdict (and
  // its sentence) stand until the player edits the name.
  const bounceRef = useRef(false);

  // The sheet glides between heights (step swaps, error lines coming and
  // going) instead of jumping: the scroll content is measured and the sheet
  // body gets an explicit, animated height. The first measure of an open
  // lands without animation; later ones ease over 240 ms.
  const bodyH = useSharedValue(0);
  const firstMeasure = useRef(true);

  // SMOOTH keyboard-follow, third attempt (Aug 23). The history matters:
  //  1. KeyboardAvoidingView re-laid the sheet out in steps — janky.
  //  2. useAnimatedKeyboard streamed the height frame-by-frame — smooth for
  //     the first stretch, then the stream DIED and the value JUMPED to the
  //     final height (user: "gives up and decides to just snap"). Cause:
  //     this sheet lives inside a native Modal, and useAnimatedKeyboard
  //     tracks the keyboard window's layer from the app's MAIN window; a
  //     Modal hosts its own window, so the tracker loses the animation
  //     partway and lands the shared value in one hop. Known reanimated
  //     limitation, no config fixes it.
  //  3. THIS: drive the height with our own tween off the OS keyboard
  //     NOTIFICATIONS, which are app-wide and window-agnostic — they cannot
  //     die mid-animation. iOS keyboardWillChangeFrame fires for show, hide
  //     AND QuickType-bar toggles, each carrying the system's own duration,
  //     so the tween spans the exact window the real keyboard animates in.
  //     Android has no will-events or durations (and edge-to-edge already
  //     killed window resizing), so it tweens a fixed 200ms from the did-
  //     events — arrives a beat behind the IME, but smooth, which beats
  //     tracking that snaps.
  //
  // The HEIGHT CAP reads the same shared value inside bodyStyle below, so
  // lift and shrink still run as ONE curve. `withTiming` is the daily/anims
  // wrapper (ReduceMotion.Never): the lift is positional, not decorative —
  // with reduce-motion honoured the sheet would sit UNDER the keyboard.
  const kbHeight = useSharedValue(0);
  useEffect(() => {
    // Gated: this component stays mounted at four call sites with the Modal
    // closed, and ungated listeners would run four hidden tweens on every
    // keyboard in the app (chat, search, anywhere).
    if (!mounted) return;
    const KB_EASE = Easing.out(Easing.cubic); // house curve; visually matches the iOS keyboard settle
    const subs = Platform.OS === 'ios'
      ? [
          Keyboard.addListener('keyboardWillChangeFrame', (e) => {
            // Height derived from where the keyboard's top edge ENDS UP —
            // one formula covers show (screenY < window height), hide
            // (screenY = window height → 0) and QuickType growth/shrink.
            const end = Math.max(0, height - e.endCoordinates.screenY);
            kbHeight.value = withTiming(end, {
              duration: e.duration && e.duration > 0 ? e.duration : 250,
              easing: KB_EASE,
            });
          }),
        ]
      : [
          Keyboard.addListener('keyboardDidShow', (e) => {
            kbHeight.value = withTiming(e.endCoordinates.height, { duration: 200, easing: KB_EASE });
          }),
          Keyboard.addListener('keyboardDidHide', () => {
            kbHeight.value = withTiming(0, { duration: 200, easing: KB_EASE });
          }),
        ];
    return () => subs.forEach((sub) => sub.remove());
  }, [mounted, kbHeight, height]);
  const keyboardLiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -kbHeight.value }],
  }));
  // Screen-height cap with NO keyboard; the keyboard's share is subtracted
  // per-frame in bodyStyle.
  const sheetCapNoKb = height - Math.max(insets.top, spacing.sm);
  // The sheet's last measured height, for the slide-in/out travel distance —
  // the slide must cover the WHOLE sheet, not a hardcoded guess.
  const sheetHRef = useRef(0);
  // Cap applied IN the worklet from the live keyboard height, so the shrink
  // rides the exact frame of the lift. Regrow on dismiss is automatic: bodyH
  // keeps the content height and the min() releases with the keyboard. The
  // 180 floor keeps a landscape sheet from collapsing to nothing.
  const bodyStyle = useAnimatedStyle(() => {
    if (bodyH.value <= 0) return {};
    const cap = sheetCapNoKb - kbHeight.value;
    return { height: Math.min(bodyH.value, Math.max(cap, 180)) };
  });

  // The Continue button breathes while a code is being sent (and stays bright,
  // not grayed: the press is being honoured, not refused).
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = busy
      ? withRepeat(rnWithSequence(rnWithTiming(1.02, { duration: 550 }), rnWithTiming(1, { duration: 550 })), -1, false)
      : rnWithTiming(1, { duration: 150 });
  }, [busy, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  // Fresh flow on every open.
  useEffect(() => {
    if (!visible) return;
    setStep('email'); setDir(1);
    setEmail(''); setLoginId(null); setIsNew(false);
    setUsername(''); setAvail('idle');
    setCode(''); setCodeState('idle'); setShake(0);
    setBusy(false); setErr(''); setResendAt(0);
    setProviderLoading(null); setFocusedField(null);
    codeRef.current = '';
    bounceRef.current = false;
    clientIdRef.current = newLoginSessionId();
    firstMeasure.current = true;
    bodyH.value = 0;
    // A close mid-keyboard can strand the lift at the last tweened height
    // (the gate above removes the listeners before the hide event lands);
    // a fresh open must start grounded.
    kbHeight.value = 0;
  }, [visible, bodyH, kbHeight]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Start fully below the screen edge: the sheet's real height when known
      // (re-opens), else the whole screen (first open, pre-measure). The old
      // fixed 320 start meant a tall sheet's top was already visible on
      // frame one.
      sheetTranslateY.setValue((sheetHRef.current || height) + 24);
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
          // The FULL measured height plus shadow slack. The old fixed 320
          // left a tall sheet's top ~100px on screen when the animation
          // "finished", so the Modal unmount flash-killed the remainder
          // mid-slide.
          toValue: (sheetHRef.current || height) + 24,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible, mounted, backdropOpacity, sheetTranslateY]);

  // Resend countdown: one tick per second while it matters.
  useEffect(() => {
    if (!visible || step !== 'code' || resendAt <= Date.now()) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [visible, step, resendAt]);

  // Live availability, debounced. The sync rules answer instantly; only names
  // that pass them cost a request.
  useEffect(() => {
    if (!visible || step !== 'username') return undefined;
    if (bounceRef.current) {
      // Back from the code step with the server's verdict on this exact
      // name (taken / invalid + sentence): keep it until the name changes.
      bounceRef.current = false;
      return undefined;
    }
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
  }, [visible, step, username]);

  const go = (next: Step, direction: 1 | -1 = 1) => {
    setDir(direction);
    setStep(next);
    setErr('');
    setFocusedField(null);
  };

  const sendCode = async (em: string) => {
    try {
      const data = await api.emailLoginStart(em, clientIdRef.current);
      setLoginId(data.loginId);
      setResendAt(Date.now() + (data.resendAfter || 30) * 1000);
      setCode(''); setCodeState('idle');
      return data;
    } catch (e) {
      setErr(textOf(e, 'emailSendFailed'));
      const retryAfter = e instanceof ApiError && e.status === 429 ? Number(e.body?.retryAfter) : 0;
      if (retryAfter > 0) setResendAt(Date.now() + retryAfter * 1000);
      return null;
    }
  };

  const submitEmail = async () => {
    if (busy) return;
    const em = email.trim().toLowerCase();
    if (!EMAIL_SYNTAX.test(em)) { setErr(t('invalidEmail')); return; }
    haptics.light();
    setBusy(true); setErr('');
    const data = await sendCode(em);
    setBusy(false);
    if (!data) return;
    setEmail(em);
    setIsNew(!data.exists);
    go(data.exists ? 'code' : 'username');
  };

  const submitCode = async (c: string) => {
    if (busy || !loginId || c.length !== CODE_LENGTH) return;
    setBusy(true); setErr(''); setCodeState('busy');
    const res = await loginWithEmailCode(loginId, c, isNew ? username : undefined, clientIdRef.current);
    if (res.success) {
      // The focal moment: green lands, then the sheet leaves. Home's corner
      // animates the Login pill into the PlayerCard off the store flip.
      setCodeState('ok');
      haptics.success();
      setTimeout(() => onClose(), 450);
      return;
    }
    setBusy(false);
    const key = res.errorKey || '';
    if (key === 'wrongCode') {
      setCodeState('error'); setShake((n) => n + 1); haptics.error();
      setErr(t('wrongCode'));
      // Outlasts the ~450ms shake: red holds through the whole motion, THEN
      // the row clears for the retype (keyboard stayed up — see CodeInput).
      codeResetTimer.current = setTimeout(() => {
        codeResetTimer.current = null;
        setCode(''); setCodeState('idle');
      }, 500);
      return;
    }
    if (key === 'codeExpired' || key === 'codeUsed') {
      setCodeState('error'); setErr(t(key)); setResendAt(0); setCode('');
      return;
    }
    if (key.startsWith('username')) {
      // The code is still live (the server refused before consuming it): keep
      // it, fix the name, and it resubmits on the way back.
      codeRef.current = c;
      setCode(''); setCodeState('idle');
      bounceRef.current = true;
      setAvail(key === 'usernameTaken' ? 'taken' : 'invalid');
      go('username', -1);
      setErr(t(key, LEN)); // AFTER go(): go() clears err, and this sentence must win the batch
      return;
    }
    // Anything else (network, server error, a refusal sentence): say it and
    // clear the digits so a fresh entry resubmits.
    setCodeState('idle'); setCode('');
    setErr(key ? t(key) : (res.error || t('errorNetworkRequest')));
  };

  const submitUsername = () => {
    if (busy) return;
    // 'unknown' (the check could not answer) may continue: the server decides.
    if (avail !== 'ok' && avail !== 'unknown') {
      // Done on a name that is still too short: now the rule is worth saying.
      if (username.length > 0 && username.length < USERNAME_MIN_LENGTH) setErr(t('usernameLengthError', LEN));
      return;
    }
    haptics.light();
    const remembered = codeRef.current;
    codeRef.current = '';
    go('code');
    if (remembered.length === CODE_LENGTH) {
      setCode(remembered);
      setTimeout(() => submitCode(remembered), 0);
    }
  };

  const resend = async () => {
    if (busy || Date.now() < resendAt) return;
    setBusy(true); setErr('');
    await sendCode(email);
    setBusy(false);
  };

  const useDifferentEmail = () => {
    setDir(-1);
    setStep('email');
    setEmail(''); setLoginId(null); setIsNew(false);
    setUsername(''); setAvail('idle');
    setCode(''); setCodeState('idle');
    setErr(''); setResendAt(0); setFocusedField(null);
    codeRef.current = '';
  };

  const handleGoogle = async () => {
    if (!googleReady || providerLoading || authLoading || busy) return;
    setProviderLoading('google');
    setErr('');
    // Keep the sheet open through the whole flow so a failure has somewhere to
    // show — only close once we're actually signed in.
    const res = await googleSignIn();
    if (res.ok) {
      onClose();
    } else if (res.error) {
      setErr(res.error);
    }
    // res.cancelled — the user backed out; not an error, show nothing.
    setProviderLoading(null);
  };

  const handleApple = async () => {
    if (!appleAvailable || providerLoading || authLoading || busy) return;
    setProviderLoading('apple');
    setErr('');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      if (!credential.identityToken) {
        setErr(t('appleNoSignInToken'));
        return;
      }

      const res = await loginWithApple(credential.identityToken);
      if (res.success) {
        onClose();
      } else {
        setErr(res.error || t('appleSignInFailed'));
      }
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        console.error('Apple login error:', e);
        setErr(t('appleSignInFailed'));
      }
    } finally {
      setProviderLoading(null);
    }
  };

  const providerBusy = authLoading || providerLoading !== null;
  const locked = providerBusy || busy;
  const isLandscape = width > height;
  const landscapeSheetWidth = Math.min(width * 0.58, 440);
  const resendLeft = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));

  // Sheet body height = scroll content (handle + step + bottom inset) + the
  // body's top padding, capped to the screen. First measure of an open lands
  // without animation so the sheet does not grow out of a stale height.
  const padBottom = Math.max(insets.bottom, isLandscape ? spacing.md : spacing.xl);
  const maxBodyH = sheetCapNoKb;
  const onContentSize = (_w: number, h: number) => {
    const target = Math.min(h + spacing.sm, maxBodyH);
    sheetHRef.current = target;
    if (firstMeasure.current || bodyH.value === 0) {
      bodyH.value = target;
      firstMeasure.current = false;
      return;
    }
    bodyH.value = withTiming(target, { duration: 240, easing: Easing.out(Easing.cubic) });
  };

  // Step hand-off: slide in the direction of travel; Reduce Motion crossfades.
  const entering = reduceMotion
    ? FadeIn.duration(150)
    : (dir === 1 ? FadeInRight : FadeInLeft).duration(240).reduceMotion(NO_RM);
  const exiting = reduceMotion
    ? FadeOut.duration(120)
    : (dir === 1 ? FadeOutLeft : FadeOutRight).duration(140).reduceMotion(NO_RM);

  const primaryStyle = (disabled: boolean) => ({ pressed }: { pressed: boolean }) => [
    styles.primaryButton,
    disabled && styles.primaryButtonDisabled,
    pressed && !disabled && styles.primaryButtonPressed,
  ];
  const outlineStyle = (disabled: boolean) => ({ pressed }: { pressed: boolean }) => [
    styles.outlineButton,
    disabled && styles.outlineButtonDisabled,
    pressed && !disabled && styles.outlineButtonPressed,
  ];

  const renderEmailStep = () => {
    const disabled = locked || !email.trim();
    return (
      <Reanimated.View key="email" entering={entering} exiting={exiting} style={styles.step}>
        <View style={styles.head}>
          <Text style={styles.title}>{title ?? t('welcomeToWorldguessr')}</Text>
          <Text style={styles.subtitle} numberOfLines={2} adjustsFontSizeToFit>
            {subtitle ?? t('signInSubtitle')}
          </Text>
        </View>

        {/* Providers first: for a young audience the one-click path converts
            best. The email form follows under a quiet "or". */}
        {Platform.OS === 'ios' && appleAvailable && (
          <Pressable style={outlineStyle(locked)} onPress={handleApple} disabled={locked}>
            {providerLoading === 'apple' ? (
              <ActivityIndicator color={INK} />
            ) : (
              <>
                <Ionicons name="logo-apple" size={22} color={INK} style={styles.appleIcon} />
                <Text style={styles.outlineText}>{t('continueWithApple')}</Text>
              </>
            )}
          </Pressable>
        )}

        <Pressable style={outlineStyle(!googleReady || locked)} onPress={handleGoogle} disabled={!googleReady || locked}>
          {providerLoading === 'google' ? (
            <ActivityIndicator color={INK} />
          ) : (
            <>
              <GoogleMark />
              <Text style={styles.outlineText}>{t('continueWithGoogle')}</Text>
            </>
          )}
        </Pressable>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>{t('orDivider')}</Text>
          <View style={styles.orLine} />
        </View>

        {err ? (
          <Reanimated.View entering={FadeInDown.duration(220).reduceMotion(NO_RM)} exiting={FadeOut.duration(160).reduceMotion(NO_RM)}>
            <Text style={styles.errorText}>{err}</Text>
          </Reanimated.View>
        ) : null}
        {/* Everything under the error line slides when it appears or leaves. */}
        <Reanimated.View layout={LinearTransition.duration(240).reduceMotion(NO_RM)} style={styles.stepBody}>
        <TextInput
          style={[
            styles.input,
            focusedField === 'email' && styles.inputFocused,
            locked && styles.inputDisabled,
          ]}
          value={email}
          onChangeText={(v) => { setEmail(v); if (err) setErr(''); }}
          onFocus={() => setFocusedField('email')}
          onBlur={() => setFocusedField(null)}
          placeholder={t('emailPlaceholder')}
          placeholderTextColor={MUTED}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={submitEmail}
          editable={!locked}
          // NO autoFocus here: this step's primary path is the provider
          // buttons ABOVE the field — stealing focus popped the keyboard over
          // the whole sheet the moment it opened. The username and code steps
          // keep autoFocus; typing is their only job.
          accessibilityLabel={t('emailPlaceholder')}
        />
        <Reanimated.View style={pulseStyle}>
          <Pressable style={primaryStyle(disabled && !busy)} onPress={submitEmail} disabled={disabled}>
            {busy ? (
              <BusyDots color={BTN_INK} />
            ) : (
              <Text style={[styles.primaryText, disabled && styles.primaryTextDisabled]}>{t('continue')}</Text>
            )}
          </Pressable>
        </Reanimated.View>
        </Reanimated.View>
      </Reanimated.View>
    );
  };

  const renderUsernameStep = () => {
    const disabled = !(avail === 'ok' || avail === 'unknown') || busy;
    return (
      <Reanimated.View key="username" entering={entering} exiting={exiting} style={styles.step}>
        <View style={styles.head}>
          <Text style={styles.title}>{t('pickUsernameTitle')}</Text>
          <Text style={styles.subtitle}>{t('enterUsername')}</Text>
        </View>
        {err ? (
          <Reanimated.View entering={FadeInDown.duration(220).reduceMotion(NO_RM)} exiting={FadeOut.duration(160).reduceMotion(NO_RM)}>
            <Text style={styles.errorText}>{err}</Text>
          </Reanimated.View>
        ) : null}
        <Reanimated.View layout={LinearTransition.duration(240).reduceMotion(NO_RM)} style={styles.stepBody}>
        <View style={styles.field}>
          <TextInput
            style={[
              styles.input,
              styles.inputWithGlyph,
              focusedField === 'username' && styles.inputFocused,
              busy && styles.inputDisabled,
              (avail === 'taken' || avail === 'invalid') && styles.inputError,
            ]}
            value={username}
            onChangeText={setUsername}
            onFocus={() => setFocusedField('username')}
            onBlur={() => setFocusedField(null)}
            placeholder={t('enterUsernameBox')}
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            maxLength={USERNAME_MAX_LENGTH}
            returnKeyType="done"
            onSubmitEditing={submitUsername}
            editable={!busy}
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
        <Pressable style={primaryStyle(disabled)} onPress={submitUsername} disabled={disabled}>
          <Text style={[styles.primaryText, disabled && styles.primaryTextDisabled]}>{t('continue')}</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => go('email', -1)} disabled={busy}>
          <Text style={styles.linkText}>{t('back')}</Text>
        </Pressable>
        </Reanimated.View>
      </Reanimated.View>
    );
  };

  const renderCodeStep = () => (
    <Reanimated.View key="code" entering={entering} exiting={exiting} style={styles.step}>
      <View style={styles.head}>
        <Text style={styles.title}>{t(isNew ? 'codeTitleNew' : 'codeTitleReturning')}</Text>
        {/* One sentence, the address inline and bold (web parity). */}
        <Text style={styles.subtitle}>
          {t('codeSentTo')} <Text style={styles.emailInline}>{email}</Text>
        </Text>
      </View>
      {err ? (
        <Reanimated.View entering={FadeInDown.duration(220).reduceMotion(NO_RM)} exiting={FadeOut.duration(160).reduceMotion(NO_RM)}>
          <Text style={styles.errorText}>{err}</Text>
        </Reanimated.View>
      ) : null}
      <Reanimated.View layout={LinearTransition.duration(240).reduceMotion(NO_RM)} style={styles.stepBody}>
      <CodeInput
        value={code}
        onChange={(v) => {
          // Typing claims the row: cancel a pending wrong-code clear so it
          // can't wipe digits entered after the verdict.
          if (codeResetTimer.current) { clearTimeout(codeResetTimer.current); codeResetTimer.current = null; }
          setCode(v); if (codeState === 'error') setCodeState('idle'); if (err) setErr('');
        }}
        onComplete={submitCode}
        disabled={busy}
        state={codeState}
        shakeKey={shake}
        label={t('codeTitle')}
      />
      {/* The two quiet actions on ONE row, a middle dot between them; no
          spam-folder line (web parity). */}
      <View style={styles.row}>
        <Pressable style={styles.link} onPress={resend} disabled={busy || resendLeft > 0}>
          <Text style={[styles.linkText, styles.tabular, (busy || resendLeft > 0) && styles.linkDisabled]}>
            {resendLeft > 0 ? t('resendIn', { s: resendLeft }) : t('resendCode')}
          </Text>
        </Pressable>
        <Text style={styles.sep} accessibilityElementsHidden importantForAccessibility="no">·</Text>
        <Pressable style={styles.link} onPress={useDifferentEmail} disabled={busy}>
          <Text style={styles.linkText}>{t('useDifferentEmail')}</Text>
        </Pressable>
      </View>
      </Reanimated.View>
    </Reanimated.View>
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      // Android back: step back through the flow rather than losing it;
      // it only closes the sheet from the first step.
      onRequestClose={() => {
        if (busy) return;
        if (step === 'username') go('email', -1);
        else if (step === 'code') useDifferentEmail();
        else onClose();
      }}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        {/* Accidental dismissal only on the first step: once a code is in
            flight (username / code) a backdrop tap does nothing; the grab
            handle is the deliberate close, except on the username step (the
            lock-in), where nothing closes: Back / Android back only. Web
            parity: LoginModal hides its X on that step. */}
        <Pressable sfx="none" style={StyleSheet.absoluteFillObject} onPress={locked || step !== 'email' ? undefined : onClose} />
      </Animated.View>
      {/* behavior="padding" on BOTH platforms: with edgeToEdgeEnabled the
          Android window never resizes for the keyboard (adjustResize is dead
          under edge-to-edge), so 'height'/undefined meant NO avoidance at all.
          'padding' works from keyboard events, so the code cells stay above
          the IME in portrait and landscape. */}
      <View style={[StyleSheet.absoluteFill, styles.kavEnd]} pointerEvents="box-none">
        {/* Keyboard lift rides the UI thread (see keyboardLiftStyle); the
            legacy Animated slot inside keeps the open/close slide transform.
            Two layers on purpose — reanimated and legacy Animated cannot
            share one transform. The slot stays a FLEX child pinned by
            flex-end: padding/absolute tricks are what the old janky KAV
            needed, and what broke before that. */}
        <Reanimated.View style={keyboardLiftStyle}>
        <Animated.View style={[
          styles.sheetSlot,
          isLandscape ? { width: landscapeSheetWidth, alignSelf: 'center' } : null,
          { transform: [{ translateY: sheetTranslateY }] },
        ]}>
          <Reanimated.View style={[
            styles.sheet,
            isLandscape && styles.sheetLandscape,
            { maxHeight: maxBodyH },
            bodyStyle,
          ]}>
            <ScrollView
              style={styles.scroll}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: padBottom }]}
              onContentSizeChange={onContentSize}
            >
              <Pressable
                sfx="none"
                style={styles.handleHitArea}
                onPress={locked || step === 'username' ? undefined : onClose}
                disabled={locked || step === 'username'}
                accessibilityRole="button"
                accessibilityLabel={t('closeSignInOptions')}
              >
                <View style={styles.handle} />
              </Pressable>
              <View style={styles.stack}>
                {step === 'email' && renderEmailStep()}
                {step === 'username' && renderUsernameStep()}
                {step === 'code' && renderCodeStep()}
              </View>
            </ScrollView>
          </Reanimated.View>
        </Animated.View>
        </Reanimated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ...loginStyleDefs,
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  // Pins the sheet slot to the screen bottom; the keyboard lift translates it
  // up from there on the UI thread.
  kavEnd: {
    justifyContent: 'flex-end',
  },
  // Outer slot: where the sheet sits and how it slides in. Paints nothing.
  // A flex child on purpose — see the KAV comment in render.
  sheetSlot: {
    width: '100%',
  },
  // Inner body: the painted sheet; its height is animated (bodyStyle).
  sheet: {
    width: '100%',
    paddingTop: spacing.sm,
    paddingHorizontal: 24,
    backgroundColor: CARD,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },
  sheetLandscape: {
    paddingTop: spacing.sm,
    paddingHorizontal: 22,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleHitArea: {
    alignSelf: 'center',
    width: 56,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  // Fills the animated body; shrinks (and scrolls) only when the screen is
  // shorter than the content (short landscape phones with the keyboard up).
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  scrollContent: {
    flexGrow: 0,
  },
  stack: {
    width: '100%',
  },
  step: {
    gap: 12,
    paddingTop: 4,
  },
  // Everything under the error line; slides as one when the line comes/goes.
  stepBody: {
    gap: 12,
  },
  // The address, inline in the code step's subtitle sentence.
  emailInline: {
    color: INK,
    fontFamily: 'Lexend-SemiBold',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 24,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  // web .wgLogin__btn--quiet: white, outlined, same chunk
  outlineButton: {
    width: '100%',
    height: 56,
    paddingHorizontal: 22,
    backgroundColor: FIELD_FOCUS,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: LINE,
    borderBottomWidth: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  outlineButtonPressed: {
    backgroundColor: FIELD,
    borderBottomWidth: 2,
    marginTop: 2,
  },
  outlineButtonDisabled: {
    opacity: 0.6,
  },
  outlineText: {
    color: INK,
    fontSize: 16,
    fontFamily: 'Lexend-Bold',
  },
  appleIcon: {
    marginTop: -2,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 2,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: RULE,
  },
  orText: {
    color: MUTED,
    fontFamily: 'Lexend-SemiBold',
    fontSize: 13,
  },
  link: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  linkText: {
    color: INK_SOFT,
    fontFamily: 'Lexend-SemiBold',
    fontSize: 14,
  },
  linkDisabled: {
    color: MUTED,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  // Code step footer: "Resend code · Use a different email" on one line.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 2,
  },
  sep: {
    color: MUTED,
    fontFamily: 'Lexend-SemiBold',
    fontSize: 14,
  },
});
