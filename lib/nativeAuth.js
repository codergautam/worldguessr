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

function getWebCrypto() {
  if (typeof globalThis === 'undefined') return null;
  return globalThis.crypto || globalThis.msCrypto || null;
}

function utf8Encode(value) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value);
  }

  const encoded = unescape(encodeURIComponent(value));
  const bytes = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i += 1) {
    bytes[i] = encoded.charCodeAt(i);
  }
  return bytes;
}

function rotateRight(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256Bytes(bytes) {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const bitLength = bytes.length * 8;
  const totalLength = Math.ceil((bytes.length + 1 + 8) / 64) * 64;
  const data = new Uint8Array(totalLength);
  const words = new Uint32Array(64);

  data.set(bytes);
  data[bytes.length] = 0x80;

  const highLength = Math.floor(bitLength / 0x100000000);
  const lowLength = bitLength >>> 0;
  data[totalLength - 8] = highLength >>> 24;
  data[totalLength - 7] = highLength >>> 16;
  data[totalLength - 6] = highLength >>> 8;
  data[totalLength - 5] = highLength;
  data[totalLength - 4] = lowLength >>> 24;
  data[totalLength - 3] = lowLength >>> 16;
  data[totalLength - 2] = lowLength >>> 8;
  data[totalLength - 1] = lowLength;

  for (let offset = 0; offset < totalLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const wordOffset = offset + i * 4;
      words[i] = (
        (data[wordOffset] << 24) |
        (data[wordOffset + 1] << 16) |
        (data[wordOffset + 2] << 8) |
        data[wordOffset + 3]
      ) >>> 0;
    }

    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotateRight(words[i - 15], 7) ^ rotateRight(words[i - 15], 18) ^ (words[i - 15] >>> 3)) >>> 0;
      const s1 = (rotateRight(words[i - 2], 17) ^ rotateRight(words[i - 2], 19) ^ (words[i - 2] >>> 10)) >>> 0;
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + constants[i] + words[i]) >>> 0;
      const s0 = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  const output = new Uint8Array(32);
  hash.forEach((word, index) => {
    const offset = index * 4;
    output[offset] = word >>> 24;
    output[offset + 1] = word >>> 16;
    output[offset + 2] = word >>> 8;
    output[offset + 3] = word;
  });
  return output;
}

function randomUrlSafe(size = 32) {
  const webCrypto = getWebCrypto();
  if (!webCrypto?.getRandomValues) {
    throw new Error('Secure random is unavailable in this WebView');
  }

  const bytes = new Uint8Array(size);
  webCrypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(value) {
  const input = utf8Encode(value);
  const webCrypto = getWebCrypto();

  if (webCrypto?.subtle?.digest) {
    const digest = await webCrypto.subtle.digest('SHA-256', input);
    return base64UrlEncode(new Uint8Array(digest));
  }

  return base64UrlEncode(sha256Bytes(input));
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
