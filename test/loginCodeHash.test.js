import { describe, it, expect } from 'vitest';
import { hashLoginCode, codeMatches } from '../serverUtils/loginCodeHash.js';

describe('loginCodeHash', () => {
  const id = 'a'.repeat(32);

  it('is stable, hex, and salted by the loginId', () => {
    expect(hashLoginCode(id, '123456')).toBe(hashLoginCode(id, '123456'));
    expect(hashLoginCode(id, '123456')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashLoginCode(id, '123456')).not.toBe(hashLoginCode('b'.repeat(32), '123456'));
  });

  it('matches the right code for the right loginId only', () => {
    const stored = hashLoginCode(id, '123456');
    expect(codeMatches(id, '123456', stored)).toBe(true);
    expect(codeMatches(id, '123457', stored)).toBe(false);
    expect(codeMatches('b'.repeat(32), '123456', stored)).toBe(false);
  });

  it('never throws on a malformed stored hash', () => {
    expect(codeMatches(id, '123456', null)).toBe(false);
    expect(codeMatches(id, '123456', 'zz')).toBe(false);
    expect(codeMatches(id, '123456', 'g'.repeat(64))).toBe(false);
  });
});
