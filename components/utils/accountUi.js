// CoolMath, Poki and GameDistribution embeds ship with no account system at
// all: the navbar login button is hidden, OAuth can't escape their iframe
// anyway, and all three partners forbid funnelling players to an off-platform
// signup.
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
  process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true";

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
