export default function Leaderboard({ ws, open, onToggle, enabled, multiplayerState }) {
  return (
    <div className="multiplayerLeaderboard">

<h1>Leaderboard</h1>
      {multiplayerState?.gameData?.players.map((player, i) => {
        return (
          <div key={i} className={`multiplayerLeaderboard__player ${player.id === multiplayerState?.gameData?.myId ? 'me' : ''}`}>
            <div className="multiplayerLeaderboard__player__username">{player.username}</div>
            <div className="multiplayerLeaderboard__player__score">{player.score}</div>
          </div>
        );
      })}
    </div>
  );
}