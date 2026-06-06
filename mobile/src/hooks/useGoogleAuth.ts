import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { exchangeCodeAsync, type AuthSessionResult } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

// Google's token endpoint. expo exposes this on its Google `discovery`, but we
// reference it directly so the exchange below doesn't depend on hook internals.
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * Thin wrapper around expo's Google id-token auth request.
 *
 * IMPORTANT (native vs web): on iOS/Android, Google does NOT support the
 * implicit `id_token` response — `useIdTokenAuthRequest` falls back to the
 * authorization-code + PKCE flow, so `promptAsync()` resolves with
 * `params.code` and NO `params.id_token`. (Only web gets an id_token straight
 * back.) expo can auto-exchange that code, but only into the hook's `response`
 * value, which the call site can't easily await without re-introducing the
 * fire-and-forget effect that used to swallow errors.
 *
 * So we own the exchange here: after a successful prompt we trade the `code`
 * for tokens via PKCE (no client secret — these are installed-app clients) and
 * splice the resulting `id_token` back into the result. The caller keeps
 * reading `result.params.id_token` exactly as before, and any failure rejects
 * loudly instead of disappearing.
 */
export function useGoogleAuth() {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId,
    androidClientId,
  });

  const promptForIdToken = async (): Promise<AuthSessionResult> => {
    const result = await promptAsync();

    // Only success can carry a token; pass through cancel/dismiss/error as-is.
    if (result.type !== 'success') return result;

    // Web (implicit) already includes the id_token — nothing to do.
    if (result.params?.id_token) return result;

    const code = result.params?.code;
    if (!code || !request) {
      // No code to exchange and no id_token: let the caller surface the
      // "no sign in token" message with full params logged.
      console.warn('[useGoogleAuth] success but no code/id_token to exchange', result.params);
      return result;
    }

    const clientId = Platform.select({
      ios: iosClientId,
      android: androidClientId,
      default: iosClientId,
    });

    try {
      const tokenResponse = await exchangeCodeAsync(
        {
          clientId: clientId as string,
          code,
          redirectUri: request.redirectUri,
          // PKCE: prove we initiated the request. No client secret on device.
          extraParams: { code_verifier: request.codeVerifier ?? '' },
        },
        { tokenEndpoint: GOOGLE_TOKEN_ENDPOINT },
      );

      return {
        ...result,
        params: {
          ...result.params,
          id_token: tokenResponse.idToken ?? '',
          access_token: tokenResponse.accessToken,
        },
        authentication: tokenResponse,
      } as AuthSessionResult;
    } catch (e) {
      console.error('[useGoogleAuth] code -> token exchange failed', e);
      // Surface as an error result so the sheet shows a proper failure message
      // (the caller's `result.type === 'error'` branch).
      return {
        type: 'error',
        errorCode: null,
        error: null,
        params: {},
        authentication: null,
        url: '',
      };
    }
  };

  return {
    promptAsync: promptForIdToken,
    isReady: !!request,
  };
}
