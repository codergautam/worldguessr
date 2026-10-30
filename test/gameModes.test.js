// ws/classes/Game.js with a quiz mode set: scoring goes through Game.scoreFor
// (shared/modes/score.js), rounds come from the shared generator, and the
// persisted shape only grows for quiz games. Plain-object rosters as in
// test/gameCosmetics.test.js; nothing here touches a socket or Mongo (save()
// is spied).
import { describe, it, expect, vi, afterEach } from 'vitest';
import ActiveGame from '../ws/classes/Game.js';
import SavedGame from '../models/Game.js';
import calcPoints from '../components/calcPoints.js';
import { QUIZ_COUNTRY_BY_CODE } from '../shared/modes/data/countries.js';
import { QUIZ_LANGUAGE_BY_ID } from '../shared/modes/data/languages.js';
import { pointsForDistance, haversineKm } from '../shared/modes/score.js';

const FR = QUIZ_COUNTRY_BY_CODE.FR;
const flagsRound = { mode: 'flags', country: 'FR', lat: FR.lat, long: FR.long };
const PARIS = [48.8566, 2.3522];
const ATLANTIC = [30, -40];

function roster(players) {
  const out = {};
  for (const p of players) {
    out[p.id] = { username: p.id.toUpperCase(), accountId: null, countryCode: null, score: 0, host: p.id === 'a', ...p };
  }
  return out;
}

function liveGame({ mode = 'flags', players, locations = [flagsRound], teamGame = false, teamScoring = 'closest' } = {}) {
  const game = new ActiveGame(`quiz_${mode}_test`, { rounds: locations.length });
  game.mode = mode;
  game.teamGame = teamGame;
  game.teamScoring = teamScoring;
  if (teamGame) game.teamScores = { a: 0, b: 0 };
  game.locations = locations;
  game.players = roster(players);
  game.state = 'guess';
  game.curRound = 1;
  game.startTime = Date.now() - 60_000;
  game.nextEvtTime = Date.now() + 20_000;
  game.roundStartTimes[1] = Date.now() - 4_000;
  // No sockets behind these roster entries: the broadcast helpers would reap
  // them as dead. Nothing here asserts on messages.
  game.sendAllPlayers = () => {};
  game.sendTeam = () => {};
  return game;
}

describe('flags scoring through Game.scoreFor', () => {
  it('free-for-all: inside the country is 5000, a miss is distance to the label point at missMaxDist', () => {
    const game = liveGame({ players: [{ id: 'a', guess: PARIS, final: true }, { id: 'b', guess: ATLANTIC, final: true }] });
    game.givePoints();
    game.saveRoundToHistory();

    const missPts = pointsForDistance(haversineKm(FR.lat, FR.long, ...ATLANTIC), 5000);
    expect(game.players.a.score).toBe(5000);
    expect(game.players.b.score).toBe(missPts);
    expect(missPts).toBeGreaterThan(0);
    expect(missPts).toBeLessThan(5000);

    const [round] = game.roundHistory;
    expect(round.location).toEqual(flagsRound);
    expect(round.players.a.points).toBe(5000);
    expect(round.players.b.points).toBe(missPts);
    expect(round.players.a).not.toHaveProperty('choice');
    expect(game.lastRoundPoints).toEqual({ round: 1, points: { a: 5000, b: missPts } });
    expect(game.getSendableState().roundPoints).toEqual(game.lastRoundPoints);
  });

  it('team party, closest: the team banks its best member and the classic duplicate branches agree', () => {
    const game = liveGame({
      teamGame: true,
      players: [
        { id: 'a', team: 'a', guess: PARIS, final: true },
        { id: 'b', team: 'a', guess: ATLANTIC, final: true },
        { id: 'c', team: 'b', guess: ATLANTIC, final: true },
      ],
    });
    game.givePoints();
    const missPts = pointsForDistance(haversineKm(FR.lat, FR.long, ...ATLANTIC), 5000);
    expect(game.teamScores).toEqual({ a: 5000, b: missPts });
    expect(game.lastRoundTeamScores.scores).toEqual({ a: 5000, b: missPts });
  });

  it('team party, average: members who did not guess count in the denominator', () => {
    const game = liveGame({
      teamGame: true,
      teamScoring: 'average',
      players: [
        { id: 'a', team: 'a', guess: PARIS, final: true },
        { id: 'b', team: 'a', guess: null },
        { id: 'c', team: 'b', guess: PARIS, final: true },
      ],
    });
    game.givePoints();
    expect(game.teamScores).toEqual({ a: 2500, b: 5000 });
  });

  it('a player with no guess scores 0 and lands in roundPoints', () => {
    const game = liveGame({ players: [{ id: 'a', guess: null }] });
    game.givePoints();
    game.saveRoundToHistory();
    expect(game.players.a.score).toBe(0);
    expect(game.lastRoundPoints.points).toEqual({ a: 0 });
  });
});

