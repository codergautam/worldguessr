import { useEffect, useRef, useState } from 'react';
import { dailyBackground, IS_PORTAL_BUILD } from '@/lib/dailyBackground';

/**
 * "Which city is today's background?" chip + info card, home screen only.
 *
 * The city resolves in an effect, NOT during render: the home page is
 * prerendered, and a Date-derived value in SSG markup would bake the
 * build-day city and then hydration-mismatch on every later day (same rule
 * as the background itself — see lib/dailyBackground.js). Until the effect
 * runs it renders nothing; the chip popping in a frame after paint is fine
 * for a decorative element.
 *
 * Portals never rotate (pinned to street2) — chip suppressed entirely there
 * to keep their reviewed layouts untouched.
 */
export default function BgCityChip() {
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!IS_PORTAL_BUILD) setInfo(dailyBackground());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!info) return null;

  return (
    <div className="bgCityChip" ref={rootRef}>
      {open && (
        <div className="bgCityChip__card" role="dialog" aria-label={`${info.city}, ${info.country}`}>
          <div className="bgCityChip__cardTitle">{info.city}, {info.country}</div>
          <p className="bgCityChip__cardBlurb">{info.blurb}</p>
          <div className="bgCityChip__cardCredit">Today&apos;s background &middot; a new city every day</div>
        </div>
      )}
      <button
        type="button"
        className="bgCityChip__btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={`${info.city}, ${info.country}`}
      >
        <span aria-hidden="true">📍</span> {info.city}
      </button>
    </div>
  );
}
