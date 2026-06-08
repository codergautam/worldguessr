import { useEffect, useRef, useState } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { asset } from '@/lib/basePath';

const FLAG = (cc) =>
  cc ? `https://flagcdn.com/w160/${cc.toLowerCase()}.png` : null;

export default function LocationPanel({ open, location, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const frozenLocationRef = useRef(null);

  useEffect(() => {
    if (open && location && !frozenLocationRef.current) {
      frozenLocationRef.current = location;
    }
  }, [open, location]);

  useEffect(() => {
    if (open) {
      setMounted(true);

      const t = setTimeout(() => setShown(true), 40);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => {
      setMounted(false);

      frozenLocationRef.current = null;
    }, 400);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  const displayLoc = frozenLocationRef.current || location;
  if (!displayLoc) return null;
  const flagUrl = FLAG(displayLoc.countryCode);

  return (
    <>
      <div
        className={`wg-locPanel__scrim ${shown ? 'wg-locPanel__scrim--shown' : ''}`}
        onClick={onClose}
      />
      <aside
        className={`wg-locPanel ${shown ? 'wg-locPanel--shown' : ''}`}
        role="dialog"
        aria-label={`About ${displayLoc.name}`}
      >
        <button className="wg-locPanel__close" onClick={onClose} aria-label="Close">
          <FaXmark />
        </button>

        <div
          className="wg-locPanel__hero"
          style={{
            backgroundImage: displayLoc.currentImage
              ? `url(${asset(displayLoc.currentImage)})`
              : 'none',
          }}
        >
          <div className="wg-locPanel__heroFade" />
          <div className="wg-locPanel__heroText">
            <div className="wg-locPanel__heroPlace">
              {flagUrl && <img src={flagUrl} alt="" className="wg-locPanel__flag" />}
              <span>{displayLoc.country}</span>
            </div>
            <h2 className="wg-locPanel__heroTitle">{displayLoc.name}</h2>
            <div className="wg-locPanel__heroTagline">{displayLoc.tagline}</div>
          </div>
        </div>

        <div className="wg-locPanel__body">
          <p className="wg-locPanel__desc">{displayLoc.description}</p>

          {displayLoc.facts && displayLoc.facts.length > 0 && (
            <div className="wg-locPanel__facts">
              {displayLoc.facts.map((f) => (
                <div className="wg-locPanel__fact" key={f.label}>
                  <div className="wg-locPanel__factLabel">{f.label}</div>
                  <div className="wg-locPanel__factValue">{f.value}</div>
                </div>
              ))}
            </div>
          )}

          {displayLoc.sources && displayLoc.sources.length > 0 && (
            <div className="wg-locPanel__sources">
              <h3 className="wg-locPanel__sourcesLabel">Sources</h3>
              <ul className="wg-locPanel__sourcesList">
                {displayLoc.sources.map((s) => (
                  <li className="wg-locPanel__sourceItem" key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="wg-locPanel__source"
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
