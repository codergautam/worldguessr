import { describe, it, expect } from 'vitest';
import Player from '../ws/classes/Player.js';
import { kFactor, pairK, K_NEW, K_MID, K_VET, K_NEW_UNTIL, K_MID_UNTIL } from '../components/utils/eloSystem.js';

// THE BUG THESE TESTS PIN
// -----------------------
// The v2 K schedule (40 for the first 30 rated games, 20 until 100, 10 after)
// is driven by `ratedGames`. api/eloRank.js $inc's that counter on the DOCUMENT
// for every rated game — but the matchmaker never reads the document. ws.js
// stampRatingV2() takes its K inputs off the in-memory Player object, precisely
// so pairing costs no database round trip.
//
// Player.setElo updated `elo` and `league` and nothing else, and `ratedGames`
// was only ever written at verify() and on the reconnect refresh. So the K
// factor was pinned to its login value for the entire websocket session:
//
//   - a player at 29 rated games who played 100 games in one sitting played ALL
//     of them at K_NEW (40) instead of stepping to K_MID at 31 and K_VET at 101,
//     four times the intended volatility;
//   - a migrated veteran backfilled into the settling window never reached
//     K_VET without reconnecting.
//
// Zero-sum was never at risk — pairK hands both sides the same K — but the taper
// is the whole point of the schedule.
//
// Player.setElo also fires a DB write through api/eloRank.js. There is no mongo
// connection here, that call is async with its own try/catch, and nothing below
// depends on it, so it is harmless: these assertions are purely about the
// in-memory state the matchmaker actually reads.

function ratedPlayer(ratedGames) {
  const p = new Player(null, `p-${ratedGames}`, '127.0.0.1'); // ws=null → send() no-ops
  p.accountId = 'account-under-test';
  p.ratedGames = ratedGames;
  p.elo = 800;
  return p;
}

const ratedGame = { winner: true, oldElo: 800, rated: true };

describe('Player.setElo — ratedGames advances in memory', () => {
  it('increments on a rated game', () => {
    const p = ratedPlayer(29);
    p.setElo(810, ratedGame);
    expect(p.ratedGames).toBe(30);
  });

  it('does NOT increment on an unrated game', () => {
    // Bot duels and placements book their counters through
    // Game.applyUnratedCounters (rated:false) and never reach setElo, but the
    // flag is honoured here too so a future caller cannot quietly inflate K.
    const p = ratedPlayer(10);
    p.setElo(810, { winner: true, oldElo: 800, rated: false });
    expect(p.ratedGames).toBe(10);
  });

  it('treats a missing `rated` flag as rated, matching api/eloRank.js', () => {
    const p = ratedPlayer(4);
    p.setElo(810, { winner: true, oldElo: 800 });
    expect(p.ratedGames).toBe(5);
  });

  it('starts a garbage counter from 0 rather than producing NaN', () => {
    const p = ratedPlayer(undefined);
    p.setElo(810, ratedGame);
    expect(p.ratedGames).toBe(1);

    const q = ratedPlayer('not a number');
    q.setElo(810, ratedGame);
    expect(q.ratedGames).toBe(1);
  });

  it('does nothing at all for a guest (no accountId)', () => {
    const p = ratedPlayer(3);
    p.accountId = null;
    p.setElo(810, ratedGame);
    expect(p.ratedGames).toBe(3);
  });

  it('ignores an invalid rating without burning a game off the schedule', () => {
    const p = ratedPlayer(3);
    p.setElo(NaN, ratedGame);
    expect(p.ratedGames).toBe(3);
  });
});

describe('the K schedule actually steps within one session', () => {
  it('walks K_NEW → K_MID → K_VET across a long unbroken session', () => {
    const p = ratedPlayer(0);
    const seen = [];

    // 120 games without a reconnect. Before the fix every entry here was K_NEW.
    for (let i = 0; i < 120; i++) {
      seen.push(kFactor(p.ratedGames));
      p.setElo(800, ratedGame);
    }

    expect(seen[0]).toBe(K_NEW);
    expect(seen[K_NEW_UNTIL - 1]).toBe(K_NEW);   // game 30, still new
    expect(seen[K_NEW_UNTIL]).toBe(K_MID);       // game 31, stepped
    expect(seen[K_MID_UNTIL - 1]).toBe(K_MID);   // game 100, still mid
    expect(seen[K_MID_UNTIL]).toBe(K_VET);       // game 101, settled
    expect(seen[119]).toBe(K_VET);

    expect(p.ratedGames).toBe(120);
    // The regression in one line: this used to be a flat array of 40s.
    expect(new Set(seen)).toEqual(new Set([K_NEW, K_MID, K_VET]));
  });

  it('a migrated veteran leaves the settling window without reconnecting', () => {
    // The migration backfills min(career, cap) and the cap parks veterans in
    // K_MID. They must reach K_VET through play alone.
    const p = ratedPlayer(15);
    expect(kFactor(p.ratedGames)).toBe(K_NEW);

    for (let i = 0; i < K_MID_UNTIL; i++) p.setElo(800, ratedGame);

    expect(p.ratedGames).toBe(15 + K_MID_UNTIL);
    expect(kFactor(p.ratedGames)).toBe(K_VET);
  });

  it('both sides still share one K, so the fix cannot break zero-sum', () => {
    const rookie = ratedPlayer(0);
    const vet = ratedPlayer(500);
    for (let i = 0; i < 40; i++) rookie.setElo(800, ratedGame);

    // Whatever the counters are, pairK is symmetric and identical for both.
    expect(pairK(rookie.ratedGames, vet.ratedGames)).toBe(pairK(vet.ratedGames, rookie.ratedGames));
  });
});
