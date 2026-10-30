// The run so far as ten slots: each finished round's flag flies in on Next
// (QuizGame's collect), ringed in how it went: green found first try, yellow
// found on a later try, red for a miss (as the globe paints them). The chip
// says which round it is; the rail says how the run is going, with the flags
// themselves as trophies.

import { flagSrc } from '../modes/quizClient';

// A country round is a hit when found first try (5000; quizzes have no
// hints); a choice round when right. Streaks count hits.
export function isHit(row) {
  if (!row) return false;
  return row.choices ? row.points > 0 : row.points === 5000;
}

function stateOf(row) {
  if (!row) return 'empty';
  if (isHit(row)) return 'hit';
  return row.points > 0 ? 'few' : 'miss';
}

export default function QuizRail({ rows, total }) {
  return (
    <ol className="quizRail" aria-hidden>
      {Array.from({ length: total }, (_, i) => {
        const row = rows[i];
        return (
          <li key={i} className={`quizRail__slot quizRail__slot--${stateOf(row)}`}>
            {row?.country && <img src={flagSrc(row.country, 80)} alt="" draggable={false} />}
          </li>
        );
      })}
    </ol>
  );
}
