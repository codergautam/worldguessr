import { FaArrowLeft, FaUser, FaUserFriends, FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import nameFromCode from "../utils/nameFromCode";
import AccountBtn from "./accountBtn";
import { FaPencil } from "react-icons/fa6";
import { useTranslation } from '@/components/useTranslations'
import { asset } from '@/lib/basePath';
import WsIcon from "../wsIcon";
import SoundModal from "../soundModal";
import { subscribeVolumes, getMusicVolume, getSfxVolume } from "../utils/audio";
import { HIDE_ACCOUNT_UI } from "../utils/accountUi";
import { useState, useEffect, useSyncExternalStore } from "react";

export default function Navbar({ maintenance, joinCodePress, inCrazyGames, inGameDistribution, inGame, openAccountModal, shown, backBtnPressed, reloadBtnPressed, setGameOptionsModalShown, onNavbarPress, onFriendsPress, gameOptions, session, screen, multiplayerState, loading, gameOptionsModalShown, accountModalOpen, selectCountryModalShown, partyModalShown, dailyPhase, mapModalOpen, loginModalOpen, onConnectionError, loginQueued, setLoginQueued, countryGuessrMode, latLong }) {
    const { t: text, lang } = useTranslation("common");

    // SP/CG entry: round 1's load only starts from GameUI's post-paint mount
    // effect, so !loading alone flashes the button for a frame before the
    // load begins. Require the round's location — the same signal that
    // unhides the street view iframe this button reloads (lat/long 0 = the
    // pre-game placeholder, falsy on purpose).
    const spRoundUp = !!(latLong?.lat && latLong?.long);
    // The matchmaking queue screen is up: any queue EXCEPT 2v2 stage 1, which
    // renders inside the lobby card rather than as its own screen (mirrors
    // multiplayerHome.js's queueMode). Used to withhold the friends button —
    // see its gate below.
    const inQueueScreen = !!multiplayerState?.gameQueued
        && !(multiplayerState.gameQueued === '2v2' && multiplayerState.queueStage === 'teammate');
    // Context decides MOUNTING (which screens/states have a reloadable SV at
    // all); loading and the between-rounds latLong gap only DISABLE — they
    // recur every round, and unmounting on them replayed the entrance
    // animation each round load.
    const reloadBtnContext = (((multiplayerState?.inGame) || screen === 'singleplayer' || screen === 'countryGuesser' || (screen === 'daily' && dailyPhase === 'game'))) && !(multiplayerState?.inGame && multiplayerState?.gameData?.state === "waiting") && !(multiplayerState?.gameData?.duel && multiplayerState?.gameData?.state === "getready");
    const reloadBtnDisabled = loading || ((screen === 'singleplayer' || screen === 'countryGuesser') && !spRoundUp);

    const [showAccBtn, setShowAccBtn] = useState(true);
    // Sound button + modal, party waiting lobby only (private lobbies incl.
    // the 2v2 staging one — in-game has no navbar surface and home already
    // has the full settings page). Entirely navbar-owned: no home.js plumbing.
    // public === false, not !public: hollow rejoin roster broadcasts omit
    // the boolean — undefined must not read as a private lobby.
    const inPartyLobby = screen === 'multiplayer' && multiplayerState?.inGame
        && multiplayerState?.gameData?.state === "waiting" && multiplayerState?.gameData?.public === false;
    const [soundModalOpen, setSoundModalOpen] = useState(false);
    useEffect(() => {
        // Game started / lobby dissolved with the modal up — don't leave it
        // floating over the round.
        if (!inPartyLobby) setSoundModalOpen(false);
    }, [inPartyLobby]);
    // Muted glyph when BOTH channels sit at 0. Subscribed to the audio
    // manager so dragging the modal's sliders flips the icon live; server
    // snapshot is "not muted" (volumes are client storage — unknowable at
    // build, and the button only renders in a lobby anyway).
    const allMuted = useSyncExternalStore(
        subscribeVolumes,
        () => getMusicVolume() <= 0 && getSfxVolume() <= 0,
        () => false
    );
    // Custom tooltip for the blue reload button. Rendered position:fixed (not as a
    // child) so it isn't clipped by the navbar's overflow. null = hidden.
    const [reloadTip, setReloadTip] = useState(null);
    const showReloadTip = (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setReloadTip({ top: r.bottom + 8, right: Math.max(4, window.innerWidth - r.right) });
    };
    const hideReloadTip = () => setReloadTip(null);
    useEffect(() => {
        if (window.location.search.includes("app=true")) {
            setShowAccBtn(false);
        }
    }, []);


    return (
        <>
            <div className={`navbar ${shown ? "" : "hidden"} ${screen == "home" ? "": "navbarColor"} ${screen === "onboarding" ? "onboarding" : ""}`}>
                <div className={`nonHome ${screen === 'home' ? '' : 'shown'}`}>
                    {!mapModalOpen && <h1 className="navbar__title desktop" onClick={onNavbarPress}>WorldGuessr</h1>}
                    {!mapModalOpen && <h1 className="navbar__title mobile" onClick={onNavbarPress}>WG</h1>}
                    {/* Modal gates live on a visibility wrapper (same as
                        AccountBtn / friendBtn below): the back button carries
                        the shared .navBtn hudEnter entrance, and unmounting
                        it replayed the slide-in on every modal close. The
                        daily-phase gate stays a mount condition — that's a
                        real screen transition and should replay. */}
                    {!(screen === 'daily' && (dailyPhase === 'game' || dailyPhase === 'submitting')) &&
                        <div style={{ display: 'contents', visibility: (gameOptionsModalShown || accountModalOpen || selectCountryModalShown || partyModalShown) ? 'hidden' : 'visible' }}>
                        <button className={`gameBtn navBtn backBtn ${screen === 'onboarding' ? 'g2_blue_button' : 'g2_red_button'} desktop`} onClick={backBtnPressed}>{screen === 'onboarding' ? text("menu") : text("back")}</button>
                        <button className={`gameBtn navBtn backBtn ${screen === 'onboarding' ? 'g2_blue_button' : 'g2_red_button'} mobile`} onClick={backBtnPressed}><FaArrowLeft /></button>
                        </div>
                    }
                </div>
                {reloadBtnContext && (
                    <button
                        className="gameBtn navBtn backBtn reloadBtn g2_blue_button"
                        style={{ visibility: (accountModalOpen || gameOptionsModalShown) ? 'hidden' : 'visible' }}
                        disabled={reloadBtnDisabled}
                        onClick={() => { hideReloadTip(); reloadBtnPressed(); }}
                        onMouseEnter={showReloadTip}
                        onMouseLeave={hideReloadTip}
                        onFocus={showReloadTip}
                        onBlur={hideReloadTip}
                        aria-label={text("resetStreetView")}
                    >
                        {/* use svg /arrow-turn-down-left-svgrepo-com.svg white color */}
                        <img src={asset("/return.png")} alt="reload"  height={13} style={{ filter: 'invert(1)', transform: 'scale(1.5)' }} />
                    </button>
                )}
                {reloadTip && (
                    <div className="reloadBtnTooltip" role="tooltip" style={{ top: reloadTip.top, right: reloadTip.right }}>
                        {text("resetStreetView")}
                    </div>
                )}



                <WsIcon
                    connected={multiplayerState?.connected}
                    connecting={multiplayerState?.connecting}
                    shown={screen !== 'onboarding'}
                    onClick={!multiplayerState?.connected ? onConnectionError : undefined}
                />


                {screen === 'multiplayer' && multiplayerState?.inGame && multiplayerState?.gameData?.players.length > 0 && (
                    <span id="playerCnt" className="bigSpan" style={{ visibility: (gameOptionsModalShown || accountModalOpen || selectCountryModalShown || partyModalShown) ? 'hidden' : 'visible' }}>
                        &nbsp; <FaUser /> {multiplayerState.gameData.players.length}
                    </span>
                )}
                <div className="navbar__right">

                    {/* Modal gates on a visibility wrapper (same as the
                        buttons below): unmounting replayed the friendBtn
                        hudEnter entrance every time a modal closed over the
                        lobby. inPartyLobby stays a mount condition — entering
                        the lobby is a real transition. */}
                    {inPartyLobby && (
                        <div style={{ display: 'contents', visibility: (accountModalOpen || partyModalShown) ? 'hidden' : 'visible' }}>
                        <button className="gameBtn friendBtn" onClick={() => setSoundModalOpen(true)} aria-label={text("audioSettings")}>
                            {allMuted
                                ? <FaVolumeMute size={40} className="friendBtnIcon" />
                                : <FaVolumeUp size={40} className="friendBtnIcon" />}
                        </button>
                        </div>
                    )}

                    {(screen === 'singleplayer' || screen === 'countryGuesser') && !accountModalOpen && (
                        <button className="gameBtn navBtn g2_green_button g2_lexend" disabled={loading} onClick={() => setGameOptionsModalShown(true)}>
                            {screen === 'countryGuesser'
                                ? (countryGuessrMode?.subMode === "continent" ? text("continentGuesser") : text("countryGuesser"))
                                : <>
                                    {((gameOptions.location === "all") || !gameOptions.location) ? text("allCountries") : gameOptions?.countryMap ? nameFromCode(gameOptions.location, lang) : gameOptions?.communityMapName}
                                    {gameOptions.nm && gameOptions.npz ?
                                        ', NMPZ' :
                                        gameOptions.nm ? ', NM' :
                                            gameOptions.npz ? ', NPZ' :
                                                ''}
                                </>
                            }

                            &nbsp;

                            <FaPencil size={20} />
                        </button>
                    )}

                    {/* THE HOME ACCOUNT PILL AND THE HOME FRIENDS BUTTON ARE
                        GONE FROM HERE. Both were `position: fixed` children of
                        this flex row — laid out by their own hand-tuned
                        coordinates, never by it — and both opened the same
                        account modal the league chip already opened. On home
                        they live in the PlayerCard now
                        (components/ui/playerCard.js), which is a real flex
                        column and cannot collide with its neighbours. Onboarding
                        keeps its own AccountBtn instance below; that screen has
                        no card.

                        The friends button survives HERE for the multiplayer
                        sub-screens, where it has always been an ordinary
                        in-flow child of .navbar__right — that is the only place
                        this row's `gap: 10px` ever applied.

                        NOT ON THE MATCHMAKING QUEUE (inQueueScreen). This gate
                        is allow-by-default — every screen that isn't named
                        below gets the button — so the queue inherited it by
                        omission, never by decision. There is nothing to do with
                        a friend there: a matchmade 1v1 has no seat to invite
                        anyone into. It earns its place in a PARTY or 2v2 lobby,
                        where filling a seat is the whole job, and 2v2 stage-1
                        keeps it for exactly that reason. Stats while queueing
                        are covered by the PlayerCard, which home.js now mounts
                        on this screen. */}
                    {session?.token?.secret && !inQueueScreen && screen !== "home" && screen !== "onboarding" && !["getready", "guess"].includes(multiplayerState?.gameData?.state) && screen !== 'singleplayer' && screen !== 'countryGuesser' && screen !== 'daily' && (
                        <div style={{ display: 'contents', visibility: (accountModalOpen || gameOptionsModalShown || mapModalOpen || partyModalShown) ? 'hidden' : 'visible' }}>
                        <button className="gameBtn friendBtn" onClick={onFriendsPress} disabled={!multiplayerState?.connected} aria-label="Friends">
                            <FaUserFriends size={40} className="friendBtnIcon" />
                        </button>
                        </div>
                    )}
                </div>
            </div>
            <SoundModal isOpen={soundModalOpen} onClose={() => setSoundModalOpen(false)} />
            {/* !loginModalOpen: this row is z 10001, ABOVE every ui/Modal
                backdrop (9999) — the very reason the login modal opened behind
                the welcome overlay. Left up, these two would float over the
                login's dim as the only lit thing on screen. The login owns the
                screen while it is open; the onboarding chrome steps back, the
                same way the account and maps modals already stand the login
                pill down below. */}
            {screen === "onboarding" && !loginModalOpen && (
                <div className="onboardingTopRightBtns">
                    <button
                        className="gameBtn navBtn g2_blue_button onboardingJoinPartyBtn"
                        onClick={joinCodePress}
                    >
                        <span className="onboardingJoinPartyBtn__content">{text("joinGame")}</span>
                    </button>
                    {!inGame && showAccBtn && !HIDE_ACCOUNT_UI && !accountModalOpen && !mapModalOpen && (
                        <div className="onboardingLoginBtn">
                            <AccountBtn
                                inCrazyGames={inCrazyGames}
                                inGameDistribution={inGameDistribution}
                                session={session}
                                navbarMode={true}
                                openAccountModal={openAccountModal}
                                loginQueued={loginQueued}
                                setLoginQueued={setLoginQueued}
                            />
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
