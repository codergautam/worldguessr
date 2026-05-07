import { Capacitor } from '@capacitor/core';
import clientConfig from '@/clientConfig';
import { fetchWithFallback } from '@/components/utils/retryFetch';

const GOOGLE_SCOPE = 'openid email profile';
const AUTH_TIMEOUT_MS = 3 * 60 * 1000;
const DEFAULT_APPLE_BUNDLE_ID = 'com.codergautamyt.worldguessr';

export function isCapacitorNative() {
  return !!(
    typeof window !== 'undefined' &&
    Capacitor?.isNativePlatform?.()
  );
}

export function getCapacitorPlatform() {
  if (!isCapacitorNative()) return null;
  return Capacitor.getPlatform?.() || null;
}

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomUrlSafe(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(value) {
  if (!crypto?.subtle) {
    throw new Error('Secure crypto is unavailable in this WebView');
  }
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return base64UrlEncode(new Uint8Array(digest));
}

function defaultGoogleRedirectUri(clientId) {
  if (!clientId?.endsWith('.apps.googleusercontent.com')) return null;
  return `com.googleusercontent.apps.${clientId.replace('.apps.googleusercontent.com', '')}:/oauth2redirect`;
}

function getGoogleNativeConfig() {
  const platform = getCapacitorPlatform();
  const clientId = platform === 'android'
    ? (process.env.NEXT_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_NATIVE_CLIENT_ID)
    : (process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_NATIVE_CLIENT_ID);
  const redirectUri = platform === 'android'
    ? (process.env.NEXT_PUBLIC_GOOGLE_ANDROID_REDIRECT_URI || process.env.NEXT_PUBLIC_GOOGLE_NATIVE_REDIRECT_URI || defaultGoogleRedirectUri(clientId))
    : (process.env.NEXT_PUBLIC_GOOGLE_IOS_REDIRECT_URI || process.env.NEXT_PUBLIC_GOOGLE_NATIVE_REDIRECT_URI || defaultGoogleRedirectUri(clientId));
  if (!clientId || !redirectUri) {
    throw new Error('Native Google login is not configured');
  }
  return { clientId, redirectUri };
}

function getAppleClientId() {
  return (
    process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_APPLE_BUNDLE_ID ||
    process.env.NEXT_PUBLIC_NATIVE_APP_ID ||
    DEFAULT_APPLE_BUNDLE_ID
  );
}

function getAuthParamsFromUrl(url, redirectUri) {
  if (!url || !redirectUri || !url.startsWith(redirectUri)) return null;
  const queryStart = url.indexOf('?');
  const hashStart = url.indexOf('#');
  const paramsText = queryStart >= 0
    ? url.slice(queryStart + 1)
    : hashStart >= 0
      ? url.slice(hashStart + 1)
      : '';
  return new URLSearchParams(paramsText);
}

async function postNativeAuth(payload, requestName) {
  const primaryUrl = `${clientConfig().authUrl}/api/googleAuth`;
  const fallbackUrl = `${clientConfig().apiUrl}/api/googleAuth`;

  const res = await fetchWithFallback(
    primaryUrl,
    fallbackUrl,
    {
      body: JSON.stringify(payload),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    requestName,
    {}
  );

  const data = await res.json();
  if (!data?.secret) {
    throw new Error(data?.error || 'Authentication failed');
  }
  return data;
}

async function startNativeGoogleAuth() {
  const { App } = await import('@capacitor/app');
  const { Browser } = await import('@capacitor/browser');
  const { clientId, redirectUri } = getGoogleNativeConfig();
  const state = randomUrlSafe();
  const codeVerifier = randomUrlSafe(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_SCOPE);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('prompt', 'select_account');

  return new Promise(async (resolve, reject) => {
    let appListener = null;
    let browserListener = null;
    let settled = false;

    const finish = async (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      await appListener?.remove?.();
      await browserListener?.remove?.();
      try {
        await Browser.close();
      } catch (_) {}
      fn(value);
    };

    const timeoutId = setTimeout(() => {
      finish(reject, new Error('Login timed out'));
    }, AUTH_TIMEOUT_MS);

    try {
      appListener = await App.addListener('appUrlOpen', async ({ url }) => {
        const params = getAuthParamsFromUrl(url, redirectUri);
        if (!params) return;

        if (params.get('state') !== state) {
          finish(reject, new Error('Login state mismatch'));
          return;
        }

        if (params.get('error')) {
          finish(reject, new Error(params.get('error_description') || params.get('error')));
          return;
        }

        const code = params.get('code');
        if (!code) {
          finish(reject, new Error('Google did not return an authorization code'));
          return;
        }

        try {
          const data = await postNativeAuth({
            provider: 'google',
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
            client_id: clientId,
          }, 'nativeGoogleAuth');
          finish(resolve, data);
        } catch (error) {
          finish(reject, error);
        }
      });

      browserListener = await Browser.addListener('browserFinished', () => {
        finish(reject, new Error('Login cancelled'));
      });

      await Browser.open({
        url: authUrl.toString(),
        presentationStyle: 'popover',
        windowName: '_self',
      });
    } catch (error) {
      finish(reject, error);
    }
  });
}

async function startNativeAppleAuth() {
  if (getCapacitorPlatform() !== 'ios') {
    throw new Error('Apple Sign In is only available on iOS');
  }

  const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
  const nonce = randomUrlSafe();
  const state = randomUrlSafe();
  const result = await SignInWithApple.authorize({
    clientId: getAppleClientId(),
    redirectURI: process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI || 'https://worldguessr.com',
    scopes: 'email name',
    state,
    nonce,
  });

  const response = result?.response;
  if (!response?.identityToken) {
    throw new Error('Apple did not return an identity token');
  }

  return postNativeAuth({
    provider: 'apple',
    identity_token: response.identityToken,
    authorization_code: response.authorizationCode,
    apple_user: response.user,
    email: response.email,
    given_name: response.givenName,
    family_name: response.familyName,
    nonce,
  }, 'nativeAppleAuth');
}

export async function startNativeAuth(provider = 'google') {
  if (!isCapacitorNative()) {
    throw new Error('Native login is only available in the mobile app');
  }

  if (provider === 'apple') {
    return startNativeAppleAuth();
  }

  return startNativeGoogleAuth();
}
