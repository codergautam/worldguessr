// When the quiz card docks at the bottom instead of standing beside the
// globe: phones, and portrait tablets (a side card there leaves a planet a
// third of the screen wide). styles/quiz.css uses the same query.
export const DOCK_QUERY = '(max-width: 600px), (max-width: 1024px) and (orientation: portrait)';

// The globe's free area when the card docks at the bottom: above the card,
// and below the navbar, plus the Round box under it unless the planet
// (height-bound on a short screen) fits beside that box with room to spare.
export function dockedInsets(host, panel) {
  const bottom = Math.max(0, host.clientHeight - panel.offsetTop);
  const short = (host.clientHeight - 56 - bottom) * 0.98 < host.clientWidth - 300;
  return { top: short ? 56 : 104, right: 0, bottom, left: 0 };
}

export function isDocked() {
  return typeof window !== 'undefined' && !!window.matchMedia?.(DOCK_QUERY).matches;
}
