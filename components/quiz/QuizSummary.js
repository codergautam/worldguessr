// Singleplayer quiz results: every round with its stimulus and answer, the
// total, your best, Play again / Back to Quizzes.

import { useTranslation } from '@/components/useTranslations';
import QuizRoundTag from './QuizRoundTag';

export default function QuizSummary({ history, total, best, onPlayAgain, onQuizzes }) {
  const { t: text } = useTranslation('common');
  return (
    <div className="quizSummary">
      <div className="quizSummary__card g2_container">
        <div className="quizSummary__total">{total}</div>
        <div className="quizSummary__best">{text('quizBest', { score: best })}</div>
        <ol className="quizSummary__rounds">
          {history.map((round, i) => (
            <li key={i} className={`quizSummary__round ${round.points === 5000 ? 'quizSummary__round--perfect' : ''}`}>
              <QuizRoundTag round={round} />
              <span className="quizSummary__pts">{round.points}</span>
            </li>
          ))}
        </ol>
        <div className="quizSummary__actions">
          <button type="button" className="g2_green_button quizBtn" onClick={onPlayAgain}>{text('playAgain')}</button>
          <button type="button" className="g2_green_button3 quizBtn" onClick={onQuizzes}>{text('quizModes')}</button>
        </div>
      </div>
    </div>
  );
}
