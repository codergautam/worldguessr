import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming as rnWithTiming,
} from 'react-native-reanimated';
import { withSequence, withSpring, withTiming } from '../daily/anims';

/**
 * Six-digit code entry (mirrors web components/auth/CodeInput.js). ONE hidden
 * TextInput owns the value so paste, iOS one-time-code autofill, backspace and
 * the number pad are all native; the six cells only paint it. The cell at the
 * caret carries the dark ring and a blinking caret bar; a cell that just
 * filled pops once on a spring. Right code = the row goes green; wrong code =
 * red + shake.
 *
 * Palette is the login surface's own (charcoal card world, see
 * styles/login.css): dark cells, white ink, a white ring on the active cell,
 * green/red only for the verdict.
 */
export type CodeInputState = 'idle' | 'busy' | 'ok' | 'error';

interface CodeInputProps {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  state?: CodeInputState;
  shakeKey?: number;
  autoFocus?: boolean;
  length?: number;
  /** Accessibility label for the hidden input (web parity: CodeInput `label`). */
  label?: string;
}

const INK = '#ffffff';
const CELL = '#232a26';
const CELL_FOCUS = '#1d2320';
const RING = 'rgba(255, 255, 255, 0.85)';
const GOOD = '#4ade80';
const GOOD_SOFT = 'rgba(74, 222, 128, 0.14)';
const BAD = '#f87171';
const BAD_SOFT = 'rgba(248, 113, 113, 0.12)';

function Caret() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    // A looping idle animation: the raw withRepeat honours the OS Reduce
    // Motion setting on purpose (see daily/anims.ts).
    opacity.value = withRepeat(rnWithTiming(0, { duration: 500 }), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Reanimated.View style={[styles.caret, style]} />;
}

function Digit({ char, active, state }: { char: string; active: boolean; state: CodeInputState }) {
  const scale = useSharedValue(1);
  const hadChar = useRef(!!char);
  useEffect(() => {
    if (char && !hadChar.current) {
      scale.value = 1.1;
      scale.value = withSpring(1, { damping: 12, stiffness: 320 });
    }
    hadChar.current = !!char;
  }, [char, scale]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const verdict =
    state === 'ok' ? { backgroundColor: GOOD_SOFT, borderColor: GOOD }
      : state === 'error' ? { backgroundColor: BAD_SOFT, borderColor: BAD }
        : active ? { backgroundColor: CELL_FOCUS, borderColor: RING }
          : null;

  return (
    <Reanimated.View
      style={[
        styles.digit,
        verdict,
        state === 'busy' && styles.digitBusy,
        popStyle,
      ]}
    >
      <Text style={styles.digitText}>{char}</Text>
      {active && <Caret />}
    </Reanimated.View>
  );
}

export default function CodeInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  state = 'idle',
  shakeKey = 0,
  autoFocus = true,
  length = 6,
  label,
}: CodeInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const shakeX = useSharedValue(0);

  useEffect(() => {
    if (!shakeKey) return;
    shakeX.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(7, { duration: 50 }),
      withTiming(-5, { duration: 50 }),
      withTiming(4, { duration: 50 }),
      withTiming(-2, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  }, [shakeKey, shakeX]);

  useEffect(() => {
    if (autoFocus && !disabled) {
      // Deferred so the sheet's own entrance has laid out first.
      const id = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [autoFocus, disabled]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  const handleChange = (text: string) => {
    const next = text.replace(/\D/g, '').slice(0, length);
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  const activeIndex = value.length < length ? value.length : -1;
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  return (
    <Reanimated.View style={[styles.row, rowStyle]}>
      {digits.map((d, i) => (
        <Digit key={i} char={d} active={focused && !disabled && i === activeIndex} state={state} />
      ))}
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'ios' ? 'one-time-code' : 'sms-otp'}
        maxLength={length}
        caretHidden
        autoCorrect={false}
        spellCheck={false}
        contextMenuHidden={false}
        accessibilityLabel={label ?? 'Code'}
      />
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  digit: {
    width: 50,
    height: 64,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 14,
    backgroundColor: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitBusy: {
    opacity: 0.6,
  },
  digitText: {
    color: INK,
    fontSize: 28,
    fontFamily: 'Lexend-Bold',
    fontVariant: ['tabular-nums'],
  },
  caret: {
    position: 'absolute',
    width: 2,
    height: '50%',
    borderRadius: 1,
    backgroundColor: INK,
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    color: 'transparent',
    fontSize: 16,
  },
});
