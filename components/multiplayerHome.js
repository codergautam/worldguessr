import { useEffect, useState } from "react"
import BannerText from "./bannerText"
import PartyLobby from "./partyLobby";
import { useTranslation } from '@/components/useTranslations'
import PartyModal from "./partyModal";

// Thin router for the multiplayer screen's pre-game states:
// connection banners → queue banners → one shared dim container hosting the
// join-code card / PartyLobby card.
// In-round UI (leaderboard, round-over) is mounted from gameUI, not here.
export default function MultiplayerHome({ ws, setWs, multiplayerError, multiplayerState, setMultiplayerState, session, handleAction, partyModalShown, setPartyModalShown, selectCountryModalShown, setSelectCountryModalShown, inCrazyGames, openFriends }) {

    const { t: text } = useTranslation("common");

    const [gameOptions, setGameOptions] = useState({
        showRoadName: true, // rate limit fix: showRoadName true
        nm: false,
        npz: false
    });

    useEffect(() => {
        setMultiplayerState((prev) => ({ ...prev, createOptions: { ...prev.createOptions, ...gameOptions } }));
    }, [gameOptions]);

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

    const lobbyIntent = multiplayerState?.lobbyIntent;
    const showJoinCard = multiplayerState.connected
        && !multiplayerState.inGame
        && !multiplayerState.gameQueued
        && lobbyIntent === 'join';
    const is2v2Queue = multiplayerState.gameQueued === "2v2";
    // public === false, not !public: hollow rejoin roster broadcasts omit the
    // boolean, and undefined reading as "private" paints a phantom PartyLobby
    // over ghost game state.
    const inWaitingLobby = multiplayerState.inGame
        && multiplayerState.gameData?.state === "waiting"
        && multiplayerState.gameData?.public === false;
    // Stage 1 of 2v2 matchmaking (teammate search) renders INSIDE the lobby
    // card — the empty seat becomes the searching indicator. The queue banner
    // below is stage 2 (opponent search) only. Falls back to the banner if
    // the lobby data is somehow gone.
    const teammateSearch = is2v2Queue
        && multiplayerState.queueStage === "teammate"
        && inWaitingLobby;
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

            {/* Same compass spinner as the 1v1 duel queue below — the queue
                screens read as one family. No in-banner Cancel (user ruling):
                the navbar back button is the single exit, and it does exactly
                what the old button did (both were backBtnPressed). */}
            {is2v2Queue && !teammateSearch && (
                <BannerText position={"auto"} text={`${text("findingMatch")}...`} shown={true} />
            )}

            <BannerText text={text("findingGame")} shown={multiplayerState.gameQueued && !is2v2Queue} position={"auto"} subText={
                multiplayerState?.publicDuelRange ? `${text("eloRange")}: ${multiplayerState?.publicDuelRange[0]} - ${multiplayerState?.publicDuelRange[1]}` : undefined
            } />

            {!multiplayerState.gameQueued && (
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
