// A singleplayer quiz run's keeping: the best total per mode (this device)
// and the storeGame save for signed-in players. QuizGame and QuizFind both
// finish runs through here.

import gameStorage from '../utils/localStorage';

const bestKey = (mode) => `wg_quiz_best_${mode}`;

export function readBest(mode) {
  const v = parseInt(gameStorage.getItem(bestKey(mode)) || '0', 10);
  return Number.isFinite(v) ? v : 0;
}

export function saveBest(mode, total) {
  if (total <= readBest(mode)) return;
  try { gameStorage.setItem(bestKey(mode), String(total)); } catch {}
}

// `history`: the run's round records (lat/long, guessLat/guessLong, points,
// timeTaken, xpEarned, and the quiz fields from quizRoundFields).
export function postRun({ session, spec, region, history }) {
  if (!session?.token?.secret || !history.length || typeof window === 'undefined' || !window.cConfig?.apiUrl) return;
  fetch(window.cConfig.apiUrl + '/api/storeGame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: session.token.secret,
      official: true,
      location: 'all',
      mode: spec.id,
      region: spec.supportsRegion ? region : undefined,
      rounds: history.map((h) => ({
        lat: h.guessLat, long: h.guessLong, actualLat: h.lat, actualLong: h.long, panoId: null,
        usedHint: false, maxDist: 20000, roundTime: h.timeTaken, xp: h.xpEarned, points: h.points,
        country: h.country, mode: h.mode, lang: h.lang, text: h.text, choices: h.choices, label: h.label, image: h.image, choice: h.choice,
      })),
    }),
  }).catch((e) => console.error(e));
}
