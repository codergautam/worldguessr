// ChinaGuessr (temporary): the /china landing. One centered card in the HUD
// plate recipe (.timer: --primaryTransparent plate, 2px --primary frame) over
// the site background, UNDER the real navbar (z 1120) so the bar is the real
// one. The game mounts and loads round 1 behind it; the page flips a wrapper
// class and styles/china.scss holds the corner map until Play lifts this.
import React from 'react';
import { useTranslation } from '@/components/useTranslations';
import CountryFlag from '@/components/utils/countryFlag';

export default function ChinaLanding({ leaving, onPlay }) {
  const { t: text } = useTranslation('common');
  return (
    <div className={`china-landing${leaving ? ' is-leaving' : ''}`} role="dialog" aria-label={text('chinaGuessr')}>
      <div className="china-landing__card">
        <h1 className="home__title wg_font china-landing__title">
          {text('chinaGuessr')}
          <CountryFlag countryCode="CN" size={0.62} marginRight="0" style={{ marginLeft: '0.35em' }} />
        </h1>
        <div className="g2_nav_hr china-landing__hr"></div>
        <p className="china-landing__text">{text('chinaGuessrTagline')}</p>
        <p className="china-landing__text china-landing__text--dim">{text('chinaLandingSlow')}</p>
        <div className="g2_nav_hr china-landing__hr"></div>
        <button
          type="button"
          className="gameBtn g2_green_button g2_lexend china-landing__play"
          onClick={onPlay}
          disabled={leaving}
          autoFocus
        >
          {text('play')}
        </button>
      </div>
    </div>
  );
}
