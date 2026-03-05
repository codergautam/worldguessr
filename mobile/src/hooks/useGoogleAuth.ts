import { useEffect } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../store/authStore';

WebBrowser.maybeCompleteAuthSession();

export function useGoogleAuth() {
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params?.id_token;
      if (idToken) {
        loginWithGoogle(idToken);
      }
    }
  }, [response]);

  return {
    promptAsync,
    isReady: !!request,
  };
}
