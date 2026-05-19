import { useEffect, useState } from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import { asset } from '@/lib/basePath';
import BannerText from '@/components/bannerText';

export default function WgLoadingScreen({ shown, overlay = false, onBack, text }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (shown) {
      setMounted(true);
      const id = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), 280);
    return () => window.clearTimeout(t);
  }, [shown]);

  if (!mounted) return null;

  return (
    <div
      className={`wg-loading ${visible ? 'wg-loading--shown' : ''} ${overlay ? 'wg-loading--overlay' : ''}`}
      aria-hidden={!visible}
    >
      {!overlay && (
        <div className="wg-loading__topLeft">
          <span className="wg-nav__brand wg-nav__brand--loading" aria-label="WorldGuessr">
            <img
              src={asset('/assets/logos/title.png')}
              alt="WorldGuessr"
              width={140}
              height={32}
              draggable={false}
            />
          </span>
          {onBack && (
            <button
              type="button"
              className="wg-backBtn wg-backBtn--nav"
              onClick={onBack}
              aria-label={(typeof text === 'function' ? text('back') : null) || 'Back'}
            >
              <FaArrowLeft className="wg-backBtn__icon" />
              <span className="wg-backBtn__label">
                {(typeof text === 'function' ? text('back') : null) || 'Back'}
              </span>
            </button>
          )}
        </div>
      )}

      <BannerText
        shown={visible}
        text={`${(typeof text === 'function' ? text('loading') : null) || 'Loading'}...`}
      />
    </div>
  );
}
