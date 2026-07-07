import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import type { AuthSessionResult } from 'expo-auth-session';
import { t } from '../shared';
import { useGoogleAuth } from './useGoogleAuth';
import { useAuthStore } from '../store/authStore';

/**
 * Reusable Google sign-in flow. Single source of truth for both consumers — the
 * AccountSelectSheet (iOS, shown alongside Apple) and the home login button on
 * Android, where Google is the only provider.
 *
 * The two platforms acquire the Google id_token differently, then share the same
 * backend exchange (`loginWithGoogle`):
 *   • iOS     — expo-auth-session (`useGoogleAuth`): a Safari/Custom-Tab OAuth
 *               flow. Kept as-is so the Apple+Google sheet is untouched.
 *   • Android — the NATIVE Google Sign-In SDK (Play Services account picker, no
 *               browser). Lazily required so iOS / Expo Go never load the native
 *               module. The token's audience is the WEB client id, which our
 *               backend already accepts (api/googleAuth.js allowedAudiences).
 *
 * Returns a plain result so each caller surfaces the outcome its own way (inline
 * error text in the sheet, an Alert on Android). `cancelled` is distinct from a
 * real failure: a user backing out is not an error, so callers stay silent.
 */
export interface GoogleSignInResult {
  ok: boolean;
  error?: string;
  cancelled?: boolean;
}

type TokenResult =
  | { ok: true; idToken: string }
  | { ok: false; error?: string; cancelled?: boolean };

// The WEB OAuth client id — the audience native Android sign-in stamps on its
// id_token, and what the backend verifies against (NEXT_PUBLIC_GOOGLE_CLIENT_ID).
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

const genericError = () =>
  t('googleSignInFailed', undefined, 'Google sign in failed. Please try again.');
const noTokenError = () =>
  t('googleNoSignInToken', undefined, 'Google did not return a sign in token.');

/**
 * Turn a native Google Sign-In error into a clear, user-facing message instead of
 * a blanket "try again". Known, user-actionable conditions (Play Services, no
 * network) get specific copy; DEVELOPER_ERROR (code 10) is a config problem the
 * user can't fix, so in production it reads as "temporarily unavailable" while in
 * a dev build it spells out the real cause (SHA-1 / client-id mismatch). Any
 * unknown code is appended in dev builds only, so prod stays clean.
 */
function describeNativeError(e: any, statusCodes: any): string {
  const code = e?.code != null ? String(e.code) : 'unknown';
  if (statusCodes && e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return t('googleSignInNoPlayServices', undefined,
      'Google Play Services is unavailable or out of date. Update it and try again.');
  }
  if (code === '7') { // GoogleSignInStatusCodes NETWORK_ERROR
    return t('errorNetworkRequest', undefined, 'Network error. Check your connection and try again.');
  }
  if (code === '10') { // DEVELOPER_ERROR — signing SHA-1 / client id not registered
    return __DEV__
      ? 'Google sign-in misconfigured (DEVELOPER_ERROR / code 10): the app’s signing SHA-1 or client ID is not registered in Google Cloud for this package.'
      : t('googleSignInUnavailable', undefined,
          'Google sign-in is temporarily unavailable. Please try again later.');
  }
  const base = genericError();
  return __DEV__ ? `${base} (${code})` : base;
}

// ── Android: native Google Sign-In (Play Services) ─────────────────────────────
// Lazily required + configured once, so the native module is only ever touched on
// Android (never iOS / Expo Go, where it isn't linked).
let nativeConfigured = false;
function getNativeGoogleSignin() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@react-native-google-signin/google-signin');
  if (!nativeConfigured) {
    mod.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
    nativeConfigured = true;
  }
  return mod;
}

