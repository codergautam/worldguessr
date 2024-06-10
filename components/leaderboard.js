export default function Leaderboard({ ws, open, onToggle, enabled, multiplayerState,gameOver }) {
  const N = 5; // Number of top players to show

  const players = multiplayerState?.gameData?.players.sort((a, b) => b.score - a.score);
  const myId = multiplayerState?.gameData?.myId;
  const myIndex = players.findIndex(player => player.id === myId);

  return (
    <div className="multiplayerLeaderboard">
      <h1>{gameOver?"Game Over":"Leaderboard"}</h1>
      {players.slice(0, N).map((player, i) => {
        return (
          <div key={i} className={`multiplayerLeaderboard__player ${player.id === myId ? 'me' : ''}`}>
            <div className="multiplayerLeaderboard__player__username">#{i + 1} - {player.username}</div>
            <div className="multiplayerLeaderboard__player__score">{player.score}</div>
          </div>
        );
      })}

      {myIndex >= N && (
        <>
        <span className="multiplayerLeaderboard__separator">...</span>

        <div className="multiplayerLeaderboard__player me">
          <div className="multiplayerLeaderboard__player__username">#{myIndex + 1} - {players[myIndex].username}</div>
          <div className="multiplayerLeaderboard__player__score">{players[myIndex].score}</div>
        </div>
        </>
      )}
    </div>
  );
}