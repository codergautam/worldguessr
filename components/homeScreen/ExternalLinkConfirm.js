import { useEffect, useRef, useState } from 'react';

const exitMs = 320;
const enterDelayMs = 30;

export default function ExternalLinkConfirm({ open, link, onCancel }) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState('out');
  const [dontAsk, setDontAsk] = useState(false);

  const stashedLinkRef = useRef(null);
  if (link) stashedLinkRef.current = link;
  const displayLink = link || stashedLinkRef.current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setDontAsk(false);
      setPhase('out');
      const id = window.requestAnimationFrame(() => {

        window.requestAnimationFrame(() => setPhase('in'));
      });
      return () => window.cancelAnimationFrame(id);
    }
    if (!mounted) return undefined;
    setPhase('out');
    const t = window.setTimeout(() => {
      setMounted(false);
      stashedLinkRef.current = null;
    }, exitMs);
    return () => window.clearTimeout(t);

  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!mounted || !displayLink) return null;

  const persistDontAsk = () => {
    if (!dontAsk) return;
    try {
      window.localStorage.setItem(`wg_extlink_skip_${displayLink.key}`, '1');
    } catch (e) {}
  };
  const continueOut = () => {
    persistDontAsk();
    if (typeof window !== 'undefined') {
      window.open(displayLink.url, '_blank', 'noopener,noreferrer');
    }
    onCancel?.();
  };

  const shown = phase === 'in';

  return (
    <>
      <div
        className={`wg-ext__scrim ${shown ? 'wg-ext__scrim--shown' : ''}`}
        onClick={onCancel}
      />
      <div
        className={`wg-ext ${shown ? 'wg-ext--shown' : ''}`}
        role="dialog"
        aria-label={displayLink.title}
      >
        <div className={`wg-ext__icon wg-ext__icon--${displayLink.key}`} aria-hidden="true">
          {displayLink.icon}
        </div>
        <h3 className="wg-ext__title">{displayLink.title}</h3>
        <a
          className="wg-ext__url"
          href={displayLink.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => { e.preventDefault(); continueOut(); }}
        >
          {displayLink.url}
        </a>
        <div className="wg-ext__row">
          <label className="wg-ext__check">
            <input
              type="checkbox"
              checked={dontAsk}
              onChange={(e) => setDontAsk(e.target.checked)}
            />
            <span>Don&apos;t show again</span>
          </label>
        </div>
        <div className="wg-ext__actions">
          <button type="button" className="wg-ext__cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="wg-ext__continue" onClick={continueOut}>
            Continue
          </button>
        </div>
      </div>
    </>
  );
}

export function shouldSkipConfirm(key) {
  try {
    return window.localStorage.getItem(`wg_extlink_skip_${key}`) === '1';
  } catch (e) {
    return false;
  }
}
