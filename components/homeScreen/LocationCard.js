import { useEffect, useState } from 'react';
import { FaLocationDot, FaMagnifyingGlass } from 'react-icons/fa6';
import { asset } from '@/lib/basePath';

const FLAG = (cc) =>
  cc ? `https://flagcdn.com/w80/${cc.toLowerCase()}.png` : null;

export default function LocationCard({ location, onSearchClick }) {
  const [shown, setShown] = useState(location);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!location) return;
    if (!shown) {
      setShown(location);
      return;
    }
    if (location.id === shown.id && location.currentImage === shown.currentImage) return;
    setFading(true);
    const t = setTimeout(() => {
      setShown(location);
      setFading(false);
    }, 280);
    return () => clearTimeout(t);
  }, [location, shown]);

  if (!shown) return null;
  const flagUrl = FLAG(shown.countryCode);

  return (
    <div className={`wg-locCard ${fading ? 'wg-locCard--fading' : ''}`}>
      <div className="wg-locCard__text">
        <div className="wg-locCard__title">
          <FaLocationDot className="wg-locCard__pin" />
          <span className="wg-locCard__name">
            {shown.name}
            {shown.country ? `, ${shown.country}` : ''}
          </span>
        </div>
        <div className="wg-locCard__tagline">{shown.tagline}</div>
      </div>
      <button
        type="button"
        className="wg-locCard__zoom"
        onClick={onSearchClick}
        aria-label="More info about this location"
      >
        <span className="wg-locCard__zoomInner">
          <span
            className="wg-locCard__zoomImg"
            style={{
              backgroundImage: shown.currentImage
                ? `url(${asset(shown.currentImage)})`
                : 'none',
            }}
          />
          <span className="wg-locCard__zoomIcon">
            <FaMagnifyingGlass />
          </span>
        </span>
        {flagUrl && (
          <img className="wg-locCard__zoomFlag" src={flagUrl} alt="" />
        )}
      </button>
    </div>
  );
}