describe('classic stays byte-identical', () => {
  const loc = { lat: 48.8584, long: 2.2945, country: 'FR', panoId: 'abc' };
  it('scores with calcPoints and writes no quiz keys', () => {
    const game = liveGame({ mode: 'classic', locations: [loc], players: [{ id: 'a', guess: PARIS, final: true }, { id: 'b', guess: null }] });
    game.givePoints();
    game.saveRoundToHistory();
    const expected = calcPoints({ lat: loc.lat, lon: loc.long, guessLat: PARIS[0], guessLon: PARIS[1], usedHint: false, maxDist: 20000 });
    expect(game.players.a.score).toBe(expected);
    expect(game.lastRoundPoints).toBeNull();
    expect(game.getSendableState()).not.toHaveProperty('roundPoints');
    expect(game.getSendableState().mode).toBe('classic');

    const [round] = game.roundHistory;
    expect(Object.keys(round.players.a).sort()).toEqual(['countryCode', 'final', 'lat', 'long', 'points', 'timeTaken', 'username']);

    const docs = game.buildRoundDocs([{ id: 'a', username: 'A' }, { id: 'b', username: 'B' }]);
    expect(Object.keys(docs[0].location).sort()).toEqual(['country', 'lat', 'long', 'panoId', 'place']);
    expect(docs[0].playerGuesses[0]).not.toHaveProperty('choice');
    const settings = game.buildSettingsDoc(false);
    expect(settings.mode).toBe('classic');
    expect(settings.region).toBeNull();
  });
});

describe('snapshot round-trip', () => {
  it('keeps mode, region, rounds, choices and lastRoundPoints across toJSON/fromJSON', () => {
    const game = liveGame({ players: [{ id: 'a', guess: PARIS, final: true, choice: null }] });
    game.region = 'Europe';
    game.givePoints();
    game.saveRoundToHistory();
    const restored = ActiveGame.fromJSON(JSON.parse(JSON.stringify(game)));
    expect(restored.mode).toBe('flags');
    expect(restored.region).toBe('Europe');
    expect(restored.locations).toEqual([flagsRound]);
    expect(restored.lastRoundPoints).toEqual(game.lastRoundPoints);
    expect(restored.roundHistory).toEqual(game.roundHistory);
  });

  it('an old snapshot without mode restores as classic', () => {
    const game = liveGame({ mode: 'classic', players: [{ id: 'a' }] });
    const json = JSON.parse(JSON.stringify(game));
    delete json.mode;
    delete json.region;
    const restored = ActiveGame.fromJSON(json);
    expect(restored.mode).toBe('classic');
    expect(restored.region).toBe('all');
  });
});

describe('quiz round generation inside Game', () => {
  it('fills locations synchronously from the shared generator', async () => {
    const game = new ActiveGame('gen_test', { rounds: 7 });
    game.mode = 'flags';
    game.region = 'Asia';
    game.players = roster([{ id: 'a' }]);
    await game.generateLocations(null);
    expect(game.locations).toHaveLength(7);
    expect(game.maxDist).toBe(20000);
    expect(game.extent).toBeNull();
    for (const loc of game.locations) {
      expect(loc.mode).toBe('flags');
      expect(QUIZ_COUNTRY_BY_CODE[loc.country].continent).toBe('Asia');
    }
  });
});

