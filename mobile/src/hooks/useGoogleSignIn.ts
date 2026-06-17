import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
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
    try {
      const { statusCodes, isErrorWithCode } = getNativeGoogleSignin();
      if (isErrorWithCode?.(e)) {
        if (e.code === statusCodes.SIGN_IN_CANCELLED) return { ok: false, cancelled: true };
        if (e.code === statusCodes.IN_PROGRESS) return { ok: false };
      }
    } catch {
      // module unavailable while inspecting the error — fall through to generic.
    }
    console.error('[useGoogleSignIn] native Google sign-in error:', e);
    return { ok: false, error: genericError() };
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
