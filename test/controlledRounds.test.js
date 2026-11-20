import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ rows: [], afterRead: null }));
vi.mock('../models/ControlledRound.js', () => {
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) =>
    key === 'expiresAt' ? row.expiresAt > value.$gt : row[key] === value);
  return { default: {
    create: async (row) => { db.rows.push({ ...row, status: 'open', revision: 0, hintUsed: false }); },
    findOne: (filter) => ({ lean: async () => {
      const row = db.rows.find((r) => matches(r, filter));
      const snapshot = row && structuredClone(row);
      if (db.afterRead) await db.afterRead();
      return snapshot;
    } }),
    findOneAndUpdate: (filter, update) => ({ lean: async () => {
      const row = db.rows.find((r) => matches(r, filter));
      if (!row) return null;
      Object.assign(row, update.$set);
      row.revision += update.$inc.revision;
      return structuredClone(row);
    } }),
  } };
});

import { createControlledRound, guessControlledRound, replaceControlledRound } from '../serverUtils/controlledRounds.js';

const base = { ownerId: 'owner', gameId: 'game', mode: 'moving' };
const answer = { lat: 12.34567, lng: -76.54321 };
async function round() {
  const publicRound = await createControlledRound({ ...base, answer, maxDist: 20000, expiresAt: new Date(Date.now() + 60000) });
  return { ...base, ...publicRound };
}

beforeEach(() => { db.rows = []; db.afterRead = null; });

describe('controlled round foundation', () => {
  it('returns only an unpredictable handle and retains the answer on the server', async () => {
    const first = await round();
    const second = await round();
    expect(first.roundId).toMatch(/^[a-f0-9]{64}$/);
    expect(first.roundId).not.toBe(second.roundId);
    expect(Object.keys(first).sort()).toEqual(['gameId', 'mode', 'ownerId', 'roundId']);
    expect(JSON.stringify(first)).not.toContain(String(answer.lat));
    expect(db.rows[0].answer).toEqual(answer);
  });

  it('scores on the server and rejects duplicates, wrong owners, games, modes and expiry', async () => {
    const ctx = await round();
    for (const change of [{ ownerId: 'other' }, { gameId: 'other' }, { mode: 'other' }, { roundId: 'missing' }]) {
      expect(await guessControlledRound({ ...ctx, ...change }, answer)).toBe(false);
    }
    expect(await guessControlledRound(ctx, { lat: 0, lng: 0, score: 5000 })).toBe(true);
    expect(db.rows[0].result.score).toBeLessThan(5000);
    expect(await guessControlledRound(ctx, answer)).toBe(false);
    const expired = await round();
    db.rows[1].expiresAt = new Date(0);
    expect(await guessControlledRound(expired, answer)).toBe(false);
    expect(await replaceControlledRound(expired)).toBe(false);
  });

  it('rejects invalid coordinates and expired creation', async () => {
    const ctx = await round();
    await expect(guessControlledRound(ctx, { lat: 91, lng: 0 })).rejects.toThrow('Invalid guess');
    await expect(createControlledRound({ ...base, answer, maxDist: 20000, expiresAt: new Date(0) })).rejects.toThrow('Invalid round');
  });

  it('prevents a guess that raced with replacement or another guess from closing the old round', async () => {
    const ctx = await round();
    db.afterRead = async () => { db.afterRead = null; expect(await replaceControlledRound(ctx)).toBe(true); };
    expect(await guessControlledRound(ctx, answer)).toBe(false);
    expect(db.rows[0].status).toBe('replaced');
    expect(await replaceControlledRound(ctx)).toBe(false);

    const next = await round();
    const results = await Promise.all([guessControlledRound(next, answer), guessControlledRound(next, answer)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
