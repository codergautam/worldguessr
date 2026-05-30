/**
 * Handles party-invite deep links. Mirrors web's `?party=CODE` join flow
 * (home.js): opening `https://worldguessr.com/?party=123456` or the custom
 * scheme `worldguessr://?party=123456` joins that private game.
 *
 * Joining is the only side effect — home.tsx owns navigating into the unified
 * multiplayer screen once `inGame` flips, so this hook just feeds the store.
 *
 * NOTE: tap-to-open-the-app from the https link additionally requires native
 * universal-link config (apple-app-site-association / assetlinks.json on the
 * domain + associatedDomains/intentFilters). That's a separate native step; the
 * custom `worldguessr://` scheme and in-app handling work without it.
 */

import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useMultiplayerStore } from '../store/multiplayerStore';

function extractPartyCode(url: string | null): string | null {
  if (!url) return null;
  try {
    const { queryParams, path } = Linking.parse(url);
    const q = queryParams?.party;
    if (typeof q === 'string' && /^\d{4,8}$/.test(q)) return q;
    // Also support a path form: worldguessr://party/123456
    const m = (path ?? '').match(/party\/(\d{4,8})/);
    if (m) return m[1];
  } catch {
    // Malformed URL — ignore.
  }
  return null;
}

export function useDeepLinkInvite() {
  const url = Linking.useURL(); // initial launch URL + any while foregrounded
  const verified = useMultiplayerStore((s) => s.verified);
  const inGame = useMultiplayerStore((s) => s.inGame);
  const pendingRef = useRef<string | null>(null);

  const join = (code: string): boolean => {
    const st = useMultiplayerStore.getState();
    if (st.verified && !st.inGame) {
      st.joinPrivateGame(code);
      return true;
    }
    return false;
  };

  // New URL arrived — join now if the socket is ready, otherwise stash it.
  useEffect(() => {
    const code = extractPartyCode(url);
    if (code && !join(code)) {
      pendingRef.current = code;
    }
  }, [url]);

  // Socket became ready (and we're free) — consume a stashed invite.
  useEffect(() => {
    if (verified && !inGame && pendingRef.current) {
      const code = pendingRef.current;
      pendingRef.current = null;
      useMultiplayerStore.getState().joinPrivateGame(code);
    }
  }, [verified, inGame]);
}
