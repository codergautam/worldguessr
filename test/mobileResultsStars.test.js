import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const ts = require('../mobile/node_modules/typescript');
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(root + path, 'utf8');
const compile = (source) => ts.transpileModule(source, {
  fileName: 'fixture.tsx',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
function evaluate(source, globals = {}) {
  const compiledModule = { exports: {} };
  runInNewContext(compile(source), { module: compiledModule, exports: compiledModule.exports, require, __DEV__: false, ...globals });
  return compiledModule.exports;
}

// Use the installed Expo classes, including the inner class whose missing
// setNativeProps caused the crash. Only font loading and native hosts are fake.
const react = require('react');
const native = { Text: 'Text', NativeModules: {}, PixelRatio: { get: () => 1 }, processColor: (v) => v,
  Platform: { select: (v) => v.android ?? v.default } };
const iconRequire = (id) => id === 'react' ? react : id === 'react/jsx-runtime' ? require(id)
  : id === 'react-native' ? native : { __esModule: true, default: () => ({}) };
const vendor = evaluate(read('mobile/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/lib/create-icon-set.js'), { require: iconRequire });
const expo = evaluate(read('mobile/node_modules/@expo/vector-icons/build/createIconSet.js'), {
  require: (id) => id === 'expo-font' ? { isLoaded: () => true }
    : id.endsWith('/create-icon-set') ? vendor : iconRequire(id),
});
const glyphs = JSON.parse(read('mobile/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'));
const Ionicons = expo.default(glyphs, 'ionicons', 1);
function mountIcon(props) {
  const instance = new Ionicons(props);
  const inner = instance.render();
  inner.props.ref(new inner.type(inner.props));
  return instance;
}

// Execute RN's installed frame callback with production behavior: NODE_ENV=test
// deliberately bypasses setNativeProps and would conceal this regression.
const hook = read('mobile/node_modules/react-native/src/private/animated/createAnimatedPropsHook.js');
const frameStart = hook.indexOf('onUpdateRef.current = () => {');
const frameEnd = hook.indexOf('\n        };', frameStart);
if (frameStart < 0 || frameEnd < 0) throw new Error('RN animated frame callback changed; update the fixture');
const frameSource = hook.slice(frameStart + 'onUpdateRef.current = '.length, frameEnd + 10);
const fabric = evaluate(read('mobile/node_modules/react-native/Libraries/ReactNative/ReactFabricPublicInstance/ReactFabricPublicInstanceUtils.js'));
const fabricCheck = hook.slice(hook.indexOf('function isFabricInstance('));
function frameFor(instance, node) {
  return evaluate(`${fabricCheck}\nmodule.exports = ${frameSource}`, {
    instance, node, process: { env: { NODE_ENV: 'production' } },
    isFabricPublicInstance: fabric.isPublicInstance, useNativePropsInFabric: true,
    ReactNativeFeatureFlags: { cxxNativeAnimatedEnabled: () => false },
    scheduleUpdate: vi.fn(), timerRef: { current: null }, setTimeout: () => 1, clearTimeout: () => {},
  });
}

// The fixture controls scalar progress without native timers. Rendered JSX and
// the dangerous props-update path come from the actual screen and RN package.
class Scalar {
  constructor(value, driver = 'js') { this.value = value; this.driver = driver; }
  interpolate(config) { return { scalar: this, config }; }
}
function resolve(value) {
  if (value instanceof Scalar) return value.value;
  if (value?.scalar instanceof Scalar) {
    const { inputRange: input, outputRange: output } = value.config;
    let i = 0;
    while (i < input.length - 2 && value.scalar.value > input[i + 1]) i++;
    const ratio = (value.scalar.value - input[i]) / (input[i + 1] - input[i]);
    const result = parseFloat(output[i]) + (parseFloat(output[i + 1]) - parseFloat(output[i])) * ratio;
    return typeof output[i] === 'string' ? `${result}deg` : result;
  }
  if (Array.isArray(value)) return value.map(resolve);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
  return value;
}
function sources(value) {
  if (value instanceof Scalar) return [value];
  if (value?.scalar instanceof Scalar) return [value.scalar];
  return value && typeof value === 'object' ? Object.values(value).flatMap(sources) : [];
}
const children = (node) => [node?.props?.children].flat(Infinity).filter((v) => v && typeof v === 'object');
const styleOf = (node) => Object.assign({}, ...[resolve(node.props.style)].flat(Infinity).filter(Boolean));

const source = read('mobile/app/game/results.tsx');
const ast = ts.createSourceFile('results.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let starRow, starsRowStyle, lerp;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'stars.map'
      && node.arguments[0]?.parameters?.length === 2) starRow = node.parent.parent;
  if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'starsRow') starsRowStyle = node.initializer;
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'lerp') lerp = node.initializer;
  ts.forEachChild(node, visit);
}
visit(ast);
if (!starRow || !starsRowStyle || !lerp) throw new Error('Results star rendering moved; update the fixture');
const aliases = ast.statements.filter((s) => ts.isVariableStatement(s)
  && s.declarationList.declarations.some((d) => d.initializer?.getText(ast).startsWith('Animated.createAnimatedComponent')))
  .map((s) => s.getText(ast)).join('\n');