describe('choice modes', () => {
  function languagesGame() {
    const lang = QUIZ_LANGUAGE_BY_ID.fr;
    const round = {
      mode: 'languages', country: 'FR', lat: FR.lat, long: FR.long,
      lang: 'fr', text: lang.text, choices: ['fr', 'it', 'es', 'pt', 'ro', 'de'], spokenIn: lang.spokenIn,
    };
    return liveGame({ mode: 'languages', locations: [round], players: [{ id: 'a' }, { id: 'b' }] });
  }

  it('setChoice validates against the round and lands as a [lat, lng] guess plus the id', () => {
    const game = languagesGame();
    game.setChoice('a', 'zz', true, 1);
    expect(game.players.a.guess).toBeUndefined();
    game.setChoice('a', 'fr', true, 1);
    expect(game.players.a.guess).toEqual([FR.lat, FR.long]);
    expect(game.players.a.choice).toBe('fr');
    expect(game.players.a.final).toBe(true);
    expect(game.players.a.roundTimeTakenMs).toBeGreaterThan(0);

    game.setChoice('b', 'it', true, 1);
    game.givePoints();
    game.saveRoundToHistory();
    expect(game.players.a.score).toBeGreaterThanOrEqual(2500);
    expect(game.players.a.score).toBeLessThanOrEqual(5000);
    expect(game.players.b.score).toBe(0);
    expect(game.roundHistory[0].players.a.choice).toBe('fr');
    expect(game.roundHistory[0].players.b.choice).toBe('it');
    // Sub-second answers keep their real time (the floored-seconds clock would say "full time").
    expect(game.roundHistory[0].players.a.timeTaken).toBeCloseTo(game.players.a.roundTimeTakenMs / 1000, 3);

    const docs = game.buildRoundDocs([{ id: 'a' }, { id: 'b' }]);
    expect(docs[0].location).toMatchObject({ mode: 'languages', lang: 'fr', choices: ['fr', 'it', 'es', 'pt', 'ro', 'de'] });
    expect(docs[0].playerGuesses[0].choice).toBe('fr');
    expect(docs[0].playerGuesses[1].choice).toBe('it');
  });

  it('setChoice is ignored in map-input modes', () => {
    const game = liveGame({ players: [{ id: 'a' }] });
    game.setChoice('a', 'fr', true, 1);
    expect(game.players.a.guess).toBeUndefined();
  });

  it('clearGuesses resets the choice and the ms clock', () => {
    const game = languagesGame();
    game.setChoice('a', 'fr', true, 1);
    game.clearGuesses();
    expect(game.players.a.choice).toBeNull();
    expect(game.players.a.roundTimeTakenMs).toBeNull();
    expect(game.players.a.guess).toBeNull();
  });
});

describe('party save', () => {
  afterEach(() => vi.restoreAllMocks());

  it('persists mode, region, the quiz location fields and choices through mongoose strict mode', async () => {
    let saved = null;
    vi.spyOn(SavedGame.prototype, 'save').mockImplementation(async function save() { saved = this.toObject(); });

    const game = languagesPartyAfterOneRound();
    await game.saveUnrankedMultiplayerToMongoDB();

    expect(saved).not.toBeNull();
    expect(saved.gameType).toBe('private_multiplayer');
    expect(saved.settings.mode).toBe('languages');
    expect(saved.settings.region).toBeNull();
    expect(saved.settings.location).toBe('all');
    expect(saved.result.maxPossiblePoints).toBe(5000);
    expect(saved.rounds[0].location).toMatchObject({ lat: FR.lat, long: FR.long, country: 'FR', mode: 'languages', lang: 'fr' });
    expect(saved.rounds[0].location.choices).toEqual(['fr', 'it', 'es', 'pt', 'ro', 'de']);
    const guesses = saved.rounds[0].playerGuesses;
    expect(guesses.find((g) => g.playerId === 'a').choice).toBe('fr');
    expect(guesses.find((g) => g.playerId === 'b')).not.toHaveProperty('choice');
    // Parties never award XP, quiz or not.
    expect(saved.players.every((p) => p.totalXp === 0)).toBe(true);
  });

  function languagesPartyAfterOneRound() {
    const lang = QUIZ_LANGUAGE_BY_ID.fr;
    const round = {
      mode: 'languages', country: 'FR', lat: FR.lat, long: FR.long,
      lang: 'fr', text: lang.text, choices: ['fr', 'it', 'es', 'pt', 'ro', 'de'], spokenIn: lang.spokenIn,
    };
    const game = liveGame({ mode: 'languages', locations: [round], players: [{ id: 'a' }, { id: 'b' }] });
    game.code = '123456';
    game.setChoice('a', 'fr', true, 1);
    game.givePoints();
    game.saveRoundToHistory();
    game.state = 'end';
    game.endTime = Date.now();
    return game;
  }
});
