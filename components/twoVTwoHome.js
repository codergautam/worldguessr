import { useState } from 'react';
import { useTranslation } from '@/components/useTranslations';
import { FaArrowLeft, FaCopy, FaUserPlus, FaBolt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import BannerText from './bannerText';
import UsernameWithFlag from './utils/usernameWithFlag';

async function copyText(value) {
  if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return true; } catch (e) {}
  }
  if (typeof document !== "undefined") {
    const ta = document.createElement("textarea");
    ta.value = value; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  return false;
}

export default function TwoVTwoHome({ multiplayerState, setMultiplayerState, handleAction, backBtn, session, inCrazyGames, openFriends }) {
  const { t: text } = useTranslation("common");
  const [joinCode, setJoinCode] = useState("");

  const gameData = multiplayerState?.gameData;
  const inLobby = !!(multiplayerState?.inGame && gameData?.is2v2Lobby);
  const queued = multiplayerState?.gameQueued === "2v2";

  // ---- Finding match ----
  if (queued && !inLobby) {
    return (
      <div className="multiplayerHome twovtwo">
        <BannerText position={"auto"} text={`${text("findingMatch")}...`} shown={true} subText={text("twovtwoUnranked")} hideCompass={true} />
        <div className="twovtwo-actions">
          <button className="gameBtn g2_button_style" onClick={backBtn}>{text("cancel")}</button>
        </div>
      </div>
    );
  }

  // ---- Team lobby (everything on one page) ----
  // Render the shell immediately on press; gameData fills in a beat later (no
  // "Connecting…" flash — matches the instant feel of the Create Party button).
  const ready = inLobby;
  const players = gameData?.players || [];
  const host = ready ? gameData?.host : true; // you created it → you're host
  const code = gameData?.code;
  const isLoggedIn = !!session?.token?.secret;

  const submitJoin = () => {
    if (joinCode.length === 6) handleAction("join2v2Lobby", joinCode);
  };

  return (
    <div className="multiplayerHome twovtwo">
      <div className="join-party-container">
        <div className="join-party-card twovtwo-lobby-card">
          <h2 className="join-party-title twovtwo-lobby-title">{text("twovtwoTeamLobby")}</h2>

          <div className="twovtwo-lobby-grid">
            {/* ---- Left: quick match ---- */}
            <section className="twovtwo-panel">
              <h3 className="twovtwo-panel-title">{text("quickMatch")}</h3>

              <div className="twovtwo-roster">
                {[0, 1].map((i) => {
                  const p = players[i];
                  return (
                    <div key={i} className={`twovtwo-slot ${p ? 'filled' : 'empty'}`}>
                      {p ? (
                        <UsernameWithFlag username={p.username} countryCode={p.countryCode} isGuest={process.env.NEXT_PUBLIC_COOLMATH} />
                      ) : (
                        <span className="twovtwo-slot-empty">{text("waitingForTeammate")}...</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {host ? (
                <>
                  <button className="gameBtn g2_green_button g2_button_style twovtwo-find" disabled={!ready} onClick={() => handleAction("find2v2Match")}>
                    <FaBolt /> {text("findMatch")}
                  </button>
                  {players.length < 2 && <p className="twovtwo-hint">{text("twovtwoSoloHint")}</p>}
                </>
              ) : (
                <p className="twovtwo-waiting">{text("waitingForHostToStart")}...</p>
              )}
            </section>

            {/* ---- Right: play with a friend ---- */}
            <section className="twovtwo-panel">
              <h3 className="twovtwo-panel-title">{text("playWithFriend")}</h3>

              <div className="twovtwo-code-box">
                <span className="twovtwo-code-label">{text("gameCode")}</span>
                <div className="twovtwo-code-line">
                  <span className="twovtwo-code">{code || "······"}</span>
                  <button className="twovtwo-copy" aria-label={text("copyCode")} title={text("copyCode")} disabled={!code} onClick={async () => {
                    const ok = await copyText(String(code));
                    if (ok) toast.success(text("copiedToClipboard")); else toast.error(text("shareFailed"));
                  }}><FaCopy /></button>
                  {isLoggedIn && openFriends && (
                    <button className="twovtwo-copy" aria-label={text("inviteFriend")} title={text("inviteFriend")} onClick={openFriends}>
                      <FaUserPlus />
                    </button>
                  )}
                </div>
              </div>

              <div className="join-party-input-group twovtwo-join-row">
                <input
                  type="text"
                  className="join-party-input"
                  placeholder={text("joinTeam")}
                  value={joinCode}
                  maxLength={6}
                  onChange={(e) => {
                    setJoinCode(e.target.value.replace(/\D/g, ""));
                    if (multiplayerState?.joinOptions?.error) {
                      setMultiplayerState((prev) => ({ ...prev, joinOptions: { ...prev.joinOptions, error: false } }));
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitJoin(); }}
                />
                <button
                  className="join-party-button"
                  disabled={joinCode.length !== 6 || multiplayerState?.joinOptions?.progress}
                  onClick={submitJoin}
                >{multiplayerState?.joinOptions?.progress ? "..." : text("go")}</button>
              </div>
              {multiplayerState?.joinOptions?.error && (
                <div className="join-party-error">{multiplayerState.joinOptions.error}</div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
