import { describe, it, expect } from 'vitest';
import { maskPlaceholders, unmaskPlaceholders } from '../scripts/translationPlaceholders.cjs';

// The masking pair is what stands between Google Translate and every {{var}}
// in every locale file. A false "ok" here ships a string that interpolates the
// wrong runtime value (or none), so the properties below are about when the
// checker is allowed to say yes — not about formatting.

describe('maskPlaceholders', () => {
  it('masks each placeholder with its own indexed token', () => {
    const { masked, placeholders } = maskPlaceholders('Page {{page}} of {{pages}}');
    expect(masked).toBe('Page xphx0xphx of xphx1xphx');
    expect(placeholders).toEqual(['page', 'pages']);
  });

  it('trims interior whitespace so {{ name }} restores as {{name}}', () => {
    const { masked, placeholders } = maskPlaceholders('Hi {{ name }}');
    const { out, ok } = unmaskPlaceholders(masked, placeholders);
    expect(ok).toBe(true);
    expect(out).toBe('Hi {{name}}');
  });

  it('gives repeated same-name placeholders distinct tokens', () => {
    const { masked, placeholders } = maskPlaceholders('{{n}} vs {{n}}');
    expect(masked).toBe('xphx0xphx vs xphx1xphx');
    expect(placeholders).toEqual(['n', 'n']);
  });
});

describe('unmaskPlaceholders', () => {
  it('round-trips a translated string with reordered tokens', () => {
    const { placeholders } = maskPlaceholders('Slot {{n}}: {{name}}');
    // Word order legitimately moves in translation; only the token multiset is pinned.
    const { out, ok } = unmaskPlaceholders('xphx1xphx — Platz xphx0xphx', placeholders);
    expect(ok).toBe(true);
    expect(out).toBe('{{name}} — Platz {{n}}');
  });

  it('rejects a duplicated token that hides a dropped one', () => {
    // The exact case the per-index count exists for: totals match (2 tokens in,
    // 2 tokens out) but the translation would interpolate {{page}} twice and
    // {{pages}} never.
    const { placeholders } = maskPlaceholders('Page {{page}} of {{pages}}');
    const { ok } = unmaskPlaceholders('Seite xphx0xphx von xphx0xphx', placeholders);
    expect(ok).toBe(false);
  });

  it('rejects an out-of-range token', () => {
    const { placeholders } = maskPlaceholders('Hi {{name}}');
    const { ok } = unmaskPlaceholders('Hi xphx0xphx xphx7xphx', placeholders);
    expect(ok).toBe(false);
  });

  it('rejects a dropped token', () => {
    const { placeholders } = maskPlaceholders('Page {{page}} of {{pages}}');
    const { ok } = unmaskPlaceholders('Seite xphx0xphx', placeholders);
    expect(ok).toBe(false);
  });

  it('rejects a token the translator split so it can no longer be restored', () => {
    const { placeholders } = maskPlaceholders('Hi {{name}}');
    const { out, ok } = unmaskPlaceholders('Hi xphx0 xphx', placeholders);
    expect(ok).toBe(false);
    // The mangled remnant stays in the text; ok=false is what keeps it out of the file.
    expect(out).toContain('xphx0 xphx');
  });

  it('restores case-mangled tokens', () => {
    const { placeholders } = maskPlaceholders('Hi {{name}}');
    const { out, ok } = unmaskPlaceholders('Hi XPHX0XPHX', placeholders);
    expect(ok).toBe(true);
    expect(out).toBe('Hi {{name}}');
  });

  it('is not poisoned by the shared regex state across calls', () => {
    // PH_TOKEN_RE is a module-level /g/i regex; .test() advances lastIndex.
    // Two identical calls must agree, and a failing call must not make the
    // next passing call fail (or vice versa).
    const { placeholders } = maskPlaceholders('Page {{page}} of {{pages}}');
    const bad = unmaskPlaceholders('Seite xphx0xphx von xphx0xphx', placeholders);
    const good1 = unmaskPlaceholders('Seite xphx0xphx von xphx1xphx', placeholders);
    const good2 = unmaskPlaceholders('Seite xphx0xphx von xphx1xphx', placeholders);
    expect(bad.ok).toBe(false);
    expect(good1.ok).toBe(true);
    expect(good2).toEqual(good1);
  });

  it('passes a string with no placeholders untouched', () => {
    const { masked, placeholders } = maskPlaceholders('Start Dueling');
    const { out, ok } = unmaskPlaceholders(masked, placeholders);
    expect(ok).toBe(true);
    expect(out).toBe('Start Dueling');
  });
});
