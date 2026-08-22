// CoolMath, Poki, GameDistribution and 6x embeds ship with no account system
// at all: the navbar login button is hidden and OAuth can't escape their
// iframe anyway. The one sanctioned way out is a new tab to the main site, and only
// on CoolMath — see ACCOUNT_SITE_URL below.
//
// GD is the strictest of the three and the reason it joined this list. Its
// build is the one that sets `ux_mode: "redirect"`, so a sign-in there
// navigated the entire page to accounts.google.com. GD forbids the game
// leaving its page at all, so login is not merely discouraged there, it is
// unshippable. See NO_EXTERNAL_LINKS in ./externalLinks.
//
// Every account-related prompt keys off this ONE constant rather than
// re-deriving `inCoolMathGames || inPoki` locally. The old per-site derivation
// is exactly how the daily-challenge sign-in CTAs shipped un-gated: each new
// surface had to remember a rule nothing enforced.
export const HIDE_ACCOUNT_UI =
  process.env.NEXT_PUBLIC_COOLMATH === "true" ||
  process.env.NEXT_PUBLIC_POKI === "true" ||
  process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true" ||
  process.env.NEXT_PUBLIC_6X === "true";

// ...with one hand-off exception. CoolMath is the only no-account build that
// can still send a player somewhere useful: it iframes worldguessr.com, and
// unlike GD it doesn't forbid leaving its page (see NO_EXTERNAL_LINKS in
// ./externalLinks). So the daily streak CTA isn't hidden there — it opens the
// main site in a new tab, where signing in actually works. Null on every other
// build, so those keep the plain HIDE_ACCOUNT_UI behaviour. Same one-constant
// rule: surfaces read this, they never re-derive the platform.
export const ACCOUNT_SITE_URL =
  process.env.NEXT_PUBLIC_COOLMATH === "true" ? "https://www.worldguessr.com" : null;

// Anchor click, NOT window.open: a gesture-driven <a target="_blank"> isn't
// popup-blocked inside the CMG iframe, whereas window.open there can be (and
// is patched out entirely on the GD build).
export function openAccountSite() {
  if (!ACCOUNT_SITE_URL || typeof document === "undefined") return;
  const a = document.createElement("a");
  a.href = ACCOUNT_SITE_URL;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// The ws server sends its gate messages as English sentences that double as
// locale keys ("sentence-as-key", so old clients still show something). Those
// sentences are written for the main site, where linking an account genuinely
// IS the answer — on a no-account build they name a thing that doesn't exist.
// Swap them for neutral copy at every render point.
const ACCOUNT_GATE_COPY = {
  "Link your Google account to play 2v2": "twovtwoUnavailableHere",
  "Link your account to play 2v2": "twovtwoUnavailableHere",
  "Log in to join this party": "partyGuestsNotAllowed",
};

// Returns a locale key to show instead of `serverMessage`, or null to let the
// server's own text through unchanged (always the case off no-account builds).
export function neutralGateKey(serverMessage) {
  if (!HIDE_ACCOUNT_UI) return null;
  return ACCOUNT_GATE_COPY[serverMessage] || null;
}
