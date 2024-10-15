import { useTranslation } from '@/components/useTranslations'
import { FaCopy } from 'react-icons/fa6';
import { toast } from 'react-toastify';

export default function PlayerList({ multiplayerState, playAgain, backBtn, startGameHost }) {
  const { t: text } = useTranslation("common");

  const N = 5; // Number of top players to show

  const players = (multiplayerState?.gameData?.finalPlayers ?? multiplayerState?.gameData?.players).sort((a, b) => b.score - a.score);
  const myId = multiplayerState?.gameData?.myId;
  const myIndex = players.findIndex(player => player.id === myId);

  const waitingForStart = multiplayerState.gameData?.state === "waiting";
  const gameOver = multiplayerState.gameData?.state === "end";
  const host = multiplayerState.gameData?.host;

  return (
    <div className="multiplayerLeaderboard">
      <span className="bigSpan">
        {gameOver?text("gameOver"):waitingForStart?host?text("yourPrivateGame"):text("privateGame"):text("leaderboard")}
        {waitingForStart && <span style={{color: "white"}}> ({text("roundsCount",{rounds:multiplayerState.gameData?.rounds})})</span>}
      </span>



      { waitingForStart && (

        <div style={{display: "flex", flexDirection: "row", alignItems: "center"}}>
        <h2 style={{color: "orange", pointerEvents: "all"}}>{text("gameCode")}: {multiplayerState.gameData?.code}</h2>
        {/* copy */}
        <button onClick={() => {
          navigator.clipboard.writeText(multiplayerState.gameData?.code);
          toast.success(text("copiedToClipboard"));
        }} style={{
          marginLeft: "10px",
          padding: "5px",
          backgroundColor: "orange",
          color: "white",
          border: "none",
          cursor: "pointer",
          pointerEvents: "all",
          borderRadius: "5px"
        }}>
          {/* copy icon */}

          <FaCopy />
        </button>
        <br />
        { host && false && (
        <button onClick={() => {

        }} style={{
          marginLeft: "10px",
          padding: "5px",
          backgroundColor: "green",
          color: "white",
          border: "none",
          cursor: "pointer",
          pointerEvents: "all",
          borderRadius: "5px"
        }}>
          {/* copy icon */}

          Edit Options
        </button>
        )}

        </div>
      )}

      {players.slice(0, N).map((player, i) => {
        return (
          <div key={i} className={`multiplayerLeaderboard__player ${player.id === myId ? 'me' : ''}`}>
            { waitingForStart ? (

              <div className="multiplayerLeaderboard__player__username">

                {player.username}
                {player.supporter && <span className="badge" style={{marginLeft: "5px", border: '1px black solid'}}>{text("supporter")}</span>}
                {player.host && <span style={{color: "red"}}> ({text("host")})</span>}

              </div>

            ) : (
              <>
            <div className="multiplayerLeaderboard__player__username">#{i + 1} - {player.username}

            {player.supporter && <span className="badge" style={{marginLeft: "5px", border: '1px black solid'}}>{text("supporter")}</span>}

            </div>
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
            <button className="gameBtn" onClick={playAgain}>{text("playAgain")}</button>
          )}
            <button className="gameBtn" onClick={backBtn}>{text("back")}</button>
            </div>

        )
      }

      { waitingForStart && host && (
        <div className="multiplayerFinalBtns">
          { players.length < 2 ?
          <p style={{color: "red"}}>{text("singlePlayerNeeded")}</p>
        : multiplayerState?.gameData?.rounds > (multiplayerState?.gameData?.generated) ?
        null
        :
        <button className="gameBtn" onClick={() => startGameHost()}>{text("startGame")}</button> }

        </div>
      )}

      {(multiplayerState?.gameData?.rounds > (multiplayerState?.gameData?.generated)) &&
        <p style={{color: "yellow"}}>{text("generating")} ( {multiplayerState?.gameData?.generated||0} / {multiplayerState?.gameData?.rounds} )</p>}

{ waitingForStart && !host && (multiplayerState?.gameData?.rounds== multiplayerState?.gameData?.generated) && (
          <p style={{color: "red"}}>{text("waitingForHostToStart")}...</p>
      )}
    </div>
  );
}