function fixture({ count = 3, height = 38, fabricHost = false } = {}) {
  const progress = new Scalar(0);
  const entrances = Array.from({ length: count }, () => new Scalar(1, 'native'));
  let glyphHeight = height;
  const setStarGlyphHeight = vi.fn((value) => { glyphHeight = value; });
  const Animated = { View: 'AnimatedView', createAnimatedComponent: (wrapped) => ({ wrapped }) };
  const renderStars = evaluate(`${aliases}\nconst styles = { starsRow: ${starsRowStyle.getText(ast)} };
    module.exports = (progress, starGlyphHeight) => { const lerp = ${lerp.getText(ast)}; return ${starRow.getText(ast)}; };`, {
    Animated, View: 'View', LinearGradient: 'Gradient', Ionicons,
    starAnims: entrances, stars: Array(count).fill('#FFD700'), spacing: { sm: 8 }, setStarGlyphHeight,
  });
  const render = (value = progress) => renderStars(value, glyphHeight);
  const tree = render();
  const bindings = [];
  function mount(node) {
    if (node.type === 'AnimatedView' || node.type.wrapped) {
      const props = { ...node.props };
      delete props.children;
      const dependencies = sources(props);
      const drivers = new Set(dependencies.map((s) => s.driver));
      expect(drivers.size, 'JS sheet values and native entrance values must have separate hosts').toBeLessThanOrEqual(1);
      const instance = node.type.wrapped ? mountIcon(resolve(props))
        : { setNativeProps: vi.fn(), ...(fabricHost ? { __nativeTag: 1 } : {}) };
      bindings.push({ dependencies, instance, frame: frameFor(instance, {
        __isNative: drivers.has('native'), __getAnimatedValue: () => resolve(props),
      }) });
    }
    children(node).forEach(mount);
  }
  mount(tree);
  return { tree, progress, entrances, bindings, setStarGlyphHeight, render,
    drag(value) { progress.value = value; bindings.filter((b) => b.dependencies.includes(progress)).forEach((b) => b.frame()); },
  };
}

function geometry(node, glyphHeight, scale = 1) {
  const style = styleOf(node);
  const totalScale = scale * (style.transform?.find((t) => t.scale != null)?.scale ?? 1);
  if (node.type === Ionicons || node.type.wrapped === Ionicons) {
    const size = resolve(node.props.size);
    return { width: size, height: glyphHeight * size / 34, painted: [size * totalScale] };
  }
  const boxes = children(node).map((child) => geometry(child, glyphHeight, totalScale));
  return {
    width: style.width ?? (style.flexDirection === 'row'
      ? boxes.reduce((sum, b) => sum + b.width, 0) + (boxes.length - 1) * (style.gap ?? 0)
      : Math.max(0, ...boxes.map((b) => b.width))),
    height: style.height ?? Math.max(0, ...boxes.map((b) => b.height)),
    painted: boxes.flatMap((b) => b.painted),
  };
}

