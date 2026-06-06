/**
 * Handles incoming deep links — both the custom `worldguessr://` scheme and
 * `https://worldguessr.com/...` universal links / app links — and routes them to
 * the matching in-app screen. Mirrors the web URL shapes (home.js, map.js,
 * user.js, daily):
 *
 *   /?party=CODE  /map?s=SLUG  /map/SLUG  /?map=SLUG  /user?u=NAME  /daily
 *
 * Locale-prefixed variants (`/fr/daily`, `/es/map/...`) are handled too.
 *
 * Party invites are the one link that feeds the multiplayer store rather than
 * navigating directly — home.tsx owns entering the unified multiplayer screen
 * once `inGame` flips, so we just join and let it navigate (web parity).
 *
 * Tap-to-open-the-app from the https links requires the native universal-link
 * config (apple-app-site-association / assetlinks.json on the domain +
 * ios.associatedDomains / android.intentFilters in app.json) — present as of
 * the link-routing work. The custom `worldguessr://` scheme works without it.
 */

import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { router, useRootNavigationState } from 'expo-router';
import { useMultiplayerStore } from '../store/multiplayerStore';

// Web serves localized copies under a language prefix (pages/en.js, fr.js, ...).
// Strip a leading locale segment so `/fr/daily` routes the same as `/daily`.
const LOCALES = new Set(['en', 'fr', 'es', 'de', 'ru']);

type NavRoute =
  | { kind: 'map'; slug: string }
  | { kind: 'user'; username: string }
  | { kind: 'daily' };

/** First string value of a parsed query param (params can be string | string[]). */
function firstStr(v: unknown): string | null {
  if (typeof v === 'string') return v.length ? v : null;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0].length ? v[0] : null;
  return null;
}

/**
 * Party-invite code, if any. Unchanged from the original party-only handler:
 * supports `?party=CODE` (any path) and the path form `worldguessr://party/CODE`.
 */
function extractPartyCode(url: string | null): string | null {
  if (!url) return null;
  try {
    const { queryParams, path } = Linking.parse(url);
    const q = queryParams?.party;
    if (typeof q === 'string' && /^\d{4,8}$/.test(q)) return q;
    const m = (path ?? '').match(/party\/(\d{4,8})/);
    if (m) return m[1];
  } catch {
    // Malformed URL — ignore.
  }
  return null;
}

/**
 * Direct-navigation target for a link (map / profile / daily). Returns null for
 * party links (handled separately via the store) and for the bare home link /
 * anything unrecognised (e.g. the OAuth `?code=` redirect) — those are no-ops.
 */
function extractNavRoute(url: string | null): NavRoute | null {
  if (!url) return null;
  let parsed: ReturnType<typeof Linking.parse>;
  try {
    parsed = Linking.parse(url);
  } catch {
    return null;
  }
  const query = parsed.queryParams ?? {};
  let segments = (parsed.path ?? '').split('/').filter(Boolean);
  if (segments.length && LOCALES.has(segments[0].toLowerCase())) {
    segments = segments.slice(1);
  }

  // Root `/?map=SLUG` (web auto-loads the map; mobile opens its detail screen).
  if (segments.length === 0) {
    const rootMap = firstStr(query.map);
    if (rootMap) return { kind: 'map', slug: rootMap };
    return null;
  }

  switch (segments[0]) {
    case 'map': {
      // `/map/SLUG` or `/map?s=SLUG` (also tolerate `?slug=`).
      const slug = segments[1] ?? firstStr(query.s) ?? firstStr(query.slug);
      return slug ? { kind: 'map', slug } : null;
    }
    case 'user': {
      // `/user/NAME` or `/user?u=NAME`.
      const username = segments[1] ?? firstStr(query.u);
      return username ? { kind: 'user', username } : null;
    }
    case 'daily':
      return { kind: 'daily' };
    default:
      return null;
  }
}

export function useDeepLinkInvite() {
  const url = Linking.useURL(); // initial launch URL + any while foregrounded
  const navState = useRootNavigationState();
  const navReady = !!navState?.key; // root navigator mounted (false during cold start)
  const verified = useMultiplayerStore((s) => s.verified);
  const inGame = useMultiplayerStore((s) => s.inGame);

  const pendingPartyRef = useRef<string | null>(null);
  const pendingNavRef = useRef<NavRoute | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  // Join now if the socket is ready, otherwise stash for the socket-ready effect.
  const joinParty = (code: string): boolean => {
    const st = useMultiplayerStore.getState();
    if (st.verified && !st.inGame) {
      st.joinPrivateGame(code);
      return true;
    }
    return false;
  };

  const navigateTo = (route: NavRoute) => {
    switch (route.kind) {
      case 'map':
        router.push({ pathname: '/map/[slug]', params: { slug: route.slug } });
        break;
      case 'user':
        router.push({ pathname: '/user/[username]', params: { username: route.username } });
        break;
      case 'daily':
        router.push('/daily' as any); // typed-routes collision workaround (see home.tsx)
        break;
    }
  };

  // A new URL arrived. Party links feed the store; everything else navigates
  // (deferred until the navigator is mounted on a cold start).
  useEffect(() => {
    if (!url || url === lastUrlRef.current) return;
    lastUrlRef.current = url;

    const code = extractPartyCode(url);
    if (code) {
      if (!joinParty(code)) pendingPartyRef.current = code;
      return;
    }

    const route = extractNavRoute(url);
    if (route) {
      if (navReady) navigateTo(route);
      else pendingNavRef.current = route;
    }
  }, [url, navReady]);

  // Socket became ready (and we're free) — consume a stashed party invite.
  useEffect(() => {
    if (verified && !inGame && pendingPartyRef.current) {
      const code = pendingPartyRef.current;
      pendingPartyRef.current = null;
      useMultiplayerStore.getState().joinPrivateGame(code);
    }
  }, [verified, inGame]);

  // Navigator became ready — consume a stashed navigation (cold-start link).
  useEffect(() => {
    if (navReady && pendingNavRef.current) {
      const route = pendingNavRef.current;
      pendingNavRef.current = null;
      navigateTo(route);
    }
  }, [navReady]);
}
