import { useTranslation } from '@/components/useTranslations';
import { FaCrown } from 'react-icons/fa6';
import AnimatedCounter from './AnimatedCounter';
import getMyTeam from './utils/getMyTeam';

// Cumulative team-score banner for intra-party team games (teamGame, duel=false).
// Fixed top-center like the duel timer; NOT the 2v2 HP health bars — those stay
// gated on team2v2. Teams keep stable identity labels (Team 1 left, Team 2
// right, matching the lobby columns) rather than the duel your/enemy framing.
export default function TeamScorebar({ gameData }) {
  const { t: text } = useTranslation("common");
  const scores = gameData?.teamScores ?? { a: 0, b: 0 };
  const myTeam = getMyTeam(gameData?.players, gameData?.myId);
  // Crown the current leader; nobody on a tie (incl. the 0-0 start).
  const leadingTeam = (scores.a ?? 0) === (scores.b ?? 0)
    ? null : ((scores.a ?? 0) > (scores.b ?? 0) ? 'a' : 'b');

  const side = (teamKey, labelKey) => (
    <div className={`team-scorebar__side ${myTeam === teamKey ? 'team-scorebar__side--mine' : ''}`}>
      <span className="team-scorebar__label">
        {leadingTeam === teamKey && <FaCrown className="team-scorebar__crown" aria-hidden />}
        {text(labelKey)}{myTeam === teamKey ? ` (${text("you")})` : ''}
      </span>
      <span className="team-scorebar__score">
        {/* incrementMs: hold the +Δ tag long enough to actually read it —
            the number itself still counts up at the default speed. */}
        <AnimatedCounter value={scores[teamKey] ?? 0} incrementMs={2600} />
      </span>
    </div>
  );

  return (
    <div className="team-scorebar">
      {side('a', 'team1')}
      <span className="team-scorebar__divider" aria-hidden />
      {side('b', 'team2')}
    </div>
  );
}
