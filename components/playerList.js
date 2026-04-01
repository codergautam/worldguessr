import { useTranslation } from '@/components/useTranslations'
import { FaCopy } from 'react-icons/fa6';
import { toast } from 'react-toastify';
import UsernameWithFlag from './utils/usernameWithFlag';

export default function PlayerList({ multiplayerState, playAgain, backBtn, startGameHost, onEditClick }) {
  const { t: text } = useTranslation("common");

  const players = (multiplayerState?.gameData?.finalPlayers ?? multiplayerState?.gameData?.players).sort((a, b) => b.score - a.score);
  const myId = multiplayerState?.gameData?.myId;
  const myIndex = players.findIndex(player => player.id === myId);

  const waitingForStart = multiplayerState.gameData?.state === "waiting";
  const gameOver = multiplayerState.gameData?.state === "end";
  const host = multiplayerState.gameData?.host;
  const N = waitingForStart ? 200 : 5; // Number of top players to show

  return (
    <div className="multiplayerLeaderboard g2_container">
      <span className="bigSpan">
        {gameOver?text("gameOver"):waitingForStart?host?text("yourPrivateGame"):text("privateGame"):text("leaderboard")}
        {waitingForStart && <span style={{color: "white"}}> ({text("roundsCount",{rounds:multiplayerState.gameData?.rounds})}
      {multiplayerState?.gameData?.nm && multiplayerState?.gameData?.npz && ", NMPZ"}
      {multiplayerState?.gameData?.nm && !multiplayerState?.gameData?.npz && ", NM"}
      {multiplayerState?.gameData?.npz && !multiplayerState?.gameData?.nm && ", NPZ"}

          )</span>}
      </span>
      {waitingForStart &&multiplayerState?.gameData?.displayLocation &&
      <span>
        {text("map")}: {multiplayerState?.gameData?.displayLocation ?? ""}
      </span>
      }




      { waitingForStart && (

        <div style={{
          display: "flex", 
          flexDirection: "row", 
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "10px",
          marginTop: "8px"
        }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          backgroundColor: "#fff3cd",
          border: "1px solid #ffc107",
          borderRadius: "8px",
          padding: "10px 16px"
        }}>
          <span style={{
            color: "#856404",
            fontWeight: "700",
            fontSize: "clamp(16px, 4vw, 20px)"
          }}>{text("gameCode")}: {multiplayerState.gameData?.code}</span>
        <button onClick={() => {
          navigator.clipboard.writeText(multiplayerState.gameData?.code);
          toast.success(text("copiedToClipboard"));
        }} style={{
            marginLeft: "12px",
            padding: "8px 12px",
            backgroundColor: "#ffc107",
            color: "#000",
          border: "none",
          cursor: "pointer",
          pointerEvents: "all",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s ease"
          }}>
          <FaCopy />
        </button>
        </div>
        { host && (
        <button onClick={() => {
            onEditClick();
        }} style={{
          padding: "10px 20px",
          backgroundColor: (multiplayerState?.gameData?.rounds > (multiplayerState?.gameData?.generated)) 
            ? "#6c757d" 
            : "#28a745",
          color: "white",
          border: "none",
          cursor: (multiplayerState?.gameData?.rounds > (multiplayerState?.gameData?.generated)) ? "not-allowed": "pointer",
          pointerEvents: "all",
          borderRadius: "8px",
          fontWeight: "600",
          fontSize: "14px",
          transition: "all 0.15s ease",
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.15)"
        }}
        disabled={ (multiplayerState?.gameData?.rounds > (multiplayerState?.gameData?.generated)) }
        >
          {text("editOptions")}
        </button>
        )}

        </div>
      )}

      {players.slice(0, N).map((player, i) => {
        return (
          <div key={i} className={`multiplayerLeaderboard__player ${player.id === myId ? 'me' : ''}`}>
            { waitingForStart ? (

              <div className="multiplayerLeaderboard__player__username">

                <UsernameWithFlag
                  username={player.username}
                  countryCode={player.countryCode}
                  isGuest={process.env.NEXT_PUBLIC_COOLMATH}
                />
                {player.id === myId && player.username?.startsWith('Guest #') && <span style={{
                  color: "#28a745", 
                  fontWeight: "600",
                  fontSize: "12px"
                }}> ({text("you")})</span>}
                {player.supporter && <span className="badge" style={{
                  marginLeft: "6px", 
                  backgroundColor: "#ffc107",
                  color: "#000",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "700",
                  textTransform: "uppercase"
                }}>{text("supporter")}</span>}
                {player.host && <span style={{
                  color: "#dc3545",
                  fontWeight: "600",
                  fontSize: "12px",
                  marginLeft: "4px"
                }}> ({text("host")})</span>}

              </div>

            ) : (
              <>
            <div className="multiplayerLeaderboard__player__username">#{i + 1} - <UsernameWithFlag
                username={player.username}
                countryCode={player.countryCode}
                isGuest={process.env.NEXT_PUBLIC_COOLMATH}
              />
            {player.id === myId && player.username?.startsWith('Guest #') && <span style={{
              color: "#28a745", 
              fontWeight: "600",
              fontSize: "12px"
            }}> ({text("you")})</span>}
            {player.supporter && <span className="badge" style={{
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
            </>
            )}
          </div>
        );
      })}

      {myIndex >= N && (
        <>
        <span className="multiplayerLeaderboard__separator">...</span>

        <div className="multiplayerLeaderboard__player me">
          <div className="multiplayerLeaderboard__player__username">#{myIndex + 1} - <UsernameWithFlag
            username={players[myIndex].username}
            countryCode={players[myIndex].countryCode}
            isGuest={process.env.NEXT_PUBLIC_COOLMATH}
          /> {players[myIndex].username?.startsWith('Guest #') && <span style={{
            color: "#28a745", 
            fontWeight: "600",
            fontSize: "12px"
          }}>({text("you")})</span>}</div>
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
          { multiplayerState.gameData?.public || host && (

            <button className="gameBtn" onClick={backBtn}>{text("back")}</button>
          )}
            </div>

        )
      }

      { waitingForStart && host && (
        <div className="multiplayerFinalBtns">
          { players.length < 2 ?
          <p style={{
            color: "#721c24",
            fontSize: "14px",
            fontWeight: "500",
            padding: "10px 20px",
            backgroundColor: "#f8d7da",
            borderRadius: "6px",
            border: "1px solid #f5c6cb"
          }}>{text("singlePlayerNeeded")}</p>
        : multiplayerState?.gameData?.rounds > (multiplayerState?.gameData?.generated) ?
        null
        :
        <button className="gameBtn g2_green_button g2_button_style"
        onClick={() => startGameHost()}>{text("startGame")}</button> }

        </div>
      )}

      {(multiplayerState?.gameData?.rounds > (multiplayerState?.gameData?.generated)) &&
        <p style={{
          color: "#856404",
          fontSize: "14px",
          fontWeight: "500",
          padding: "10px 20px",
          backgroundColor: "#fff3cd",
          borderRadius: "6px",
          border: "1px solid #ffc107",
          marginTop: "10px"
        }}>{text("generating")}</p>}

{ waitingForStart && !host && (multiplayerState?.gameData?.rounds== multiplayerState?.gameData?.generated) && (
          <p style={{
            color: "#fff",
            fontSize: "14px",
            fontWeight: "500",
            padding: "10px 20px",
            backgroundColor: "rgba(255, 255, 255, 0.15)",
            borderRadius: "6px",
            marginTop: "10px"
          }}>{text("waitingForHostToStart")}...</p>
      )}
    </div>
  );
}