import { useTranslation } from '@/components/useTranslations'
import guestNameString from '@/serverUtils/guestNameFromString';
import { useEffect, useState } from 'react';
import { FaCopy } from 'react-icons/fa6';
import { toast } from 'react-toastify';
import QRCode from 'qrcode';

export default function PlayerList({ multiplayerState, playAgain, backBtn, startGameHost, onEditClick }) {
  const { t: text } = useTranslation("common");
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  const players = (multiplayerState?.gameData?.finalPlayers ?? multiplayerState?.gameData?.players).sort((a, b) => b.score - a.score);
  const myId = multiplayerState?.gameData?.myId;
  const myIndex = players.findIndex(player => player.id === myId);

  const waitingForStart = multiplayerState.gameData?.state === "waiting";
  const gameOver = multiplayerState.gameData?.state === "end";
  const host = multiplayerState.gameData?.host;
  const gameCode = multiplayerState.gameData?.code;
  const N = waitingForStart ? 200 : 5; // Number of top players to show

  useEffect(() => {
    if (waitingForStart && host && gameCode) {
      const joinUrl = `${window.location.origin}/?code=${gameCode}`;
      QRCode.toDataURL(joinUrl, { errorCorrectionLevel: 'H', width: 256 }, (err, url) => { // Increased width here
        if (err) {
          console.error("Failed to generate QR code:", err);
          setQrCodeUrl('');
        } else {
          setQrCodeUrl(url);
        }
      });
    } else {
      setQrCodeUrl('');
    }
  }, [waitingForStart, host, gameCode]);

  return (
    <div className="multiplayerLeaderboard">
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
        { host && (
        <button onClick={() => {
            onEditClick();
        }} style={{
          marginLeft: "10px",
          padding: "5px",
          backgroundColor: (multiplayerState?.gameData?.rounds > (multiplayerState?.gameData?.generated)) ? "gray": "green",
          color: "white",
          border: "none",
          cursor: (multiplayerState?.gameData?.rounds > (multiplayerState?.gameData?.generated)) ? "not-allowed": "pointer",
          pointerEvents: "all",
          borderRadius: "5px",

        }}
        disabled={ (multiplayerState?.gameData?.rounds > (multiplayerState?.gameData?.generated)) }
        >
          {/* copy icon */}

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

                {
                process.env.NEXT_PUBLIC_COOLMATH?guestNameString(player.username):
                player.username}
                {player.supporter && <span className="badge" style={{marginLeft: "5px", border: '1px black solid'}}>{text("supporter")}</span>}
                {player.host && <span style={{color: "red"}}> ({text("host")})</span>}

              </div>

            ) : (
              <>
            <div className="multiplayerLeaderboard__player__username">#{i + 1} -      {
                process.env.NEXT_PUBLIC_COOLMATH?guestNameString(player.username):
                player.username}

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
          { multiplayerState.gameData?.public || host && (

            <button className="gameBtn" onClick={backBtn}>{text("back")}</button>
          )}
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

      { waitingForStart && host && qrCodeUrl && (
        <div style={{ marginTop: '15px', background: 'white', padding: '10px', display: 'inline-block', borderRadius: '5px', textAlign: 'center' }}>
          <img src={qrCodeUrl} alt="Join Game QR Code" width="256" height="256" />
          <p style={{ color: 'black', marginTop: '5px', fontSize: '0.9em' }}>{text("scanToJoin")}</p>
        </div>
      )}

      {(multiplayerState?.gameData?.rounds > (multiplayerState?.gameData?.generated)) &&
        <p style={{color: "yellow"}}>{text("generating")}</p>}

{ waitingForStart && !host && (multiplayerState?.gameData?.rounds== multiplayerState?.gameData?.generated) && (
          <p style={{color: "red"}}>{text("waitingForHostToStart")}...</p>
      )}
    </div>
  );
}
