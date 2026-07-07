import { useTranslation } from '@/components/useTranslations'
import { FaCrown } from 'react-icons/fa6';
import UsernameWithFlag from './utils/usernameWithFlag';
import getMyTeam from './utils/getMyTeam';

// Between-rounds leaderboard for multiplayer games, mounted from gameUI during
// getready (game-over screens are owned by RoundOverScreen). Styling here is
// intentionally untouched from the original leaderboard look (white rows,
// fade in/out via leaderboardShown/FadingOut).
//
// Team parties get a team-first layout: the two TEAM totals are the headline
// (big, scorebar-style, with the last round's delta), individual players are
// demoted to compact pills underneath.
export default function PlayerList({ multiplayerState, fadingOut }) {
  const { t: text } = useTranslation("common");

  // Copy before sorting — sorting in place would mutate React state (gameData.players).
  const players = [...(multiplayerState?.gameData?.finalPlayers ?? multiplayerState?.gameData?.players ?? [])].sort((a, b) => b.score - a.score);
  const myId = multiplayerState?.gameData?.myId;
  const myIndex = players.findIndex(player => player.id === myId);

  const N = 5; // Number of top players to show

  const teamGame = !!multiplayerState?.gameData?.teamGame;
  const teamScores = multiplayerState?.gameData?.teamScores;
  // Last scored round's per-team points ("+312 this round"). The server tags
  // the stash with its round number; during getready curRound has already
  // been bumped, so the stash always refers to the round just played.
  const roundScores = multiplayerState?.gameData?.teamRoundScores?.scores;
  const myTeam = teamGame ? getMyTeam(players, myId) : null;
  // Crown the currently-leading team in the hero (hidden on ties), matching
  // the in-round scorebar's crown.
  const leadingTeam = teamGame && (teamScores?.a ?? 0) !== (teamScores?.b ?? 0)
    ? ((teamScores?.a ?? 0) > (teamScores?.b ?? 0) ? 'a' : 'b') : null;

  const leaderboardClasses = [
    'multiplayerLeaderboard',
    'leaderboardInRound',
    fadingOut ? 'leaderboardFadingOut' : 'leaderboardShown'
  ].join(' ');

  const renderRow = (player, rank) => (
    <div key={player.id ?? rank} className={`multiplayerLeaderboard__player ${player.id === myId ? 'me' : ''}`}>
      <div className="multiplayerLeaderboard__player__username">#{rank + 1} - <UsernameWithFlag
          username={player.username}
          countryCode={player.countryCode}
          isGuest={process.env.NEXT_PUBLIC_COOLMATH}
        />
      {player.id === myId && player.username?.startsWith('Guest #') && <span style={{
        color: "#28a745",
        fontWeight: "600",
        fontSize: "12px"
      }}> ({text("you")})</span>}
      {player.supporter && <span style={{
        marginLeft: "6px",
        backgroundColor: "#ffc107",
        color: "#000",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: "700",
        textTransform: "uppercase"
      }}>{text("supporter")}</span>}

      </div>
      <div className="multiplayerLeaderboard__player__score">{player.score}</div>
    </div>
  );

  // One big side of the team hero: label, cumulative total, last round's gain.
  const heroSide = (teamKey, labelKey) => (
    <div className={`multiplayerLeaderboard__teamHeroSide ${myTeam === teamKey ? 'mine' : ''}`}>
      <span className="multiplayerLeaderboard__teamHeroLabel">
        {leadingTeam === teamKey && <FaCrown className="multiplayerLeaderboard__teamHeroCrown" aria-hidden />}
        {text(labelKey)}{myTeam === teamKey ? ` · ${text("you")}` : ''}
      </span>
      <span className="multiplayerLeaderboard__teamHeroScore">
        {(teamScores?.[teamKey] ?? 0).toLocaleString()}
      </span>
      {typeof roundScores?.[teamKey] === 'number' && (
        <span className="multiplayerLeaderboard__teamHeroDelta">+{roundScores[teamKey].toLocaleString()}</span>
      )}
    </div>
  );

  // Compact member pills for one team, personal-score sorted. Cap the list
  // but always keep the local player visible.
  const memberColumn = (teamKey) => {
    const members = players.filter((p) => p.team === teamKey);
    const shown = members.slice(0, N);
    const meHidden = members.findIndex((p) => p.id === myId) >= N;
    if (meHidden) shown[N - 1] = members.find((p) => p.id === myId);
    const overflow = members.length - shown.length;
    return (
      <div key={teamKey} className="multiplayerLeaderboard__memberColumn">
        {shown.map((p) => (
          <div key={p.id} className={`multiplayerLeaderboard__member ${p.id === myId ? 'me' : ''}`}>
            <span className="multiplayerLeaderboard__memberName">
              <UsernameWithFlag username={p.username} countryCode={p.countryCode} isGuest={process.env.NEXT_PUBLIC_COOLMATH} />
            </span>
            <span className="multiplayerLeaderboard__memberScore">{p.score}</span>
          </div>
        ))}
        {overflow > 0 && <span className="multiplayerLeaderboard__memberMore">+{overflow}</span>}
      </div>
    );
  };

  return (
    <div className={leaderboardClasses}>
      {/* Team layout is self-explanatory (two big team scores) — the
          LEADERBOARD header is only worth its space on the FFA row list. */}
      {!teamGame && <span className="bigSpan">{text("leaderboard")}</span>}

      {teamGame ? (
        <>
          <div className="multiplayerLeaderboard__teamHero">
            {heroSide('a', 'team1')}
            <span className="multiplayerLeaderboard__teamHeroDash" aria-hidden>—</span>
            {heroSide('b', 'team2')}
          </div>
          <div className="multiplayerLeaderboard__teamMembers">
            {memberColumn('a')}
            {memberColumn('b')}
          </div>
          {/* Never drop anyone: teamless players (shouldn't happen) get plain rows */}
          {players.filter((p) => p.team !== 'a' && p.team !== 'b').map((p, i) => renderRow(p, i))}
        </>
      ) : (
        <>
          {players.slice(0, N).map((player, i) => renderRow(player, i))}

          {myIndex >= N && (
            <>
            <span className="multiplayerLeaderboard__separator">...</span>
            {renderRow(players[myIndex], myIndex)}
            </>
          )}
        </>
      )}
    </div>
  );
}
