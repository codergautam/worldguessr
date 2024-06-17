export default function PlayerList({ multiplayerState, playAgain, backBtn, startGameHost }) {
  const N = 5; // Number of top players to show

  const players = (multiplayerState?.gameData?.finalPlayers ?? multiplayerState?.gameData?.players).sort((a, b) => b.score - a.score);
  const myId = multiplayerState?.gameData?.myId;
  const myIndex = players.findIndex(player => player.id === myId);

  const waitingForStart = multiplayerState.gameData?.state === "waiting";
  const gameOver = multiplayerState.gameData?.state === "end";
  const host = multiplayerState.gameData?.host;

  return (
    <div className="multiplayerLeaderboard">
      <h1>
        {gameOver?"Game Over":waitingForStart?host?"Your Private Game":"Private Game":"Leaderboard"}
        {waitingForStart && <span style={{color: "white"}}> ({multiplayerState.gameData?.rounds} Rounds)</span>}
      </h1>

      { waitingForStart && (

        <>
        <h2 style={{color: "orange"}}>Game Code: {multiplayerState.gameData?.code}</h2>
        </>
      )}

      {players.slice(0, N).map((player, i) => {
        return (
          <div key={i} className={`multiplayerLeaderboard__player ${player.id === myId ? 'me' : ''}`}>
            { waitingForStart ? (

              <div className="multiplayerLeaderboard__player__username">

                {player.username}
                {player.host && <span style={{color: "red"}}> (Host)</span>}

              </div>

            ) : (
              <>
            <div className="multiplayerLeaderboard__player__username">#{i + 1} - {player.username}</div>
            <div className="multiplayerLeaderboard__player__score">{player.score}</div>
            </>
            )}
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

      {
        gameOver && (

          <div className="multiplayerFinalBtns">

          { multiplayerState.gameData?.public && (
            <button className="gameBtn" onClick={playAgain}>Play Again</button>
          )}
            <button className="gameBtn" onClick={backBtn}>Back</button>
            </div>

        )
      }

      { waitingForStart && host && (
        <div className="multiplayerFinalBtns">
          { players.length < 2 ?
          <p style={{color: "red"}}>1 more player needed to start</p>
        : <button className="gameBtn" onClick={() => startGameHost()}>Start Game</button> }

        </div>
      )}

{ waitingForStart && !host && (
          <p style={{color: "red"}}>Waiting for host to start the game...</p>

      )}
    </div>
  );
}