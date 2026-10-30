// A finished quiz round in one line: the flag / outline / text snippet that
// stood in for a panorama, then the answer. Used by the quiz summary and by
// roundOverScreen's round rows (history replays included).

import { useTranslation } from '@/components/useTranslations';
import nameFromCode from '../utils/nameFromCode';
import { quizOf, flagSrc } from '../modes/quizClient';
import { languageName } from '../modes/languageName';
import { shapeFor } from '../modes/loadShapes';

export default function QuizRoundTag({ round }) {
  const { lang } = useTranslation('common');
  const quiz = quizOf(round?.mode);
  if (!quiz) return null;
  const shape = quiz.stimulus === 'outline' ? shapeFor(round.country) : null;
  const answer = quiz.target === 'language'
    ? languageName(round.lang, lang)
    : nameFromCode(round.country, lang);
  return (
    <span className="quizRoundTag">
      {quiz.stimulus === 'flag' && (
        <img className="quizThumb" src={flagSrc(round.country, 40)} alt="" />
      )}
      {shape && (
        <svg className="quizThumb" viewBox={shape.viewBox} aria-hidden="true">
          <path d={shape.d} fillRule="evenodd" fill="currentColor" />
        </svg>
      )}
      {quiz.stimulus === 'text' && (
        <span className="quizThumb quizThumb--text" lang={round.lang} dir="auto">
          {String(round.text || '').slice(0, 24)}
        </span>
      )}
      <span className="quizRoundTag__answer">{answer}</span>
    </span>
  );
}