describe('mobile results stars', () => {
  it.each([false, true])('resizes through RN production frame updates without unsupported icon refs (Fabric: %s)', (fabricHost) => {
    const h = fixture({ fabricHost });
    for (const value of [0.1, 0.5, 1, 0.7, 0]) expect(() => h.drag(value)).not.toThrow();
    expect(h.bindings.some((b) => b.instance.setNativeProps.mock?.calls.length > 0)).toBe(true);
  });

  it.each([1, 2, 3])('preserves glyph size, natural height and 10-point gaps for %i stars', (count) => {
    for (const height of [35, 38]) {
      const h = fixture({ count, height });
      for (const value of [0, 0.5, 1]) {
        h.progress.value = value;
        const size = 34 - 8 * value;
        const box = geometry(h.tree, height);
        expect(box.width).toBeCloseTo(count * size + (count - 1) * 10);
        expect(box.height).toBeCloseTo(height * size / 34);
        box.painted.forEach((painted) => expect(painted).toBeCloseTo(size));
      }
    }
  });

  it('keeps native entrance rotation, scale and opacity independent of the sheet', () => {
    const h = fixture();
    h.entrances.forEach((value) => { value.value = 0.5; });
    h.progress.value = 1;
    for (const star of children(h.tree)) {
      expect(styleOf(star).transform).toEqual([{ scale: 0.5 }, { rotate: '-90deg' }]);
      expect(styleOf(star).opacity).toBe(0.5);
    }
  });

  it('measures natural height after the font loads without collapsing an unloaded glyph', () => {
    const h = fixture({ height: 0 });
    const glyphBox = children(children(children(h.tree)[0])[0])[0];
    const measuredGlyph = children(glyphBox)[0];
    expect(typeof measuredGlyph.props.onLayout).toBe('function');
    const unloadedIcon = new Ionicons(measuredGlyph.props);
    unloadedIcon.state.fontIsLoaded = false;
    // Expo drops the icon props while it renders its unloaded placeholder.
    expect(unloadedIcon.render().props.onLayout).toBeUndefined();
    measuredGlyph.props.onLayout({ nativeEvent: { layout: { height: 0 } } });
    expect(h.setStarGlyphHeight).not.toHaveBeenCalled();
    expect(geometry(h.tree, 38).height).toBe(38);
    measuredGlyph.props.onLayout({ nativeEvent: { layout: { height: 38 } } });
    h.progress.value = 1;
    expect(geometry(h.render(), 38).height).toBeCloseTo(38 * 26 / 34);
  });

  it.each([35, 38])('keeps the measured glyph at %i points under a shorter sheet wrapper', (height) => {
    const h = fixture({ height });
    for (const value of [0, 0.5, 1, 1, 0, 1]) {
      h.progress.value = value;
      const resize = children(children(h.render())[0])[0];
      const glyphBox = children(resize)[0];
      const icon = children(glyphBox)[0];
      // RN's native text measurement clamps to its available height. With an
      // auto-height box the shorter parent feeds that clamped value back into
      // state. A separate full-height glyph box must keep it unconstrained.
      const availableHeight = styleOf(glyphBox).height ?? styleOf(resize).height;
      const measuredHeight = Math.min(height, availableHeight);
      const onLayout = icon.props.onLayout ?? glyphBox.props.onLayout;
      onLayout({ nativeEvent: { layout: { height: measuredHeight } } });
      expect(measuredHeight).toBe(height);
      expect(geometry(h.render(), height).height).toBeCloseTo(height * (34 - 8 * value) / 34);
    }
  });

  it('uses full-size landscape stars without losing the portrait sheet position', () => {
    const h = fixture();
    h.progress.value = 1;
    expect(geometry(h.render(), 38).painted).toEqual([26, 26, 26]);
    // The screen passes restAnim in landscape and panelAnim in portrait.
    expect(source).toContain('renderHeader(restAnim)');
    expect(source).toContain('renderHeader(panelAnim)');
    expect(geometry(h.render(new Scalar(0)), 38).painted).toEqual([34, 34, 34]);
    expect(geometry(h.render(), 38).painted).toEqual([26, 26, 26]);
  });
});
