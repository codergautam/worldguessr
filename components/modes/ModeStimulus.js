// What the player looks at in a quiz round: a flag, a country silhouette, a
// text sample or a photo, sized by the QuizGame card. The answer itself is
// named by the card's result, never here.

import { useEffect, useState } from 'react';
import { useTranslation } from '@/components/useTranslations';
import { flagSrc } from './quizClient';
import { loadShapes, shapeFor } from './loadShapes';
import ClothFlag from './ClothFlag';

// An image that fades in only when it was not already decoded (a preloaded
// flag appears at once; a slow one does not pop in half-drawn).
function FadeImg({ src, alt, className }) {
  return (
    <img
      key={src}
      className={`${className} quizFadeImg`}
      src={src}
      alt={alt}
      draggable={false}
      ref={(el) => { if (el && el.complete && el.naturalWidth) el.classList.add('is-ready'); }}
      onLoad={(e) => e.currentTarget.classList.add('is-ready')}
    />
  );
}

// `waveKey` replays the flag's wave (a hit); `onAspect` reports its shape.
export default function ModeStimulus({ quiz, location, revealed, waveKey = 0, onAspect }) {
  const { t: text } = useTranslation('common');
  const [shape, setShape] = useState(() => shapeFor(location?.country));

  useEffect(() => {
    if (quiz?.stimulus !== 'outline' || !location?.country) return undefined;
    let on = true;
    setShape(shapeFor(location.country));
    loadShapes().then((data) => { if (on) setShape(data?.shapes?.[location.country] ?? null); }).catch(() => {});
    return () => { on = false; };
  }, [quiz?.stimulus, location?.country]);

  if (!quiz || !location) return null;

  return (
    <div className={`quizStimulus quizStimulus--${quiz.stimulus}`}>
      {quiz.stimulus === 'flag' && (
        <ClothFlag className="quizStimulus__flag" src={flagSrc(location.country, 640)} alt={text('quizFlagAlt')} waveKey={waveKey} delay={waveKey ? 60 : 420} onAspect={onAspect} />
      )}
      {quiz.stimulus === 'outline' && (shape ? (
        <svg className="quizStimulus__outline" viewBox={shape.viewBox} role="img" aria-label={text('quizShapeAlt')}>
          <path d={shape.d} fillRule="evenodd" />
        </svg>
      ) : <div className="quizStimulus__outline" />)}
      {quiz.stimulus === 'text' && (
        <p className="quizStimulus__text" lang={location.lang} dir="auto">{location.text}</p>
      )}
      {quiz.stimulus === 'image' && location.image?.url && (
        <FadeImg className="quizStimulus__image" src={location.image.url} alt="" />
      )}
      {revealed && quiz.stimulus === 'image' && location.image?.credit && (
        <p className="quizStimulus__credit">{location.image.credit}{location.image.license ? `, ${location.image.license}` : ''}</p>
      )}
    </div>
  );
}