async function getAndroidIdToken(): Promise<TokenResult> {
  try {
    const { GoogleSignin, statusCodes, isErrorWithCode } = getNativeGoogleSignin();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    // v13+ returns { type: 'success' | 'cancelled', data }; older returns the user
    // object directly. Normalise both so a version bump can't silently break this.
    if (response?.type === 'cancelled') return { ok: false, cancelled: true };
    const idToken: string | undefined = response?.data?.idToken ?? response?.idToken;
    if (!idToken) {
      console.warn('[useGoogleSignIn] native sign-in returned no id_token', response);
      return { ok: false, error: noTokenError() };
    }
    return { ok: true, idToken };
  } catch (e: any) {
    // Cancellation (older API throws instead of returning {type:'cancelled'}) and
    // an in-progress prompt are not real failures — stay silent.
    let statusCodes: any;
    try {
      const mod = getNativeGoogleSignin();
      statusCodes = mod.statusCodes;
      if (mod.isErrorWithCode?.(e)) {
        if (e.code === statusCodes.SIGN_IN_CANCELLED) return { ok: false, cancelled: true };
        if (e.code === statusCodes.IN_PROGRESS) return { ok: false };
      }
    } catch {
      // module unavailable while inspecting the error — fall through to generic.
    }
    console.error('[useGoogleSignIn] native Google sign-in error:', e?.code, e?.message || e);
    return { ok: false, error: describeNativeError(e, statusCodes) };
  }
}

// ── iOS: expo-auth-session (browser) ──────────────────────────────────────────
async function getBrowserIdToken(
  promptAsync: () => Promise<AuthSessionResult>,
): Promise<TokenResult> {
  const result = await promptAsync();
  if (result.type === 'success') {
    const idToken = result.params?.id_token;
    if (!idToken) {
      console.warn(
        '[useGoogleSignIn] success but NO id_token. Params returned:',
        JSON.stringify((result as any)?.params ?? {}),
      );
      return { ok: false, error: noTokenError() };
    }
    return { ok: true, idToken };
  }
  if (result.type === 'error') {
    console.error('[useGoogleSignIn] auth error result', (result as any)?.error, (result as any)?.params);
    return { ok: false, error: genericError() };
  }
  // 'cancel' / 'dismiss' — the user backed out.
  return { ok: false, cancelled: true };
}

/**
 * Shared login entry point for every "Sign in" affordance. Android has a
 * single provider (Google), so a tap runs the native Google flow directly —
 * no chooser sheet. iOS opens the AccountSelectSheet (Apple + Google). If the
 * Android flow isn't ready, fall back to the sheet so the tap is never a
 * dead end.
 *
 * `onSuccess` runs only after a successful ANDROID direct sign-in — the iOS
 * sheet path signals completion through the sheet's own onClose instead.
 * Callers passing the prompt straight to onPress are safe: a press event in
 * the first arg is ignored (only functions are honored).
 */
export function useLoginPrompt(openSheet: () => void) {
  const { signIn, isReady, loading } = useGoogleSignIn();
  const authLoading = useAuthStore((s) => s.isLoading);

  return useCallback((onSuccess?: unknown) => {
    if (authLoading || loading) return;
    const after = typeof onSuccess === 'function' ? (onSuccess as () => void) : undefined;
    if (Platform.OS === 'android' && isReady) {
      signIn().then((res) => {
        if (res.ok) after?.();
        else if (res.error) Alert.alert(t('signIn'), res.error);
      });
      return;
    }
    openSheet();
  }, [authLoading, loading, isReady, signIn, openSheet]);
}

export function useGoogleSignIn() {
  const { promptAsync, isReady: iosReady } = useGoogleAuth();
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const authLoading = useAuthStore((s) => s.isLoading);
  const [loading, setLoading] = useState(false);

  // Native Android sign-in has no async request to warm up (readiness is checked
  // at call time via hasPlayServices); only the iOS browser request must be ready.
  const isReady = Platform.OS === 'android' ? true : iosReady;

  const signIn = useCallback(async (): Promise<GoogleSignInResult> => {
    if (!isReady || loading || authLoading) return { ok: false };
    setLoading(true);
    try {
      const token = Platform.OS === 'android'
        ? await getAndroidIdToken()
        : await getBrowserIdToken(promptAsync);
      if (!token.ok) return token; // cancelled / error / no token — pass through

      const res = await loginWithGoogle(token.idToken);
      if (res.success) return { ok: true };
      return { ok: false, error: res.error || genericError() };
    } catch (e) {
      console.error('Google login error:', e);
      return { ok: false, error: genericError() };
    } finally {
      setLoading(false);
    }
  }, [isReady, loading, authLoading, promptAsync, loginWithGoogle]);

  return { signIn, isReady, loading };
}
