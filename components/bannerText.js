import { asset } from '@/lib/basePath';

export default function BannerText({ shown, text, hideCompass, subText, position }) {
  return (
    <div
      className={`banner-text wg-banner ${shown ? 'shown' : 'hidden'}`}
      style={{
        position: position || 'fixed',
        zIndex: 1000,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}
    >
      <div className="wg-banner__row">
        <span className="wg-banner__text wg-gmarket-bold">
          {text || 'Loading...'}
        </span>
        {!hideCompass && (
          <img
            className="wg-banner__spinner"
            src={asset('/assets/spinner.gif')}
            alt=""
            draggable={false}
          />
        )}
      </div>
      {subText && (
        <span className="wg-banner__sub wg-gmarket-bold">{subText}</span>
      )}
    </div>
  );
}
