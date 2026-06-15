import { useState } from 'react';
import { useTranslation } from '@/components/useTranslations'
import { FaCopy, FaLink } from 'react-icons/fa6';
import { FaEye, FaEyeSlash, FaListOl, FaStopwatch, FaLock, FaMap, FaCog, FaPlay, FaUsers } from 'react-icons/fa';
import { toast } from 'react-toastify';
import UsernameWithFlag from './utils/usernameWithFlag';
import playSound from './utils/playSound';

function getPartyLink(code, inCrazyGames) {
  if (process.env.NEXT_PUBLIC_COOLMATH === "true") {
    return code;
  }
  if (inCrazyGames) {
    try {
      const link = window.CrazyGames.SDK.game.showInviteButton({ code });
      if (link) return link;
    } catch(e) {}
  }
  const domain = process.env.NEXT_PUBLIC_DOMAIN || window.location.origin;
  return `${domain}?party=${code}`;
}

async function copyToClipboard(text) {
  // Prefer the modern Clipboard API when available.
  if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  // Fallback for browsers/environments where clipboard API is unavailable.
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (e) {
      copied = false;
    }

    document.body.removeChild(textarea);
    return copied;
  }

  return false;
}

export default function PlayerList({ multiplayerState, playAgain, backBtn, startGameHost, onEditClick, fadingOut, inCrazyGames }) {
  const { t: text } = useTranslation("common");
  const [codeHidden, setCodeHidden] = useState(false);

  const players = (multiplayerState?.gameData?.finalPlayers ?? multiplayerState?.gameData?.players).sort((a, b) => b.score - a.score);
  const myId = multiplayerState?.gameData?.myId;
  const myIndex = players.findIndex(player => player.id === myId);

  const waitingForStart = multiplayerState.gameData?.state === "waiting";
  const gameOver = multiplayerState.gameData?.state === "end";
  const host = multiplayerState.gameData?.host;
  const N = waitingForStart ? 200 : 5;   const partyCode = multiplayerState.gameData?.code || "";
  const partyRounds = multiplayerState.gameData?.rounds;
  const partyNm = multiplayerState?.gameData?.nm;
  const partyNpz = multiplayerState?.gameData?.npz;
  const partyTime = multiplayerState?.gameData?.timePerRound;
  const partyTimerDisabled = partyTime === 60 * 60 * 24;
  const partyLocation = multiplayerState?.gameData?.displayLocation;
  const generationPending = multiplayerState?.gameData?.rounds > (multiplayerState?.gameData?.generated);

  const handleShareLink = async () => {
    const link = getPartyLink(partyCode, inCrazyGames);
    try {
      const copied = await copyToClipboard(link);
      if (copied) {
        toast.success(text("copiedToClipboard"));
      } else {
        toast.error(text("shareFailed"));
      }
    } catch (e) {
      toast.error(text("shareFailed"));
    }
  };

  const handleCopyCode = async () => {
    if (!partyCode) return;
    try {
      const copied = await copyToClipboard(partyCode);
      if (copied) toast.success(text("copiedToClipboard"));
      else toast.error(text("shareFailed"));
    } catch (e) {
      toast.error(text("shareFailed"));
    }
  };

  const leaderboardClasses = [
    'multiplayerLeaderboard',
    waitingForStart ? 'leaderboardWaiting g2_container' : 'leaderboardInRound g2_container',
    fadingOut ? 'leaderboardFadingOut' : 'leaderboardShown'
  ].join(' ');

  return (
    <div className={leaderboardClasses}>
      {!waitingForStart && (
        <span className="bigSpan">
          {gameOver ? text("gameOver") : text("leaderboard")}
        </span>
      )}

      { waitingForStart && (
        <div className="wg-party-room">
          <div className="wg-party-room__hero">
            <h2 className="wg-party-room__title">
              {host ? text("yourPrivateGame") : text("privateGame")}
            </h2>
          </div>

          <div className="wg-party-room__chips">
            <span className="wg-party-room__chip">
              <FaListOl />
              {text("roundsCount", { rounds: partyRounds })}
            </span>
            {!partyTimerDisabled && typeof partyTime === 'number' && (
              <span className="wg-party-room__chip">
                <FaStopwatch />
                {`${partyTime >= 1000 ? Math.round(partyTime / 1000) : partyTime}s`}
              </span>
            )}
            {(partyNm || partyNpz) && (
              <span className="wg-party-room__chip">
                <FaLock />
                {partyNm && partyNpz ? "NMPZ" : partyNm ? "NM" : "NPZ"}
              </span>
            )}
            {partyLocation && (
              <span className="wg-party-room__chip wg-party-room__chip--map">
                <FaMap />
                {partyLocation}
              </span>
            )}
          </div>

          <div className="wg-party-room__codeCard">
            <span className="wg-party-room__codeLabel">Game code</span>
            <span
              className={`wg-party-room__codeValue ${codeHidden ? 'wg-party-room__codeValue--hidden' : ''}`}
              onClick={!codeHidden ? handleCopyCode : undefined}
              title={!codeHidden ? "Click to copy" : undefined}
            >
              {codeHidden ? "••••••" : partyCode}
            </span>
            <div className="wg-party-room__codeActions">
              <button
                type="button"
                className="wg-party-room__codeBtn"
                onClick={() => setCodeHidden((v) => !v)}
                aria-pressed={codeHidden}
              >
                {codeHidden ? <FaEye /> : <FaEyeSlash />}
                {codeHidden ? "Show" : "Hide"}
              </button>
              <button
                type="button"
                className="wg-party-room__codeBtn"
                onClick={handleShareLink}
              >
                <FaLink />
                Share link
              </button>
              <button
                type="button"
                className="wg-party-room__codeBtn"
                onClick={handleCopyCode}
              >
                <FaCopy />
                Copy code
              </button>
            </div>
          </div>

          { host && (
            <div className="wg-party-room__hostActions">
              <button
                type="button"
                className="wg-party-btn wg-party-btn--primary"
                onClick={onEditClick}
                disabled={generationPending}
              >
                <FaCog />
                {text("editOptions")}
              </button>
              { players.length < 2 ? (
                <div className="wg-party-room__inlineNotice wg-party-room__inlineNotice--warn">
                  <FaUsers />
                  {text("singlePlayerNeeded")}
                </div>
              ) : !generationPending ? (
                <button
                  type="button"
                  className="wg-party-btn wg-party-btn--start"
                  onClick={() => startGameHost()}
                >
                  <FaPlay />
                  {text("startGame")}
                </button>
              ) : null}
            </div>
          )}

          { generationPending && (
            <div className="wg-party-room__status wg-party-room__status--info">
              {text("generating")}...
            </div>
          )}
          { !host && !generationPending && (
            <div className="wg-party-room__status wg-party-room__status--neutral">
              {text("waitingForHostToStart")}...
            </div>
          )}

          <div className="wg-party-room__playersHeader">
            <span className="wg-party-room__playersTitle">
              Players
              <span className="wg-party-room__playersCount">{players.length}</span>
            </span>
          </div>
        </div>
      )}

      {players.slice(0, N).map((player, i) => {
        let lastRoundPoints = null;
        if (!waitingForStart) {
          if (multiplayerState?.gameData?.history?.length > 0) {
            const lastRound = multiplayerState.gameData.history[multiplayerState.gameData.history.length - 1];
            const playerRound = lastRound?.players?.[player.id];
            if (playerRound && typeof playerRound.points === 'number') {
              lastRoundPoints = playerRound.points;
            }
          }
          if (lastRoundPoints == null && typeof player.lastPoints === 'number') {
            lastRoundPoints = player.lastPoints;
          }
        }
        let scoreColor = null;
        if (!waitingForStart) {
          const completed = (multiplayerState?.gameData?.history?.length)
            || Math.max(1, (multiplayerState?.gameData?.curRound || 1) - 1);
          const max = 5000 * Math.max(1, completed);
          const pct = (player.score || 0) / max;
          if (pct >= 0.9) scoreColor = '#22d3ee';
          else if (pct >= 0.7) scoreColor = '#7dd3fc';
          else if (pct >= 0.45) scoreColor = '#ffffff';
          else scoreColor = '#cbd5e1';
        }
        const openProfile = (e) => {
          if (!player.username || player.username.startsWith('Guest #')) return;
          e?.stopPropagation?.();
          if (typeof window !== 'undefined' && window.wgOpenProfile) {
            window.wgOpenProfile(player.username);
          }
        };
        const isClickable = player.username && !player.username.startsWith('Guest #');
        return (
          <div
            key={i}
            className={`multiplayerLeaderboard__player ${player.id === myId ? 'me' : ''} ${isClickable ? 'multiplayerLeaderboard__player--clickable' : ''}`}
            onClick={isClickable ? openProfile : undefined}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={isClickable ? ((e) => { if (e.key === 'Enter') openProfile(e); }) : undefined}
            title={isClickable ? `View ${player.username}'s profile` : undefined}
          >
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
            <div
              className="multiplayerLeaderboard__player__score"
              style={{
                color: scoreColor || '#ffffff',
              }}
            >
              {player.score}
              {lastRoundPoints != null && (
                <span className="multiplayerLeaderboard__player__delta">
                  +{lastRoundPoints}
                </span>
              )}
            </div>
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
            <button className="gameBtn" onClick={() => { playSound('interfaceClick'); playAgain?.(); }}>{text("playAgain")}</button>
          )}
          { multiplayerState.gameData?.public || host && (

            <button className="gameBtn" onClick={() => { playSound('interfaceClick'); backBtn?.(); }}>{text("back")}</button>
          )}
            </div>

        )
      }

    </div>
  );
}
