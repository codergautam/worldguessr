import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../components/utils/audio.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');

function audio() {
  const gains = [];
  class AudioContext {
    currentTime = 0;
    destination = {};
    createGain() {
      const gain = { value: 1, setTargetAtTime: vi.fn() };
      gains.push(gain);
      return { gain, connect: vi.fn() };
    }
  }
  const context = vm.createContext({
    window: { AudioContext }, navigator: {}, console,
    gameStorage: { getItem: () => null }, asset: (path) => path,
  });
  vm.runInContext(source, context);
  return { context, gains };
}

describe('platform mute before the first audio interaction', () => {
  it('creates the first master gain muted if the platform already disabled sound', () => {
    const { context, gains } = audio();
    context.duckAudio(true);
    context.ensureContext();
    expect(gains[0].value).toBe(0);
    context.duckAudio(false);
    expect(gains[0].setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.05);
  });

  it('preserves ordinary playback and remembers a pre-interaction unmute', () => {
    const { context, gains } = audio();
    context.duckAudio(true);
    context.duckAudio(false);
    context.ensureContext();
    expect(gains[0].value).toBe(1);
  });
});
