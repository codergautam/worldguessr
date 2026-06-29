import { SITE_URL } from '../../constants/config';

/**
 * Build the shareable party invite link.
 *
 * Mirrors the web `getPartyLink` (components/playerList.js): a private game's
 * 6-digit code becomes `<site>/?party=<code>`. Opening it on the web joins the
 * party via the `?party=` query param; the in-app deep-link handler
 * (src/hooks/useDeepLinkInvite.ts) parses the same `?party=` from both this
 * https URL and the `worldguessr://` custom scheme.
 */
export function getPartyLink(code: string | number): string {
  return `${SITE_URL}/?party=${code}`;
}
