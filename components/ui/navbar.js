import { FaArrowLeft, FaUser, FaUserFriends } from "react-icons/fa";
import nameFromCode from "../utils/nameFromCode";
import AccountBtn from "./accountBtn";
import { FaPencil } from "react-icons/fa6";
import { useTranslation } from '@/components/useTranslations'
import { asset } from '@/lib/basePath';
import Image from 'next/image';
import WsIcon from "../wsIcon";
import { useState, useEffect } from "react";

export default function Navbar({ maintenance, joinCodePress, inCrazyGames, inCoolMathGames, inGameDistribution, inGame, openAccountModal, shown, backBtnPressed, reloadBtnPressed, setGameOptionsModalShown, onNavbarPress, onFriendsPress, gameOptions, session, screen, multiplayerState, loading, gameOptionsModalShown, accountModalOpen, selectCountryModalShown, partyModalShown, dailyPhase, mapModalOpen, onConnectionError, loginQueued, setLoginQueued, countryGuessrMode, showAnswer }) {
    const { t: text, lang } = useTranslation("common");

    const reloadBtn = (((multiplayerState?.inGame) || (screen === 'singleplayer') || (screen === 'countryGuesser') || (screen === 'daily' && dailyPhase === 'game'))) && !(multiplayerState?.inGame && multiplayerState?.gameData?.state === "waiting") && !(multiplayerState?.gameData?.duel && multiplayerState?.gameData?.state === "getready");
    const reloadDisabled = !!(loading || showAnswer);

    const [showAccBtn, setShowAccBtn] = useState(true);
    useEffect(() => {
        if (window.location.search.includes("app=true")) {
            setShowAccBtn(false);
        }
    }, []);


    return (
        <>
            <div className={`navbar ${shown ? "" : "hidden"} ${screen == "home" ? "": "navbarColor"} ${screen === "onboarding" ? "onboarding" : ""}`}>
                <div className={`nonHome ${screen === 'home' ? '' : 'shown'}`}>
                    {!mapModalOpen && (
                        <span className="wg-nav__brand" aria-label="WorldGuessr">
                            <Image.default
                                src={asset('/assets/logos/title.png')}
                                alt="WorldGuessr"
                                width={140}
                                height={32}
                                priority
                                draggable={false}
                            />
                        </span>
                    )}
                    {!gameOptionsModalShown && !accountModalOpen && !selectCountryModalShown && !partyModalShown && !(screen === 'daily' && (dailyPhase === 'game' || dailyPhase === 'submitting')) && (
                        <button className="wg-backBtn wg-backBtn--nav" onClick={backBtnPressed}>{screen === 'onboarding' ? text("menu") : text("back")}</button>
                    )}
                </div>
                {reloadBtn && !accountModalOpen && !gameOptionsModalShown && (
                    <button
                        className={`wg-reloadBtn ${reloadDisabled ? 'wg-reloadBtn--disabled' : ''}`}
                        onClick={reloadDisabled ? undefined : reloadBtnPressed}
                        disabled={reloadDisabled}
                        aria-label="Reload pano"
                    >
                        <img src={asset("/return.png")} alt="" height={14} style={{ filter: 'invert(1)' }} />
                    </button>
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

                    {(screen === 'singleplayer' || screen === 'countryGuesser') && !accountModalOpen && (
                        <button className="wg-mapSwitcher g2_lexend" disabled={loading} onClick={() => setGameOptionsModalShown(true)}>
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

                            <FaPencil size={14} />
                        </button>
                    )}

                    {!inGame && showAccBtn && !inCoolMathGames && !accountModalOpen && !mapModalOpen && screen !== "onboarding" && screen !== 'daily' && screen !== "home" && (
                        <AccountBtn
                            inCrazyGames={inCrazyGames}
                            inGameDistribution={inGameDistribution}
                            session={session}
                            openAccountModal={openAccountModal}
                            loginQueued={loginQueued}
                            setLoginQueued={setLoginQueued}
                        />
                    )}

                </div>
            </div>
            {screen === "onboarding" && (
                <div className="onboardingTopRightBtns">
                    <button
                        className="gameBtn navBtn g2_blue_button onboardingJoinPartyBtn"
                        onClick={joinCodePress}
                    >
                        <span className="onboardingJoinPartyBtn__content">{text("joinGame")}</span>
                    </button>
                    {!inGame && showAccBtn && !inCoolMathGames && !accountModalOpen && !mapModalOpen && (
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
