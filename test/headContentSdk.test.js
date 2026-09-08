import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// Execute the real mount effect without importing the component's JSX/Next
// rendering dependencies. No scripts are fetched by this document fixture.
const source = readFileSync(new URL('../components/headContent.js', import.meta.url), 'utf8');
const effectStart = source.indexOf('  useEffect(() => {');
const effectEnd = source.indexOf('  }, []);', effectStart) + '  }, []);'.length;
const effect = source.slice(effectStart, effectEnd);

function mountSdkEffect(env = {}, search = '') {
  const scripts = [];
  const listeners = [];
  const loadPlaygamaBridge = vi.fn();
  const loadRampScript = vi.fn();
  const document = {
    readyState: 'loading',
    createElement: () => ({}),
    body: { appendChild: (script) => scripts.push(script), removeChild: vi.fn() },
    getElementById: () => null,
    getElementsByTagName: () => [{ parentNode: { insertBefore: (script) => scripts.push(script) } }],
  };
  vm.runInNewContext(effect, {
    useEffect: (callback) => callback(),
    process: { env },
    window: {
      location: { search },
      addEventListener: (event) => listeners.push(event),
      removeEventListener: vi.fn(),
      matchMedia: () => ({ matches: false }),
    },
    document,
    loadPlaygamaBridge,
    loadRampScript,
    preloadRampScript: vi.fn(),
    console: { log: vi.fn() },
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
  });
  return { scripts, listeners, loadPlaygamaBridge, loadRampScript };
}

describe('portal SDK selection', () => {
  it.each([
    ['', {}],
    ['?crazygames', {}],
    ['?platform=crazygames', { NEXT_PUBLIC_POKI: 'true' }],
    ['', { NEXT_PUBLIC_COOLMATH: 'true', NEXT_PUBLIC_GAMEDISTRIBUTION: 'true' }],
  ])('6x loads only Bridge for query %s and other portal flags %j', (search, otherEnv) => {
    const result = mountSdkEffect({ ...otherEnv, NEXT_PUBLIC_6X: 'true' }, search);
    expect(result.loadPlaygamaBridge).toHaveBeenCalledOnce();
    expect(result.scripts).toEqual([]);
    expect(result.listeners).toEqual([]);
    expect(result.loadRampScript).not.toHaveBeenCalled();
  });

  it('keeps the dedicated CrazyGames launch on its native SDK', () => {
    const result = mountSdkEffect({}, '?crazygames');
    expect(result.loadPlaygamaBridge).not.toHaveBeenCalled();
    expect(result.scripts.map((script) => script.src)).toEqual([
      'https://sdk.crazygames.com/crazygames-sdk-v3.js',
    ]);
  });

  it('keeps the main site ad SDK deferred until interaction', () => {
    const result = mountSdkEffect();
    expect(result.loadPlaygamaBridge).not.toHaveBeenCalled();
    expect(result.loadRampScript).not.toHaveBeenCalled();
    expect(result.scripts).toEqual([]);
    expect(result.listeners).toContain('pointerdown');
  });
});
