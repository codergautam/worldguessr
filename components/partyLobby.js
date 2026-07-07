import { useState, useEffect, useRef } from 'react';
import NextImage from 'next/image';
import { useTranslation } from '@/components/useTranslations';
import { FaLink, FaUserPlus, FaBolt, FaPlay, FaCrown, FaPen, FaEye, FaEyeSlash, FaXmark, FaShuffle, FaChevronRight, FaChevronLeft } from 'react-icons/fa6';
import { toast } from 'react-toastify';
import UsernameWithFlag from './utils/usernameWithFlag';
import { getLeague } from './utils/leagues';
import { copyPartyLink } from './utils/partyLink';
import { asset } from '@/lib/basePath';
import Modal from './ui/Modal';

// The one lobby card for every private pre-game screen. A party waiting room
// and a 2v2 staging lobby are the same server object (a private waiting-state
// Game), so they share this UI — only the title and the single primary action
// differ.
//
// Layout discipline: code hero → roster → (party settings line) → ONE primary
// button → at most one status line. Anything more is clutter.
//
// Renders instantly as a disabled "pending shell" while the server creates the
// lobby. Only creators ever see the shell (joiners arrive through the join
// screen and only land here once gameData exists), so the shell may present
// host controls; once gameData lands, only the server's `host` flag decides.
export default function PartyLobby({ multiplayerState, handleAction, onEditOptions, openFriends, inCrazyGames, session }) {
  const { t: text } = useTranslation("common");

  // Streamer mode: mask the code on screen while keeping it copyable.
  const [codeHidden, setCodeHidden] = useState(false);

  // Kick confirmation modal. The target survives closing so the message
  // doesn't blank out mid fade-out animation.
  const [kickTarget, setKickTarget] = useState(null);
  const [kickModalOpen, setKickModalOpen] = useState(false);

  const gameData = multiplayerState?.gameData;
  const pending = !gameData?.code;
  const host = pending || !!gameData?.host;
  const is2v2 = multiplayerState?.lobbyIntent === '2v2' || !!gameData?.is2v2Lobby;
  // Stage 1 of 2v2 matchmaking lives inside this card: the empty seat turns
  // into the teammate-search indicator and Find Match becomes Cancel.
  const teammateSearch = multiplayerState?.gameQueued === '2v2'
    && multiplayerState?.queueStage === 'teammate';

  // "Queueing in 3…" — the server stamps the lobby state with the remaining
  // ms before it auto-queues (post-pairing preview / pregame-cancel regroup).
  const autoQueueInMs = multiplayerState?.gameData?.autoQueueInMs;
  const [queueCountdown, setQueueCountdown] = useState(null);
  useEffect(() => {
    if (autoQueueInMs == null) { setQueueCountdown(null); return; }
    const deadline = Date.now() + autoQueueInMs;
    // Clamp to 1: the handoff to the queue screen replaces "0".
    const tick = () => {
      const left = deadline - Date.now();
      // The server drives the handoff; 3s past the deadline the stamp is dead
      // (dropped transition / stale state) — free the button instead of
      // painting a disabled "Queueing in 1…" forever. Find Match re-queues
      // idempotently, so re-pressing is a safe recovery.
      if (left < -3000) { setQueueCountdown(null); return; }
      setQueueCountdown(Math.max(1, Math.ceil(left / 1000)));
    };
    tick();
    const iv = setInterval(tick, 200);
    return () => clearInterval(iv);
  }, [autoQueueInMs]);

  const myName = session?.token?.username || multiplayerState?.guestName || text("you");
  const players = pending
    ? [{ id: 'self', username: myName, countryCode: null, host: true }]
    : (gameData?.players || []);
  // Pending shell: myId must match the placeholder row's 'self' id or the
  // "(You)" tag never renders on the creator's own row.
  const myId = gameData?.myId ?? (pending ? 'self' : undefined);

  // 2v2 staging shows its one empty seat explicitly; open parties just grow.
  const seatCount = gameData?.maxPlayers ?? (is2v2 ? 2 : Infinity);
  const emptySeats = seatCount <= 4 ? Math.max(0, seatCount - players.length) : 0;
  // Full lobby: nobody left to invite. Greys the invite-friends button here;
  // the friends modal hides its invite buttons (canSendInvite) and the server
  // refuses inviteFriend with gameIsFull, so all three layers agree.
  const partyFull = players.length >= seatCount;

  const generatingBlocked = pending || (gameData?.rounds > gameData?.generated);
  const isLoggedIn = !!session?.token?.secret;

  // ── Intra-party team mode. All team UI is gated !is2v2 && !pending so the
  // 2v2 staging lobby and the create shell stay pixel-identical.
  const teamGame = !is2v2 && !pending && !!gameData?.teamGame;
  const teamA = teamGame ? players.filter((p) => p.team === 'a') : [];
  const teamB = teamGame ? players.filter((p) => p.team === 'b') : [];
  // Server invariant says this is always empty — render defensively anyway so
  // no payload ordering can ever drop a player from the roster.
  const unassigned = teamGame ? players.filter((p) => p.team !== 'a' && p.team !== 'b') : [];
  const teamBlocked = teamGame && (teamA.length === 0 || teamB.length === 0);
  const canMove = (p) => !!(host || (gameData?.allowTeamPick && p.id === myId));

  // Pulse the row that just switched columns (optimistic move or broadcast).
  const [movedIds, setMovedIds] = useState(() => new Set());
  const prevTeamsRef = useRef({});
  const teamFingerprint = players.map((p) => `${p.id}:${p.team ?? ''}`).join(',');
  useEffect(() => {
    const cur = {};
    for (const p of players) cur[p.id] = p.team;
    const moved = Object.keys(cur).filter(
      (id) => prevTeamsRef.current[id] && cur[id] && prevTeamsRef.current[id] !== cur[id]
    );
    prevTeamsRef.current = cur;
    if (moved.length) {
      setMovedIds(new Set(moved));
      const t = setTimeout(() => setMovedIds(new Set()), 450);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamFingerprint]);

  // Settings chip copy: mode is shown as info only — all editing (mode,
  // scoring, team pick, rounds, timer, map) lives in the Edit Options modal.
  const scoringKey = (gameData?.teamScoring ?? 'closest') === 'average' ? 'scoringAverage' : 'scoringClosest';

  // One row renderer for the classic roster, the team columns, and the
  // defensive unassigned strip — same name/you/crown/kick furniture, plus a
  // move chevron in team mode for whoever may move this player.
  const renderPlayerRow = (p, { compact = false, unassigned: isUnassigned = false } = {}) => (
    <div
      key={p.id}
      className={`party-lobby__player ${compact ? 'party-lobby__player--compact' : ''} ${movedIds.has(p.id) ? 'party-lobby__player--moved' : ''}`}
    >
      <span className="party-lobby__player-name">
        <UsernameWithFlag username={p.username} countryCode={p.countryCode} isGuest={process.env.NEXT_PUBLIC_COOLMATH} />
        {/* League-colored "(elo)" like the duel HP bars; guests carry no elo
            (and the pending-shell placeholder row has none) so it just skips. */}
        {typeof p.elo === 'number' && (
          <span className="party-lobby__elo" style={{
            color: getLeague(p.elo)?.light ?? getLeague(p.elo)?.color ?? '#60a5fa',
            textShadow: `0 0 10px ${getLeague(p.elo)?.light ?? getLeague(p.elo)?.color ?? '#60a5fa'}60`
          }}>
            ({p.elo})
          </span>
        )}
      </span>
      <span className="party-lobby__player-tags">
        {p.id === myId && <span className="party-lobby__you">{text("you")}</span>}
        {p.host && <FaCrown className="party-lobby__crown" title={text("host")} />}
        {teamGame && isUnassigned && canMove(p) && (
          <>
            <button className="party-lobby__move" title={text("moveToTeam", { team: text("team1") })}
              onClick={() => handleAction("setPlayerTeam", p.id, 'a')}><FaChevronLeft /></button>
            <button className="party-lobby__move" title={text("moveToTeam", { team: text("team2") })}
              onClick={() => handleAction("setPlayerTeam", p.id, 'b')}><FaChevronRight /></button>
          </>
        )}
        {teamGame && !isUnassigned && (p.team === 'a' || p.team === 'b') && canMove(p) && (
          <button
            className="party-lobby__move"
            aria-label={p.id === myId ? text("switchTeam") : text("moveToTeam", { team: text(p.team === 'a' ? 'team2' : 'team1') })}
            title={p.id === myId ? text("switchTeam") : text("moveToTeam", { team: text(p.team === 'a' ? 'team2' : 'team1') })}
            onClick={() => handleAction("setPlayerTeam", p.id, p.team === 'a' ? 'b' : 'a')}
          >{p.team === 'a' ? <FaChevronRight /> : <FaChevronLeft />}</button>
        )}
        {host && !pending && !is2v2 && p.id !== myId && (
          <button
            className="party-lobby__kick"
            aria-label={text("kickPlayer")}
            title={text("kickPlayer")}
            onClick={() => {
              setKickTarget({ id: p.id, username: p.username });
              setKickModalOpen(true);
            }}
          ><FaXmark /></button>
        )}
      </span>
    </div>
  );

  const copyLink = async () => {
    const ok = await copyPartyLink(gameData.code, inCrazyGames);
    if (ok) toast.success(text("inviteLinkCopied"));
    else toast.error(text("shareFailed"));
  };

  // timePerRound arrives in ms; the "timer disabled" sentinel is 24h.
  const timerLabel = gameData?.timePerRound >= 24 * 60 * 60 * 1000
    ? text("timerOff")
    : text("secondsShort", { secs: Math.round((gameData?.timePerRound ?? 0) / 1000) });
  const modeSuffix = gameData?.nm && gameData?.npz ? " · NMPZ"
    : gameData?.nm ? " · NM"
    : gameData?.npz ? " · NPZ" : "";

  // One source for the countdown label — it renders in two places (non-host
  // status line, host Find Match button) and must never drift between them.
  const queueingLabel = queueCountdown != null ? `${text("queueingIn", { s: queueCountdown })}…` : null;

  // At most ONE status line, picked by priority.
  let status = null;
  if (queueingLabel && !host) status = queueingLabel;
  else if (!host) status = `${text("waitingForHostToStart")}...`;
  else if (is2v2 && players.length < 2 && !teammateSearch) status = text("twovtwoSoloHint");
  else if (!is2v2 && !pending && players.length < 2) status = text("singlePlayerNeeded");
  else if (teamBlocked) status = text("teamNeedsPlayers");
  else if (!is2v2 && !pending && generatingBlocked) status = `${text("generating")}...`;

  // No .join-party-container wrapper here: multiplayerHome owns ONE
  // persistent dim container for the join card and this lobby, so swapping
  // cards can't remount the veil (dimFadeIn from opacity 0 = background flash).
  return (
    <>
      {/* Parties get a wider card (roster + team columns need room); the 2v2
          staging lobby keeps the original compact footprint. */}
      <div className={`join-party-card party-lobby ${!is2v2 ? 'party-lobby--party' : ''}`}>
        <div className="party-lobby__header">
          <h2 className="party-lobby__title">
            {is2v2 ? text("twovtwoTeamLobby") : (host ? text("yourPrivateGame") : text("privateGame"))}
          </h2>
          {/* Rescue link in the subtitle slot: players holding a friend's
              code keep clicking 2v2 and landing here instead of the join
              screen. */}
          {is2v2 && !teammateSearch && players.length < 2 && (
            <button
              className="party-lobby__join-link"
              onClick={() => handleAction("joinPrivateGame")}
            >{text("twovtwoHaveCode")}</button>
          )}
        </div>

        <div className="party-lobby__code-block">
          <div className="party-lobby__code-label-row">
            <span className="party-lobby__code-label">{text("gameCode")}</span>
            <button
              className="party-lobby__eye"
              aria-label={codeHidden ? text("showCode") : text("hideCode")}
              title={codeHidden ? text("showCode") : text("hideCode")}
              disabled={pending}
              onClick={() => setCodeHidden((v) => !v)}
            >{codeHidden ? <FaEyeSlash /> : <FaEye />}</button>
          </div>
          <div className="party-lobby__code-row">
            <span className="party-lobby__code">{pending || codeHidden ? "••••••" : gameData.code}</span>
            <button
              className="party-lobby__icon-btn"
              aria-label={text("copyLink")}
              title={text("copyLink")}
              disabled={pending}
              onClick={copyLink}
            ><FaLink /></button>
            {isLoggedIn && openFriends && (
              <button
                className="party-lobby__icon-btn"
                aria-label={text("inviteFriends")}
                title={text("inviteFriends")}
                disabled={pending || partyFull}
                onClick={openFriends}
              ><FaUserPlus /></button>
            )}
          </div>
        </div>

        {/* Party settings: labeled chips beginners can actually read, with the
            pencil in the section header. Hidden for 2v2: matchmade games use
            fixed standard settings, so options there would be editable lies. */}
        {!is2v2 && (
          <div className="party-lobby__section">
            <div className="party-lobby__section-head">
              <span className="party-lobby__section-label">{text("settings")}</span>
              {host && (
                <button
                  className="party-lobby__edit-btn"
                  disabled={generatingBlocked}
                  onClick={onEditOptions}
                ><FaPen /> {text("editOptions")}</button>
              )}
            </div>
            <div className="party-lobby__chips">
              <div className="party-lobby__chip">
                <span className="party-lobby__chip-label">{text("gameMode")}</span>
                <span
                  className="party-lobby__chip-value"
                  title={teamGame ? `${text("teamDuel")} · ${text(scoringKey)}` : text("classicMode")}
                >
                  {pending ? "…" : (teamGame ? `${text("teamDuel")} · ${text(scoringKey)}` : text("classicMode"))}
                </span>
              </div>
              <div className="party-lobby__chip">
                <span className="party-lobby__chip-label">{text("map")}</span>
                <span className="party-lobby__chip-value">
                  {pending ? "…" : (gameData?.displayLocation || text("allCountries")) + modeSuffix}
                </span>
              </div>
              <div className="party-lobby__chip">
                <span className="party-lobby__chip-label">{text("rounds")}</span>
                <span className="party-lobby__chip-value">{pending ? "…" : gameData?.rounds}</span>
              </div>
              <div className="party-lobby__chip">
                <span className="party-lobby__chip-label">{text("timer")}</span>
                <span className="party-lobby__chip-value">{pending ? "…" : timerLabel}</span>
              </div>
            </div>
          </div>
        )}

        <div className="party-lobby__section">
          <div className="party-lobby__section-head">
            <span className="party-lobby__section-label">{teamGame ? text("teams") : text("players")}</span>
            {teamGame && host && (
              <button
                className="party-lobby__edit-btn"
                disabled={players.length < 2}
                onClick={() => handleAction("shuffleTeams")}
              ><FaShuffle /> {text("shuffleTeams")}</button>
            )}
            <span className="party-lobby__count">
              {/* Same "small cap = real seats" threshold as emptySeats above:
                  open parties (server default 200) show a plain count, not a
                  fake-looking "3/200". */}
              {teamGame
                ? `${teamA.length}v${teamB.length}`
                : `${players.length}${seatCount <= 4 ? `/${seatCount}` : ''}`}
            </span>
          </div>

          {teamGame ? (
            <>
              <div className="party-lobby__teams">
                {[['a', teamA], ['b', teamB]].map(([teamKey, teamPlayers]) => (
                  <div
                    key={teamKey}
                    className={`party-lobby__team ${players.find((p) => p.id === myId)?.team === teamKey ? 'party-lobby__team--mine' : ''}`}
                  >
                    <div className="party-lobby__team-head">
                      <span className="party-lobby__team-name">{text(teamKey === 'a' ? 'team1' : 'team2')}</span>
                      <span className="party-lobby__team-count">{teamPlayers.length}</span>
                    </div>
                    {teamPlayers.map((p) => renderPlayerRow(p, { compact: true }))}


                    {teamPlayers.length === 0 && (
                      <div className="party-lobby__team-empty">
                        {host ? text("teamNeedsPlayer") : text("noPlayersYet")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {unassigned.length > 0 && (
                <div className="party-lobby__team party-lobby__team--unassigned">
                  {unassigned.map((p) => renderPlayerRow(p, { compact: true, unassigned: true }))}
                </div>
              )}
              {!host && gameData?.allowTeamPick && (
                <p className="party-lobby__hint party-lobby__hint--action">{text("youCanSwitchTeams")}</p>
              )}
            </>
          ) : (
            <div className="party-lobby__roster">
              {players.map((p) => renderPlayerRow(p))}
              {Array.from({ length: emptySeats }).map((_, i) => (
                <div key={`empty-${i}`} className={`party-lobby__player party-lobby__player--empty ${teammateSearch ? 'party-lobby__player--searching' : ''}`}>
                  {teammateSearch && (
                    <NextImage.default alt="" src={asset('/loader.webp')} width={22} height={22} />
                  )}
                  {teammateSearch ? text("findingTeammate") : text("waitingForTeammate")}...
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="party-lobby__footer">
          {host && is2v2 && !teammateSearch && (
            <button
              className="gameBtn g2_green_button g2_button_style party-lobby__action"
              disabled={pending || queueCountdown != null}
              onClick={() => handleAction("find2v2Match")}
            ><FaBolt /> {queueingLabel ?? text("findMatch")}</button>
          )}
          {is2v2 && teammateSearch && (
            <button
              className="gameBtn g2_button_style party-lobby__action"
              onClick={() => handleAction("cancelTeammateSearch")}
            >{text("cancel")}</button>
          )}
          {host && !is2v2 && players.length >= 2 && !generatingBlocked && !teamBlocked && (
            <button
              className="gameBtn g2_green_button g2_button_style party-lobby__action"
              onClick={() => handleAction("startGameHost")}
            ><FaPlay /> {text("startGame")}</button>
          )}
          {status && <p className="party-lobby__status">{status}</p>}
        </div>
      </div>

      <Modal
        isOpen={kickModalOpen}
        onClose={() => setKickModalOpen(false)}
        title={text("kickPlayer")}
        actions={
          <>
            <button onClick={() => setKickModalOpen(false)}>{text("cancel")}</button>
            <button onClick={() => {
              handleAction("kickPlayer", kickTarget?.id);
              setKickModalOpen(false);
            }}>{text("kickPlayer")}</button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{text("kickConfirm", { name: kickTarget?.username ?? "" })}</p>
      </Modal>
    </>
  );
}
