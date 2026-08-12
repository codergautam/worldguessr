import { describe, expect, it } from 'vitest';
import SavedGame from '../models/Game.js';
import { cosmeticsForSavedPlayer } from '../serverUtils/userCosmetics.js';
import ActiveGame from '../ws/classes/Game.js';

describe('saved game cosmetics', () => {
  it('keeps the match-time marker instead of a later account selection', () => {
    expect(cosmeticsForSavedPlayer(
      { nameGlow: 'glow_blaze', markerSkin: 'marker_prism' },
      { nameGlow: 'glow_shadow', markerSkin: 'marker_shadow' },
    )).toEqual({
      nameGlow: 'glow_blaze',
      markerSkin: 'marker_prism',
    });
  });

  it('treats an explicit null as a frozen unequip', () => {
    expect(cosmeticsForSavedPlayer(
      { nameGlow: null, markerSkin: null },
      { nameGlow: 'glow_blaze', markerSkin: 'marker_prism' },
    )).toEqual({ nameGlow: null, markerSkin: null });
  });

  it('falls back to current equipment only for legacy documents', () => {
    expect(cosmeticsForSavedPlayer(
      { username: 'Legacy player' },
      { nameGlow: 'glow_shadow', markerSkin: 'marker_shadow' },
    )).toEqual({
      nameGlow: 'glow_shadow',
      markerSkin: 'marker_shadow',
    });
  });

  it('persists both cosmetic slots in the Game player schema', () => {
    const doc = new SavedGame({
      gameId: '2v2_cosmetics_schema_test',
      gameType: '2v2',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      endedAt: new Date('2026-01-01T00:05:00.000Z'),
      totalDuration: 300,
      rounds: [],
      players: [{
        playerId: 'p1',
        username: 'Player 1',
        totalPoints: 5000,
        finalRank: 1,
        nameGlow: 'glow_blaze',
        markerSkin: 'marker_prism',
      }],
      result: { maxPossiblePoints: 5000 },
    }).toObject();

    expect(doc.players[0]).toMatchObject({
      nameGlow: 'glow_blaze',
      markerSkin: 'marker_prism',
    });
  });
});

describe('active game cosmetic snapshots', () => {
  it('keeps a departed player and their cosmetics through restart recovery', () => {
    const game = new ActiveGame('restart_cosmetics_test', { public: true, teamDuel: true });
    game.players = {
      live: {
        id: 'live', username: 'Live', accountId: 'account-live', countryCode: 'US',
        team: 'a', score: 3123, nameGlow: 'glow_blaze', markerSkin: 'marker_sky_pin',
      },
    };
    game.persistentPlayerData = {
      left: {
        username: 'Left', accountId: 'account-left', countryCode: 'GB',
        team: 'b', score: 1800, initialScore: 5000,
        nameGlow: 'glow_shadow', markerSkin: 'marker_rainbow_pin',
      },
    };

    const restored = ActiveGame.fromJSON(JSON.parse(JSON.stringify(game)));
    const roster = new Map(restored.getFinalRoster().map((player) => [player.id, player]));

    expect(roster.get('left')).toMatchObject({
      nameGlow: 'glow_shadow',
      markerSkin: 'marker_rainbow_pin',
    });
    expect(roster.get('live')).toMatchObject({
      nameGlow: 'glow_blaze',
      markerSkin: 'marker_sky_pin',
    });
  });

  it('backfills the durable roster when restoring a legacy snapshot', () => {
    const game = new ActiveGame('legacy_restart_cosmetics_test', { public: true, teamDuel: true });
    game.players = {
      player: {
        id: 'player', username: 'Player', accountId: 'account-player', countryCode: 'US',
        team: 'a', score: 2500, nameGlow: 'glow_blaze', markerSkin: 'marker_sky_pin',
      },
    };

    const legacySnapshot = { ...game.toJSON(), persistentPlayerData: undefined };
    const restored = ActiveGame.fromJSON(legacySnapshot);

    expect(restored.persistentPlayerData.player).toMatchObject({
      score: 2500,
      nameGlow: 'glow_blaze',
      markerSkin: 'marker_sky_pin',
    });
  });

  it('freezes cosmetics when a team-party match starts', () => {
    const game = new ActiveGame('team_party_cosmetics_test', { rounds: 0 });
    game.teamGame = true;
    game.locations = [];
    game.players = {
      a: {
        id: 'a', username: 'A', accountId: 'account-a', countryCode: 'US',
        team: 'a', score: 0, host: true,
        nameGlow: 'glow_blaze', markerSkin: 'marker_sky_pin',
      },
      b: {
        id: 'b', username: 'B', accountId: 'account-b', countryCode: 'GB',
        team: 'b', score: 0,
        nameGlow: 'glow_shadow', markerSkin: 'marker_rainbow_pin',
      },
    };

    game.start();

    expect(game.persistentPlayerData.a).toMatchObject({
      nameGlow: 'glow_blaze',
      markerSkin: 'marker_sky_pin',
    });
    expect(game.persistentPlayerData.b).toMatchObject({
      nameGlow: 'glow_shadow',
      markerSkin: 'marker_rainbow_pin',
    });
  });
});
