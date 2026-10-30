// components/modes/languageName.js: Intl.DisplayNames first, the pool's
// English names (shared/modes/data/languages.js) when Intl is missing or only
// echoes the code back.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { languageName } from '../components/modes/languageName.js';

const realDisplayNames = Intl.DisplayNames;

afterEach(() => {
  globalThis.Intl.DisplayNames = realDisplayNames;
});

describe('languageName with Intl.DisplayNames', () => {
  it('names a language in the UI language', () => {
    expect(languageName('fr', 'en')).toBe('French');
    expect(languageName('fr', 'fr')).toBe('Français');
  });

  it('capitalizes names that Intl returns in lower case', () => {
    const name = languageName('ru', 'ru');
    expect(name.length).toBeGreaterThan(1);
    expect(name.charAt(0)).toBe(name.charAt(0).toLocaleUpperCase('ru'));
    expect(name.charAt(0)).not.toBe(name.charAt(0).toLocaleLowerCase('ru'));
  });

  it('returns an unknown code unchanged', () => {
    expect(languageName('zz', 'en')).toBe('zz');
  });
});

describe('languageName fallbacks', () => {
  it('uses the pool name when Intl.DisplayNames is missing', () => {
    globalThis.Intl.DisplayNames = undefined;
    expect(languageName('de', 'en')).toBe('German');
  });

  it('uses the pool name when Intl echoes the bare code', async () => {
    // Fresh module: displayNames() caches one formatter per UI language.
    vi.resetModules();
    globalThis.Intl.DisplayNames = class {
      of(code) { return code; }
    };
    const fresh = await import('../components/modes/languageName.js');
    expect(fresh.languageName('de', 'en')).toBe('German');
    expect(fresh.languageName('zz', 'en')).toBe('zz');
  });
});
