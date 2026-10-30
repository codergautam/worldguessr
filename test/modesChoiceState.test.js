// components/modes/ChoiceButtons.js choiceState: the verdict each answer
// button shows before and after the reveal.
//
// The file is JSX in a .js module, which Vite does not parse, so this compiles
// the real source with Next's bundled Babel (same recipe as
// playgamaBootstrap.test.js) and reads choiceState out of it.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');
const reactPreset = require('next/dist/compiled/babel/preset-react');

const source = readFileSync(new URL('../components/modes/ChoiceButtons.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export default function', 'function')
  .replace('export function choiceState', 'function choiceState');
const code = transformSync(`${source}\nthis.choiceState = choiceState;`, {
  presets: [[reactPreset, { runtime: 'classic' }]], babelrc: false, configFile: false,
}).code;
const sandbox = { React: {}, useEffect: () => {}, useState: () => [] };
runInNewContext(code, sandbox);
const { choiceState } = sandbox;

const correct = 'fr';

describe('choiceState before the reveal', () => {
  it('is idle when nothing is picked', () => {
    expect(choiceState({ choice: 'fr', correct, picked: null, revealed: false })).toBe('idle');
    expect(choiceState({ choice: 'es', correct, picked: undefined, revealed: false })).toBe('idle');
  });

  it('marks only the picked button, right or wrong, without a verdict', () => {
    expect(choiceState({ choice: 'fr', correct, picked: 'fr', revealed: false })).toBe('picked');
    expect(choiceState({ choice: 'es', correct, picked: 'es', revealed: false })).toBe('picked');
    expect(choiceState({ choice: 'fr', correct, picked: 'es', revealed: false })).toBe('idle');
    expect(choiceState({ choice: 'de', correct, picked: 'es', revealed: false })).toBe('idle');
  });
});

describe('choiceState after the reveal', () => {
  it('shows the right answer as correct whether or not it was picked', () => {
    expect(choiceState({ choice: 'fr', correct, picked: 'fr', revealed: true })).toBe('correct');
    expect(choiceState({ choice: 'fr', correct, picked: 'es', revealed: true })).toBe('correct');
    expect(choiceState({ choice: 'fr', correct, picked: null, revealed: true })).toBe('correct');
  });

  it('shows a wrong pick as wrong', () => {
    expect(choiceState({ choice: 'es', correct, picked: 'es', revealed: true })).toBe('wrong');
  });

  it('dims every other button', () => {
    expect(choiceState({ choice: 'de', correct, picked: 'es', revealed: true })).toBe('dim');
    expect(choiceState({ choice: 'de', correct, picked: 'fr', revealed: true })).toBe('dim');
    expect(choiceState({ choice: 'de', correct, picked: null, revealed: true })).toBe('dim');
  });
});
