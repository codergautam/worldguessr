// Single home for party invite-link helpers. Every surface that shares a
// lobby copies the same thing: a joinable link (not a raw code).

// CoolMath embeds can't open external links → share the raw code there;
// CrazyGames uses its SDK invite link; everywhere else a ?party= URL.
export function getPartyLink(code, inCrazyGames) {
  if (process.env.NEXT_PUBLIC_COOLMATH === "true") {
    return code;
  }
  if (inCrazyGames) {
    try {
      const link = window.CrazyGames.SDK.game.showInviteButton({ code });
      if (link) return link;
    } catch (e) {}
  }
  const domain = process.env.NEXT_PUBLIC_DOMAIN || window.location.origin;
  return `${domain}?party=${code}`;
}

export async function copyToClipboard(text) {
  // Prefer the modern Clipboard API when available.
  if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {}
  }

  // Fallback for browsers/environments where clipboard API is unavailable.
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (e) {
      copied = false;
    }

    document.body.removeChild(textarea);
    return copied;
  }

  return false;
}

// Copy the shareable invite link for a lobby code; returns whether it copied.
export async function copyPartyLink(code, inCrazyGames) {
  return copyToClipboard(String(getPartyLink(code, inCrazyGames)));
}
