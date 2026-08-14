// Queue ETA formatter shared by web and React Native. The server estimate is
// a total wait, not a countdown, so this only decides how much precision the
// label should expose.
export function formatQueueEta(text, seconds) {
  if (typeof text !== 'function' || !Number.isFinite(seconds) || seconds < 0) return null;

  const wholeSeconds = Math.round(seconds);
  if (wholeSeconds < 60) {
    return text('queueEtaSeconds', { v: wholeSeconds });
  }
  if (wholeSeconds <= 10 * 60) {
    return text('queueEtaMinutesSeconds', {
      m: Math.floor(wholeSeconds / 60),
      s: wholeSeconds % 60,
    });
  }
  return text('queueEtaMinutes', { v: Math.round(wholeSeconds / 60) });
}
