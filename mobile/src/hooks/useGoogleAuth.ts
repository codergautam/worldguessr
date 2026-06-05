import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

/**
 * Thin wrapper around expo's Google id-token auth request. It only opens the
 * prompt — the CALLER awaits `promptAsync()`, reads the id_token off the result,
 * and runs `loginWithGoogle` itself. (Previously this hook logged in from a
 * fire-and-forget effect, which swallowed every failure: the sheet had already
 * closed, so a rejected/network-failed login showed the user nothing. Owning the
 * flow at the call site lets it surface an error message like the Apple path.)
 */
export function useGoogleAuth() {
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  return {
    promptAsync,
    isReady: !!request,
  };
}
