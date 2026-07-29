// GameDistribution forbids the game leaving its page: no navigations off
// origin, no new tabs, no redirect-based OAuth. They rejected our submission
// over it, so this is a hard launch requirement rather than a nicety.
//
// Every link surface keys off these constants rather than re-deriving the
// platform locally. That rule exists because the last sweep was per-surface
// and three sign-in buttons quietly kept the old behaviour: a rule nothing
// enforces is a rule that gets forgotten by the next screen. Same doctrine as
// HIDE_ACCOUNT_UI in ./accountUi.
export const NO_EXTERNAL_LINKS = process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true";

// Builds where a /user profile link must not render at all. Two different
// reasons, one behaviour: GD forbids opening tabs outright, and Poki deploys
// to a nested per-version CDN path with no /user route, so the tab it opened
// would 404.
export const NO_PROFILE_LINKS =
  NO_EXTERNAL_LINKS || process.env.NEXT_PUBLIC_POKI === "true";

// Backstop for the surfaces this sweep hasn't reached and the ones that don't
// exist yet. Capture phase, so it runs before React's own delegated handlers
// and before any component-level onClick can call window.open itself.
//
// This is deliberately a net, not the fix: every known link is also corrected
// at its source. If this fires in normal play it means a surface regressed,
// hence the console warning.
export function installExternalLinkGuard() {
  if (!NO_EXTERNAL_LINKS || typeof window === "undefined") return () => {};

  const isOffOrigin = (href) => {
    try {
      return new URL(href, window.location.href).origin !== window.location.origin;
    } catch (e) {
      // Unparseable href: treat mailto:/tel:/javascript: as leaving too.
      return true;
    }
  };

  const onClick = (e) => {
    const anchor = e.target?.closest?.("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    // Off-origin always blocks. Same-origin blocks only when it would spawn a
    // tab: in-game navigation to our own routes is how the menus work.
    if (!isOffOrigin(href) && anchor.target !== "_blank") return;
    e.preventDefault();
    e.stopPropagation();
    console.warn("[GD] blocked outgoing link, fix this at the source:", href);
  };
  document.addEventListener("click", onClick, true);

  // window.open bypasses the anchor path entirely (share buttons, map links).
  const nativeOpen = window.open;
  window.open = function blockedOpen(url) {
    console.warn("[GD] blocked window.open, fix this at the source:", url);
    return null;
  };

  return () => {
    document.removeEventListener("click", onClick, true);
    window.open = nativeOpen;
  };
}
