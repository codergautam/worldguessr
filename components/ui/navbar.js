import { FaArrowLeft, FaUser, FaUserFriends, FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import nameFromCode from "../utils/nameFromCode";
import AccountBtn from "./accountBtn";
import { FaPencil } from "react-icons/fa6";
import { useTranslation } from '@/components/useTranslations'
import { asset } from '@/lib/basePath';
import WsIcon from "../wsIcon";
import SoundModal from "../soundModal";
import { subscribeVolumes, getMusicVolume, getSfxVolume } from "../utils/audio";
import { useState, useEffect, useSyncExternalStore } from "react";

export default function Navbar({ maintenance, joinCodePress, inCrazyGames, inCoolMathGames, inGameDistribution, inGame, openAccountModal, shown, backBtnPressed, reloadBtnPressed, setGameOptionsModalShown, onNavbarPress, onFriendsPress, gameOptions, session, screen, multiplayerState, loading, gameOptionsModalShown, accountModalOpen, selectCountryModalShown, partyModalShown, dailyPhase, mapModalOpen, onConnectionError, loginQueued, setLoginQueued, countryGuessrMode, latLong }) {
    const { t: text, lang } = useTranslation("common");

    // Poki has no login surface (same treatment as CoolMathGames)
    const inPoki = process.env.NEXT_PUBLIC_POKI === "true";

    // SP/CG entry: round 1's load only starts from GameUI's post-paint mount
    // effect, so !loading alone flashes the button for a frame before the
    // load begins. Require the round's location — the same signal that
    // unhides the street view iframe this button reloads (lat/long 0 = the
    // pre-game placeholder, falsy on purpose).
    const spRoundUp = !!(latLong?.lat && latLong?.long);
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
                    {!gameOptionsModalShown && !accountModalOpen && !selectCountryModalShown && !partyModalShown && !(screen === 'daily' && (dailyPhase === 'game' || dailyPhase === 'submitting')) &&  <>
                        <button className={`gameBtn navBtn backBtn ${screen === 'onboarding' ? 'g2_blue_button' : 'g2_red_button'} desktop`} onClick={backBtnPressed}>{screen === 'onboarding' ? text("menu") : text("back")}</button>
                        <button className={`gameBtn navBtn backBtn ${screen === 'onboarding' ? 'g2_blue_button' : 'g2_red_button'} mobile`} onClick={backBtnPressed}><FaArrowLeft /></button>
                    </>
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
                    loggedOut={!session?.token?.secret && screen === 'home'}
                    onClick={!multiplayerState?.connected ? onConnectionError : undefined}
                />


                {screen === 'multiplayer' && multiplayerState?.inGame && multiplayerState?.gameData?.players.length > 0 && (
                    <span id="playerCnt" className="bigSpan">
                        &nbsp; <FaUser /> {multiplayerState.gameData.players.length}
                    </span>
                )}
                <div className="navbar__right">

                    {inPartyLobby && !accountModalOpen && !partyModalShown && (
                        <button className="gameBtn friendBtn" onClick={() => setSoundModalOpen(true)} aria-label={text("audioSettings")}>
                            {allMuted
                                ? <FaVolumeMute size={40} className="friendBtnIcon" />
                                : <FaVolumeUp size={40} className="friendBtnIcon" />}
                        </button>
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

                    {/* visibility (not unmount) while a modal covers it: the
                        entrance animation runs on mount, so unmount+remount
                        replayed the slide every time the modal closed. A
                        finished animation survives a visibility round-trip. */}
                    {!inGame && showAccBtn && !inCoolMathGames && !inPoki && screen !== "onboarding" && screen !== 'daily' && (
                        <div style={{ display: 'contents', visibility: (accountModalOpen || mapModalOpen) ? 'hidden' : 'visible' }}>
                        <AccountBtn
                            inCrazyGames={inCrazyGames}
                            inGameDistribution={inGameDistribution}
                            session={session}
                            navbarMode={screen !== "home"}
                            openAccountModal={openAccountModal}
                            loginQueued={loginQueued}
                            setLoginQueued={setLoginQueued}
                        />
                        </div>
                    )}

                    {/* Modal gates live on the visibility wrapper (same as
                        AccountBtn above): unmounting replayed the entrance
                        every time a modal closed. Screen/state gates stay as
                        mount conditions — those transitions SHOULD replay. */}
                    {session?.token?.secret && screen !== "onboarding" && !["getready", "guess"].includes(multiplayerState?.gameData?.state) && screen !== 'singleplayer' && screen !== 'countryGuesser' && screen !== 'daily' && (
                        <div style={{ display: 'contents', visibility: (accountModalOpen || gameOptionsModalShown || mapModalOpen) ? 'hidden' : 'visible' }}>
                        <button className={`gameBtn friendBtn ${screen === "home" ? "friendBtnFixed" : ""}`} onClick={onFriendsPress} disabled={!multiplayerState?.connected} aria-label="Friends">
                            <FaUserFriends size={40} className={`friendBtnIcon ${screen === "home" ? "friendBtnIconFixed" : ""}`} />
                        </button>
                        </div>
                    )}
                </div>
            </div>
            <SoundModal isOpen={soundModalOpen} onClose={() => setSoundModalOpen(false)} />
            {screen === "onboarding" && (
                <div className="onboardingTopRightBtns">
                    <button
                        className="gameBtn navBtn g2_blue_button onboardingJoinPartyBtn"
                        onClick={joinCodePress}
                    >
                        <span className="onboardingJoinPartyBtn__content">{text("joinGame")}</span>
                    </button>
                    {!inGame && showAccBtn && !inCoolMathGames && !inPoki && !accountModalOpen && !mapModalOpen && (
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
