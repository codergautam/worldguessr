import { useEffect, useRef, useState } from "react"
import BannerText from "./bannerText"
import PartyLobby from "./partyLobby";
import QueueScreen from "./queueScreen";
import { useTranslation } from '@/components/useTranslations'
import PartyModal from "./partyModal";

// Thin router for the multiplayer screen's pre-game states:
// connection banners → queue banners → one shared dim container hosting the
// join-code card / PartyLobby card.
// In-round UI (leaderboard, round-over) is mounted from gameUI, not here.
export default function MultiplayerHome({ ws, setWs, multiplayerError, multiplayerState, setMultiplayerState, session, handleAction, partyModalShown, setPartyModalShown, selectCountryModalShown, setSelectCountryModalShown, inCrazyGames, openFriends, timeOffset }) {

    const { t: text } = useTranslation("common");

    const [gameOptions, setGameOptions] = useState({
        showRoadName: true, // rate limit fix: showRoadName true
        nm: false,
        npz: false
    });

    useEffect(() => {
        setMultiplayerState((prev) => ({ ...prev, createOptions: { ...prev.createOptions, ...gameOptions } }));
    }, [gameOptions]);

    // ── QUEUE DERIVATIONS + EXIT MACHINERY ──────────────────────────────────
    // ABOVE the early returns below, and it must stay there: this block holds
    // hooks, and a component that early-returns before some of its hooks
    // crashes React the moment a connection flap changes which path renders.
    // Everything here is cheap — plain derivations, two refs, one state that
    // changes twice per match.

    const is2v2Queue = multiplayerState?.gameQueued === "2v2";
    // public === false, not !public: hollow rejoin roster broadcasts omit the
    // boolean, and undefined reading as "private" paints a phantom PartyLobby
    // over ghost game state.
    const inWaitingLobby = multiplayerState?.inGame
        && multiplayerState?.gameData?.state === "waiting"
        && multiplayerState?.gameData?.public === false;
    // Stage 1 of 2v2 matchmaking (teammate search) renders INSIDE the lobby
    // card — the empty seat becomes the searching indicator. The queue screen
    // is stage 2 (opponent search) only. Falls back to the banner if the
    // lobby data is somehow gone.
    const teammateSearch = is2v2Queue
        && multiplayerState?.queueStage === "teammate"
        && inWaitingLobby;
    // Which queue screen to show, if any. gameQueued's own values
    // ('publicDuel' | 'unrankedDuel' | '2v2') travel straight through as both
    // the mode prop and the CSS modifier suffix.
    const rawQueueMode = (is2v2Queue && !teammateSearch)
        ? '2v2'
        : (!is2v2Queue && multiplayerState?.gameQueued)
            ? multiplayerState.gameQueued
            : null;

    // ── MATCH-FORMING BRIDGE ────────────────────────────────────────────────
    // A matchmade duel reaches this client as TWO messages: addPlayer's join
    // payload (state 'waiting' — and processing it clears gameQueued) and,
    // one server beat later, start()'s 'getready'. Dropping the queue screen
    // on the first message left NEITHER veil on screen for the gap, so the
    // background flashed light and then snapped dark when the duel intro
    // mounted (user report Aug 14). The queue screen therefore stays up,
    // FROZEN on its last queued frame, until the game actually starts; the
    // exit ghost below then dissolves it over the intro as designed.
    //
    // DUELS ONLY (`public === true && duel === true`): ranked 1v1 and
    // matchmade 2v2 both call start() in the same server tick that seated the
    // players, so the bridge is momentary by construction. Unranked joins a
    // public non-duel round that can legitimately sit in 'waiting' — freezing
    // a queue clock over that would look broken, so it keeps its banner. The
    // private party lobby can never match: it is public === false, and hollow
    // rejoin broadcasts that omit `public` fail the === true test too.
    //
    // The ref survives only across this bridge — it dies the moment the game
    // starts, ends, or stops being a waiting matchmade duel — so it can never
    // resurrect the queue screen over a later lobby.
    const bridgeModeRef = useRef(null);
    if (multiplayerState?.gameQueued) {
        if (rawQueueMode) bridgeModeRef.current = rawQueueMode;
    } else if (!multiplayerState?.inGame || multiplayerState?.gameData?.state !== 'waiting') {
        bridgeModeRef.current = null;
    }
    const inBridge = !multiplayerState?.gameQueued
        && multiplayerState?.inGame
        && multiplayerState?.gameData?.state === 'waiting'
        && multiplayerState?.gameData?.public === true
        && multiplayerState?.gameData?.duel === true
        && !!bridgeModeRef.current;
    const queueMode = rawQueueMode || (inBridge ? bridgeModeRef.current : null);

    // ── QUEUE EXIT GHOST ────────────────────────────────────────────────────
    // When the queue resolves into a game, the queue screen used to unmount in
    // the same commit the get-ready mounted. The BACKGROUND hands off pixel-
    // perfect (the veils match), but a whole screen of content — radar,
    // headline, plate, clock — vanishing in one frame reads as a jolt (user
    // ruling Aug 14: "jarring"). So the last-rendered queue props are frozen
    // and the screen is kept mounted for one short beat with `exiting`, which
    // dissolves its content over the incoming get-ready. Mobile needs none of
    // this: its queue→getready is a native 300ms route cross-fade, which is
    // exactly the effect this recreates.
    //
    // ONLY when a game actually begins. A cancelled queue (back button) must
    // not leave a ghost fading over the menu — the gate below checks the queue
    // resolved INTO a live game, not merely ended.
    const QUEUE_EXIT_MS = 320;
    const [exitingQueue, setExitingQueue] = useState(null);
    // The snapshot is written every render while TRULY queued (rawQueueMode,
    // not queueMode — bridge frames must not overwrite it with the post-match
    // state where gameQueued/queuedAt are already torn down). Both the bridge
    // render and the ghost show this frozen frame, so the clock and plate
    // cannot pop mid-handoff.
    const queueSnapRef = useRef(null);
    if (rawQueueMode) queueSnapRef.current = multiplayerState;
    const prevQueueModeRef = useRef(null);
    useEffect(() => {
        const prevMode = prevQueueModeRef.current;
        prevQueueModeRef.current = queueMode;
        if (queueMode) { setExitingQueue(null); return; } // re-queued: kill any ghost
        if (!prevMode) return;
        // `multiplayerState` here is THIS commit's — the post-flip state, which
        // is what the "did a game start" gate has to read. 'waiting' is
        // excluded so 2v2's stage-1 handback into the lobby gets no ghost.
        const gameStarting = multiplayerState?.inGame
            && multiplayerState?.gameData?.state
            && multiplayerState.gameData.state !== "waiting";
        if (!gameStarting || !queueSnapRef.current) return;
        setExitingQueue({ mode: prevMode, snapshot: queueSnapRef.current });
        const id = setTimeout(() => setExitingQueue(null), QUEUE_EXIT_MS);
        return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on queue
    // transitions only; multiplayerState is read as the value AT the flip.
    }, [queueMode]);

    if (multiplayerError) {
        return (
            <div className="multiplayerHome">
                <BannerText position={"auto"} text={text("connectionLost")} shown={true} hideCompass={true} />
            </div>
        )
    }

    // Distinguish the three reasons we might be on this screen with no
    // active game/queue/lobby:
    //   1. WS still establishing/verifying (initial load, esp. ?party= deep
    //      links that call setScreen("multiplayer") before the WS handshake
    //      completes) → show "Connecting…", not "Connection Lost".
    //   2. A join request is in flight — we already sent joinPrivateGame and
    //      are waiting for the server to echo back inGame=true → also
    //      "Connecting…", since this is a healthy in-progress action.
    //   3. Genuinely disconnected → "Connection Lost".
    const inActiveSession = multiplayerState?.inGame
        || multiplayerState?.lobbyIntent
        || multiplayerState?.gameQueued
        || multiplayerState?.nextGameQueued;
    const joinInFlight = !!multiplayerState?.joinOptions?.progress;
    const isHandshaking = !multiplayerState?.connected
        || multiplayerState?.connecting
        || !multiplayerState?.verified;

    if (!inActiveSession) {
        if (isHandshaking || joinInFlight) {
            return (
                <div className="multiplayerHome">
                    <BannerText position={"auto"} text={`${text("connecting")}...`} shown={true} hideCompass={true} />
                </div>
            )
        }
        return (
            <div className="multiplayerHome">
                <BannerText position={"auto"} text={text("connectionLost")} shown={true} hideCompass={true} />
            </div>
        )
    }

    // (is2v2Queue / inWaitingLobby / teammateSearch / queueMode and the whole
    // queue exit machinery live ABOVE the early returns — they hold hooks.)
    const lobbyIntent = multiplayerState?.lobbyIntent;
    const showJoinCard = multiplayerState.connected
        && !multiplayerState.inGame
        && !multiplayerState.gameQueued
        && lobbyIntent === 'join';
    // Creator pressed 2v2 / Create Party and the server's `game` message
    // hasn't landed yet → show the lobby's disabled pending shell instantly.
    const pendingCreateShell = !multiplayerState.inGame
        && !multiplayerState.gameQueued
        && (lobbyIntent === 'party' || lobbyIntent === '2v2');
    // The settings modal only means something while the user is (or is
    // becoming) the HOST of a private party. Gate `shown` on that context —
    // not just the partyModalShown flag — so a stale flag (e.g. armed when a
    // disconnect tore the party down mid-edit; no teardown path resets it)
    // can never ambush an unrelated later screen (2v2 lobby, duel queue).
    const partyEditContext = (pendingCreateShell && lobbyIntent === 'party')
        || (inWaitingLobby
            && multiplayerState.gameData?.host
            && !multiplayerState.gameData?.is2v2Lobby);

    return (
        <div className={`multiplayerHome g2_slide_in ${!["waiting"].includes(multiplayerState?.gameData?.state) ? "inGame" : ""}`}>

            {/* One screen for all three queues. `mode` is gameQueued's own
                string, reused verbatim as the CSS modifier — a second
                ranked/unranked vocabulary would need mapping both ways.
                2v2 stage 1 is excluded here on purpose: the teammate search
                renders inside the lobby card below (as it does on mobile), so
                the player keeps the roster and the Cancel button in view.
                No in-queue Cancel (user ruling): the navbar back button is the
                single exit for every mode. */}
            {queueMode && (
                <QueueScreen
                    key={queueMode}
                    mode={queueMode}
                    /* During the match-forming bridge the live state is
                       already torn down (queuedAt/eta nulled by the game
                       payload) — render the frozen snapshot instead so the
                       clock and plate hold still until the intro takes over. */
                    multiplayerState={inBridge ? (queueSnapRef.current || multiplayerState) : multiplayerState}
                    timeOffset={timeOffset}
                    /* Ranked reserves the plate's layout from frame one and
                       fades the server's values in — but only for accounts,
                       because a guest queue never receives a range or an ETA
                       and a reserved cell would sit blank forever. */
                    signedIn={!!session?.token?.secret}
                />
            )}

            {/* The exit ghost (see the machinery above): the queue's final
                frame, dissolving under the incoming get-ready. Frozen props,
                so nothing inside it can change mid-fade. */}
            {!queueMode && exitingQueue && (
                <QueueScreen
                    key="queue-exit"
                    mode={exitingQueue.mode}
                    multiplayerState={exitingQueue.snapshot}
                    timeOffset={timeOffset}
                    signedIn={!!session?.token?.secret}
                    exiting
                />
            )}

            {/* `!inBridge`: a matchmade duel's momentary 'waiting' beat is the
                bridge above, still wearing the queue screen — this banner is
                for games that genuinely sit in a public waiting lobby. */}
            {!multiplayerState.gameQueued && !inBridge && (
                <BannerText position={"auto"} text={`${text("waiting")}...`} shown={multiplayerState.inGame && multiplayerState.gameData?.state === "waiting" && multiplayerState.gameData?.public} />
            )}

            {/* ONE persistent dim container for both card screens. The veil's
                dimFadeIn plays on mount (from opacity 0), so remounting it on
                an internal card swap (join ↔ lobby) flashes the undarkened
                background — keep it mounted and swap only the cards inside. */}
            {(showJoinCard || inWaitingLobby || pendingCreateShell) && (
                <div className="join-party-container">
                    {showJoinCard && (
                        <div className="join-party-card">
                            <h2 className="join-party-title">{text("joinGame")}</h2>

                            <div className="join-party-form">
                                <div className="join-party-input-group">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        autoComplete="off"
                                        className="join-party-input"
                                        placeholder={text("gameCode")}
                                        value={multiplayerState.joinOptions.gameCode || ""}
                                        maxLength={6}
                                        onChange={(e) => setMultiplayerState((prev) => ({
                                            ...prev,
                                            joinOptions: {
                                                ...prev.joinOptions,
                                                error: false,
                                                gameCode: e.target.value.replace(/\D/g, "")
                                            }
                                        }))}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && multiplayerState?.joinOptions?.gameCode?.length === 6 && !multiplayerState?.joinOptions?.progress) {
                                                handleAction("joinPrivateGame", multiplayerState.joinOptions.gameCode);
                                            }
                                        }}
                                    />
                                    <button
                                        className="join-party-button"
                                        disabled={multiplayerState?.joinOptions?.gameCode?.length !== 6 || multiplayerState?.joinOptions?.progress}
                                        onClick={() => handleAction("joinPrivateGame", multiplayerState?.joinOptions?.gameCode)}
                                    >
                                        {multiplayerState?.joinOptions?.progress ? "..." : text("go")}
                                    </button>
                                </div>

                                {multiplayerState?.joinOptions?.error && (
                                    <div className="join-party-error">
                                        {multiplayerState.joinOptions.error}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {(inWaitingLobby || pendingCreateShell) && (
                        <PartyLobby
                            multiplayerState={multiplayerState}
                            handleAction={handleAction}
                            onEditOptions={() => setPartyModalShown(true)}
                            openFriends={openFriends}
                            inCrazyGames={inCrazyGames}
                            session={session}
                        />
                    )}
                </div>
            )}

            <PartyModal selectCountryModalShown={selectCountryModalShown} setSelectCountryModalShown={setSelectCountryModalShown} ws={ws} setWs={setWs} multiplayerError={multiplayerError} multiplayerState={multiplayerState} setMultiplayerState={setMultiplayerState} session={session} handleAction={handleAction} gameOptions={gameOptions} setGameOptions={setGameOptions} onClose={() => setPartyModalShown(false)} shown={partyModalShown && partyEditContext} />

        </div>
    )
}
