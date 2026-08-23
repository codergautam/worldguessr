import { useEffect, useRef, useState } from 'react';

/**
 * Six-digit code entry. ONE real <input> (invisible, stretched over the row)
 * owns the value, so paste, iOS/Android one-time-code autofill, backspace and
 * IME behaviour are all native; the six boxes only paint that value. The box
 * at the caret carries the focus ring and a blinking caret bar; a box that
 * just filled pops once (.wgLogin__digit--filled).
 *
 * `state`: 'idle' | 'busy' | 'ok' | 'error' — drives the row's border colour.
 * `shakeKey`: bump it to replay the wrong-code shake.
 */
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
}) {
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (!shakeKey) return undefined;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 420);
    return () => clearTimeout(t);
  }, [shakeKey]);

  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus();
  }, [autoFocus, disabled]);

  const moveCaretToEnd = () => {
    const el = inputRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* type=text only */ }
    });
  };

  const handleChange = (e) => {
    const next = e.target.value.replace(/\D/g, '').slice(0, length);
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  const digits = Array.from({ length }, (_, i) => value[i] || '');
  const activeIndex = value.length < length ? value.length : -1;
  const rowClass = [
    'wgLogin__code',
    state !== 'idle' && `wgLogin__code--${state}`,
    shaking && 'wgLogin__code--shake',
  ].filter(Boolean).join(' ');

  return (
    <div className={rowClass} onClick={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={length}
        value={value}
        onChange={handleChange}
        onFocus={() => { setFocused(true); moveCaretToEnd(); }}
        onBlur={() => setFocused(false)}
        onClick={moveCaretToEnd}
        disabled={disabled}
        aria-label={label}
        autoFocus={autoFocus}
      />
      {digits.map((d, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={[
            'wgLogin__digit',
            d && 'wgLogin__digit--filled',
            focused && !disabled && i === activeIndex && 'wgLogin__digit--active',
          ].filter(Boolean).join(' ')}
        >
          {d}
        </div>
      ))}
    </div>
  );
}
