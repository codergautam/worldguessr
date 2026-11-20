import { useTranslation } from '@/components/useTranslations';

// Blink round center text over the blurred pano (styles/blink.css): the 3-2-1
// before the reveal, then "Time's up! Make your guess" until a pin is placed.
export default function BlinkCountdown({ blink, hasGuess }) {
  const { t: text } = useTranslation();
  if (blink?.phase === 'countdown') {
    return (
      <div className="blink-center" role="timer" aria-live="assertive">
        <span key={blink.count} className="blink-center__digit g2_lexend">{blink.count}</span>
      </div>
    );
  }
  if (blink?.phase === 'blurred' && !hasGuess) {
    return (
      <div className="blink-center blink-center--prompt" role="status">
        <span className="blink-center__prompt g2_lexend">{text('blinkGuessNow')}</span>
      </div>
    );
  }
  return null;
}
