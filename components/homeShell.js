import HeadContent from "@/components/headContent";
import Home from "@/components/home";
import { FaDiscord, FaBook } from "react-icons/fa";
import { FaGear, FaRankingStar, FaYoutube } from "react-icons/fa6";
import { useSession } from "@/components/auth/auth";
import 'react-responsive-modal/styles.css';
import { useEffect, useState, useRef, useCallback } from "react";
import Navbar from "@/components/ui/navbar";
import BannerText from "@/components/bannerText";
import shuffle from "@/utils/shuffle";
// findLatLongRandom is dynamically imported when needed to avoid loading Google Maps API on page load
import Link from "next/link";
import React from "react";
import countryMaxDists from '../public/countryMaxDists.json';
import { useTranslation } from '@/components/useTranslations'
import useWindowDimensions from "@/components/useWindowDimensions";
import AnalyticsScripts from "@/components/homeShell/AnalyticsScripts";
import ModerationBanners from "@/components/homeShell/ModerationBanners";
import GameScreens from "@/components/homeShell/GameScreens";
import HomeShellModals from "@/components/homeShell/HomeShellModals";
import useWsMessageHandler from "@/components/homeShell/useWsMessageHandler";
import useLocationHandlers from "@/components/homeShell/useLocationHandlers";
import useMultiplayerHandlers from "@/components/homeShell/useMultiplayerHandlers";
import useHomeShellEffects from "@/components/homeShell/useHomeShellEffects";
import HomeShellMapsModal from "@/components/homeShell/HomeShellMapsModal";
import { useMoreHomeShellEffects, useHomeShellGoogleLogin } from "@/components/homeShell/useMoreHomeShellEffects";
import sendEvent from "@/components/utils/sendEvent";
import { useMultiplayer, initialMultiplayerState } from "@/components/multiplayer/MultiplayerProvider";
import { getPlatform } from "@/components/utils/getPlatform";
import 'react-toastify/dist/ReactToastify.css';
import dynamic from "next/dynamic";
import NextImage from "next/image";
import OnboardingText from "@/components/onboardingText";
import continentFromCode, { ALL_CONTINENTS } from "@/components/utils/continentFromCode";
import { useRouter } from 'next/router';
import { asset } from '@/lib/basePath';
import { preloadPinImages } from '@/lib/markerIcons';
// Pre-existing dynamic chunks: results screen and daily-challenge screen are
// big and only render after a round/onboarding completes. AccountModal stays
// dynamic because it pulls in chart.js (~220 KB) for the XP graph — saving
// that on the critical path is worth the one-time async open. MapGuessrModal
// is also kept dynamic to match its prior behavior.
const DailyChallengeScreen = dynamic(() => import('@/components/daily/DailyChallengeScreen'), { ssr: false });
import ChatBox from "@/components/chatBox";
import SettingsModal from "@/components/settingsModal";
import MapsModal from "@/components/maps/mapsModal";
import AlertModal from "@/components/ui/AlertModal";
import WhatsNewModal from "@/components/ui/WhatsNewModal";
import DailyMenuItem from '@/components/daily/DailyMenuItem';
import DailyCommunityMapsButton from '@/components/daily/DailyCommunityMapsButton';
import msToTime from "@/components/msToTime";
import { inIframe, isForbiddenIframe } from "@/components/utils/inIframe";

import countries from "@/public/countries.json";
import officialCountryMaps from "@/public/officialCountryMaps.json";

import gameStorage from "@/components/utils/localStorage";
import changelog from "@/components/changelog.json";
// import haversineDistance from "./utils/haversineDistance";
import StreetView from "./streetview/streetView";
// import SvEmbedIframe from "./streetview/svHandler"; // REMOVED: Using direct StreetView instead of double-iframe setup
// import getTimeString, { getMaintenanceDate } from "./maintenanceTime";
// import MaintenanceBanner from "./MaintenanceBanner";
import Ad from "./bannerAdNitro";
import GameDistributionBanner from "./bannerAdGameDistribution";


export default function HomeShell({ initialScreen, dailyBootstrap } = {}) {

    const { width, height } = useWindowDimensions();
    const router = useRouter();
    const langInitRef = useRef(true);
    const statsRef = useRef();

    const [session, setSession] = useState(false);
    const { data: mainSession } = useSession();
    const [accountModalOpen, setAccountModalOpen] = useState(false);
    const [screen, setScreen] = useState(initialScreen === "daily" ? "daily" : "home");
    const [loading, setLoading] = useState(false);
    const [mapSwitchMaskShown, setMapSwitchMaskShown] = useState(false);
    const [mapSwitchSawLoading, setMapSwitchSawLoading] = useState(false);
    // game state
    const [latLong, setLatLong] = useState({ lat: 0, long: 0 })
    const [latLongKey, setLatLongKey] = useState(0) // Increment to force refresh even with same coords
    const [gameOptionsModalShown, setGameOptionsModalShown] = useState(false);
    // location aka map slug
    const [gameOptions, setGameOptions] = useState({ location: "all", maxDist: 20000, official: true, countryMap: false, communityMapName: "", extent: null, showRoadName: true, timePerRound: 0 }) // rate limit fix: showRoadName true
    const [showAnswer, setShowAnswer] = useState(false)

    const [pinPoint, setPinPointState] = useState(null)
    const pinPointRef = useRef(null)
    const setPinPoint = useCallback((val) => {
        pinPointRef.current = val
        setPinPointState(val)
    }, [])
    const [hintShown, setHintShown] = useState(false)
    const [countryStreak, setCountryStreak] = useState(0)
    const [countryGuessrStreak, setCgStreak] = useState(0)
    const [settingsModal, setSettingsModal] = useState(false)
    const [mapModal, setMapModal] = useState(false)
    const [friendsModal, setFriendsModal] = useState(false)
    const [merchModal, setMerchModal] = useState(false)
    const [mapGuessrModal, setMapGuessrModal] = useState(false)
    const [pendingNameChangeModal, setPendingNameChangeModal] = useState(false)
    const [dismissedNameChangeBanner, setDismissedNameChangeBanner] = useState(false)
    const [dismissedBanBanner, setDismissedBanBanner] = useState(false)
    const [timeOffset, setTimeOffset] = useState(0)
    const timeSyncRef = useRef({ bestRtt: Infinity, lastSyncAt: 0, lastServerNow: 0 })
    const [loginQueued, setLoginQueued] = useState(false);
    const [options, setOptions] = useState({
    });
    const [multiplayerError, setMultiplayerError] = useState(null);
    const [miniMapShown, setMiniMapShown] = useState(false)
    const [accountModalPage, setAccountModalPage] = useState("profile");
    const [mapModalClosing, setMapModalClosing] = useState(false);
    const loadLocationRequestRef = useRef(0);
    const [pendingCountryGuessrLoad, setPendingCountryGuessrLoad] = useState(0);
    const countryGuessrLoadRecoveryRef = useRef(0);
    const MAP_MODAL_CLOSE_ANIMATION_MS = 400;

    const login = useHomeShellGoogleLogin({ setSession, setLoginQueued });



    const [isApp, setIsApp] = useState(false);
    const [inCrazyGames, setInCrazyGames] = useState(false);
    const [maintenance, setMaintenance] = useState(false);


    useEffect(() => {

        if (!inCrazyGames) {
            setSession(mainSession)
        }
    }, [JSON.stringify(mainSession), inCrazyGames])

    useEffect(() => {
        const handlePageClose = () => {
            window.isPageClosing = true;
            // Reset flag if unload is cancelled by another handler
            setTimeout(() => { window.isPageClosing = false; }, 0);
        };
        window.addEventListener('beforeunload', handlePageClose);
        return () => window.removeEventListener('beforeunload', handlePageClose);
    }, [])

    // this breaks stuff like logout and set username reloads
    // useEffect(() => {
    //   window.onbeforeunload = function(e) {
    //     if(screen === "home") {

    //     } else  {
    //       e.preventDefault();
    //       return e.returnValue = 'Are you sure you want to leave?';
    //     }
    //   }
    // }, [screen])


    useEffect(() => {
        if (screen) {
            console.log("screen", screen)
        }
    }, [screen])

    const [config, setConfig] = useState(null);
    const [eloData, setEloData] = useState(null);
    const [animatedEloDisplay, setAnimatedEloDisplay] = useState(0);

    const [onboarding, setOnboarding] = useState(null);
    // Mirror DailyChallengeScreen's internal phase so the navbar can hide its
    // back button only during the actual round, not on landing/results.
    const [dailyPhase, setDailyPhase] = useState(null);
    const [onboardingCompleted, setOnboardingCompleted] = useState(null);
    const [otherOptions, setOtherOptions] = useState([]); // for country guesser
    const [showCountryButtons, setShowCountryButtons] = useState(true);
    const [countryGuesserCorrect, setCountryGuesserCorrect] = useState(false);
    const [welcomeOverlayShown, setWelcomeOverlayShown] = useState(false);
    const [onboardingMode, setOnboardingMode] = useState("classic");
    const [countryGuessrMode, setCountryGuessrMode] = useState({ subMode: "country", region: "all" });
    const hasEnteredSingleplayer = useRef(false);
    const lastSingleplayerScreen = useRef(null);

    const [showSuggestLoginModal, setShowSuggestLoginModal] = useState(false);
    const [showDiscordModal, setShowDiscordModal] = useState(false);
    const [singlePlayerRound, setSinglePlayerRound] = useState(null);
    const [partyModalShown, setPartyModalShown] = useState(false);
    const [selectCountryModalShown, setSelectCountryModalShown] = useState(false);
    const [connectionErrorModalShown, setConnectionErrorModalShown] = useState(false);


    const [inCoolMathGames, setInCoolMathGames] = useState(false);
    const [inGameDistribution, setInGameDistribution] = useState(false);
    const [navSlideOut, setNavSlideOut] = useState(false);
    const [awaitingCreatePartyScreen, setAwaitingCreatePartyScreen] = useState(false);

    // Daily challenge navigation (in-app pushState, no real Next route change)
    const screenRef = useRef('home');
    useEffect(() => { screenRef.current = screen; }, [screen]);
    const isDailyPath = useCallback((p) => /^\/(?:(?:es|fr|de|ru|en)\/)?daily$/.test(p || ''), []);
    const enterDailyMode = useCallback(() => {
        if (typeof window !== 'undefined' && !isDailyPath(window.location.pathname)) {
            const lang = (typeof window !== 'undefined' && window.language) || 'en';
            const dailyPath = lang === 'en' ? '/daily' : `/${lang}/daily`;
            window.history.pushState({ wgDaily: true }, '', dailyPath);
        }
        setNavSlideOut(true);
        setTimeout(() => {
            setNavSlideOut(false);
            setScreen('daily');
        }, 300);
    }, [isDailyPath]);
    const exitDailyMode = useCallback(() => {
        if (typeof window !== 'undefined' && isDailyPath(window.location.pathname)) {
            // Infer locale from current path: /daily → /, /es/daily → /es, etc.
            const match = /^\/(es|fr|de|ru|en)\/daily$/.exec(window.location.pathname);
            const target = match ? `/${match[1]}` : '/';
            window.history.pushState({}, '', target);
        }
        setScreen('home');
    }, [isDailyPath]);

    // Keep the URL in sync with the `screen` state for daily mode. Anything
    // that transitions screen away from 'daily' (back button on the navbar,
    // exit from results modal, popstate, etc.) must also clear `/daily` from
    // the URL. Doing it here rather than inside each exit path means we
    // can't forget to call it.
    const prevScreenForUrlRef = useRef(screen);

    // Close suggest login modal when user successfully logs in
    useEffect(() => {
        if (session?.token?.secret && showSuggestLoginModal) {
            setShowSuggestLoginModal(false);
        }
    }, [session?.token?.secret, showSuggestLoginModal]);

    // Show SuggestAccountModal on the home screen for logged-out users.
    //   1st time  — any home visit (never seen before). Just Sign-in / Continue as Guest.
    //   Nth time  — 7 days after the last show, if they still haven't signed in. Every
    //               repeat show renders a "Don't show this again" link below the guest
    //               button; clicking it sets `suggestLoginNeverShow` and permanently opts
    //               out. Otherwise the modal keeps reappearing on the 7-day cadence.
    // Delayed ~2.5s so it doesn't feel like a page-load ambush and so the session has
    // time to resolve. Embedded platforms (CrazyGames / CoolMath / GameDistribution)
    // skip entirely.
    const [suggestLoginShowNeverAgain, setSuggestLoginShowNeverAgain] = useState(false);

    const [allLocsArray, setAllLocsArray] = useState([]);

    useEffect(() => {
        if (!pendingCountryGuessrLoad) return;
        if (screen !== "countryGuesser") return;
        if (gameOptions.location !== "all") return;

        setPendingCountryGuessrLoad(0);
        loadLocation({ force: true, ignoreCache: true });
    }, [pendingCountryGuessrLoad, screen, gameOptions.location, countryGuessrMode.subMode])

    useEffect(() => {
        if (onboarding?.round > 1) {
            loadLocation({ keepAnswer: !!window._countryGuessrKeepAnswer })
        }
    }, [onboarding?.round])

    useEffect(() => {
        if (onboarding?.completed) {
            setOnboardingCompleted(true)
        }
    }, [onboarding?.completed])

    // Restore extent when entering singleplayer mode if map is selected but extent is missing
    useEffect(() => {
        if (screen === "singleplayer" && gameOptions.location && gameOptions.location !== "all" && !gameOptions.extent) {
            // Re-open the map to restore extent
            openMap(gameOptions.location);
        }
    }, [screen])

    // Country/continent guesser always plays on the world map — if the user had
    // a country-specific map loaded in singleplayer (e.g. "CA"), clear it so we
    // don't keep serving the same country over and over.
    useEffect(() => {
        if (screen === "countryGuesser" && gameOptions.location !== "all") {
            openMap("all");
            setAllLocsArray([]);
        }
    }, [screen])
    // Log commit hash on app startup
    useEffect(() => {
        console.log(`🌍 WorldGuessr build: ${process.env.NEXT_PUBLIC_COMMIT_HASH || 'unknown'}`);
        console.log(`📅 Build time: ${process.env.NEXT_PUBLIC_BUILD_TIME || 'unknown'}`);
    }, [])

    useEffect(() => {
        if (options && options.units && options.mapType) {
            try {
                gameStorage.setItem("options", JSON.stringify(options))
            } catch (e) { }
        }
    }, [options])

    // multiplayer stuff — connection lives in MultiplayerProvider (mounted in
    // _app.js) so it survives Next.js route changes and can't be opened twice.
    const { ws, setWs, multiplayerState, setMultiplayerState, subscribeMessages, ensureConnected } = useMultiplayer();
    // Tell the provider to actually open the WS. Provider is lazy by default
    // so non-Home pages (/banned, /leaderboard, /maps, /mod, /learn, /user,
    // /svEmbed, /privacy-*) don't open a socket they'll never use.
    useEffect(() => { ensureConnected(); }, [ensureConnected]);
    const [multiplayerChatOpen, setMultiplayerChatOpen] = useState(false);
    const [multiplayerChatEnabled, setMultiplayerChatEnabled] = useState(false);

    const updateTimeOffsetFromSync = (serverNow, clientSentAt) => {
        if (!serverNow || !clientSentAt) return;
        const now = Date.now();
        const rtt = Math.max(0, now - clientSentAt);
        const offset = serverNow - (clientSentAt + rtt / 2);
        const sync = timeSyncRef.current;
        const tooOld = now - sync.lastSyncAt > 60000;
        const betterRtt = rtt <= sync.bestRtt + 25;
        if (sync.lastSyncAt === 0 || betterRtt || tooOld) {
            const prevBestRtt = sync.bestRtt;
            sync.bestRtt = Math.min(sync.bestRtt, rtt);
            sync.lastSyncAt = now;
            sync.lastServerNow = serverNow;
            if (window.debugTimeSync) {
                console.log("[TimeSync] update", {
                    offset,
                    rtt,
                    serverNow,
                    clientSentAt,
                    prevBestRtt
                });
            }
            setTimeOffset(offset);
        }
    };

    const sendTimeSync = () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: "timeSync", clientSentAt: Date.now() }));
    };


    // Auto-close connection error modal when connected
    useEffect(() => {
        if (multiplayerState.connected) {
            setConnectionErrorModalShown(false);
        }
    }, [multiplayerState.connected]);

    useEffect(() => {
        if (!session?.token?.secret) return;

        // verify the ws
        if (ws && !window.verified && !window.location.search.includes("crazygames")) {
            console.log("sending verify", ws)
            ws.send(JSON.stringify({ type: "verify", secret: session.token.secret, username: session.token.username }))
        }
    }, [session?.token?.secret, ws])

    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                sendTimeSync();
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
    }, [ws])

    const { t: text } = useTranslation("common");

    const {
        startOnboarding,
        openMap,
        cancelInFlightLocationLoad,
        setWorldMapOptions,
        enterCountryGuessrMode,
        clearLocation,
        loadLocation,
    } = useLocationHandlers({
        inCrazyGames,
        gameOptions,
        loading,
        screen,
        onboarding,
        countryGuessrMode,
        allLocsArray,
        latLong,
        text,
        loadLocationRequestRef,
        setScreen,
        setOnboarding,
        setShowCountryButtons,
        setAllLocsArray,
        setGameOptions,
        setLoading,
        setLatLong,
        setShowAnswer,
        setPinPoint,
        setHintShown,
        setCountryGuessrMode,
        setPendingCountryGuessrLoad,
        setSinglePlayerRound,
        setOtherOptions,
    });

    const {
        handleMultiplayerAction,
        guessMultiplayer,
        sendInvite,
        reloadBtnPressed,
        crazyMidgame,
        backBtnPressed,
        onNavbarLogoPress,
    } = useMultiplayerHandlers({
        ws,
        multiplayerState,
        inCrazyGames,
        loading,
        multiplayerError,
        screen,
        text,
        pinPointRef,
        setConnectionErrorModalShown,
        setScreen,
        setMultiplayerState,
        setPartyModalShown,
        setMultiplayerChatEnabled,
        setOnboardingCompleted,
        setLatLong,
        setShowAnswer,
        setPinPoint,
        setLoading,
        setMultiplayerError,
        setOnboarding,
        setGameOptions,
        clearLocation,
        loadLocation,
    });

    useHomeShellEffects({
        // state values
        session,
        accountModalOpen,
        eloData,
        screen,
        onboardingCompleted,
        loading,
        inCrazyGames,
        options,
        multiplayerState,
        gameOptions,
        countryGuessrMode,
        latLong,
        onboarding,
        singlePlayerRound,
        initialScreen,
        // refs
        hasEnteredSingleplayer,
        langInitRef,
        // setters
        setSession,
        setEloData,
        setAnimatedEloDisplay,
        setConfig,
        setIsApp,
        setLoading,
        setInCrazyGames,
        setWs,
        setWelcomeOverlayShown,
        setOnboardingCompleted,
        setOnboarding,
        setScreen,
        setLoginQueued,
        setInGameDistribution,
        setOtherOptions,
        setShowCountryButtons,
        setAllLocsArray,
        setLatLong,
        setCountryStreak,
        setCgStreak,
        setMultiplayerState,
        // ws + handlers
        ws,
        startOnboarding,
        openMap,
        crazyMidgame,
        handleMultiplayerAction,
        isDailyPath,
        // other
        text,
        router,
    });

    useEffect(() => {

        if (multiplayerState?.joinOptions?.error) {
            setTimeout(() => {
                setMultiplayerState((prev) => ({ ...prev, joinOptions: { ...prev.joinOptions, error: null } }))
            }, 1000)
        }

    }, [multiplayerState?.joinOptions?.error]);

    useEffect(() => {
        if (multiplayerState?.connected && multiplayerError) {
            setMultiplayerError(null)
        }
    }, [multiplayerState?.connected, multiplayerError])

    // WebSocket connect / reconnect lives in MultiplayerProvider (pages/_app.js)
    // so navigation between pages that mount Home (e.g. / -> /es, /daily -> /es/daily)
    // doesn't tear down and re-open the connection — which previously caused the
    // server to kick the older connection with a "userAlreadyConnected" error.

    useWsMessageHandler({
        subscribeMessages,
        ws,
        multiplayerState,
        timeOffset,
        gameOptions,
        text,
        updateTimeOffsetFromSync,
        timeSyncRef,
        setMultiplayerChatEnabled,
        setMultiplayerChatOpen,
        setMaintenance,
        setTimeOffset,
        setEloData,
        setSession,
        setMultiplayerState,
        setAccountModalOpen,
        setGameOptionsModalShown,
        setSettingsModal,
        setMapModal,
        setFriendsModal,
        setMerchModal,
        setShowSuggestLoginModal,
        setShowDiscordModal,
        setSelectCountryModalShown,
        setConnectionErrorModalShown,
        setScreen,
        setGameOptions,
        setPinPoint,
        setLoading,
        setLatLongKey,
        setLatLong,
    });


    // Home-side cleanup when the WS goes from connected to disconnected.
    // The provider already resets multiplayerState on close; this effect handles
    // the home-only side effects (chat, error modal, redirect to home, toast).
    // `text` is read through a ref so we don't re-fire on every Home render
    // (useTranslation returns a fresh `t` closure each render).
    const textRef = useRef(text);
    useEffect(() => { textRef.current = text; }, [text]);
    const prevWsForCloseRef = useRef(null);

    useMoreHomeShellEffects({
        options, session, initialScreen, awaitingCreatePartyScreen, screen,
        connectionErrorModalShown, multiplayerError, inCrazyGames, inCoolMathGames,
        inGameDistribution, showSuggestLoginModal, loading, showAnswer,
        countryGuessrMode, gameOptions, ws, multiplayerState, timeOffset,
        mapSwitchMaskShown, mapSwitchSawLoading,
        statsRef, screenRef, prevScreenForUrlRef, lastSingleplayerScreen,
        countryGuessrLoadRecoveryRef, timeSyncRef, prevWsForCloseRef, textRef,
        setScreen, setAwaitingCreatePartyScreen, setNavSlideOut,
        setSuggestLoginShowNeverAgain, setShowSuggestLoginModal, setInCoolMathGames,
        setSinglePlayerRound, setShowCountryButtons, setLoading, setAllLocsArray,
        setLatLong, setPendingCountryGuessrLoad, setTimeOffset, setMultiplayerState,
        setMultiplayerChatEnabled, setMultiplayerChatOpen, setMultiplayerError,
        setMapSwitchMaskShown, setMapSwitchSawLoading, setOptions,
        isDailyPath, cancelInFlightLocationLoad, setWorldMapOptions, sendTimeSync,
        handleMultiplayerAction,
    });

    useEffect(() => {
        window.screen = screen;
    }, [screen])

    useEffect(() => {
        if (multiplayerState?.connected) {
            handleMultiplayerAction("screen", screen);
        }
    }, [screen]);


    // useEffect(() => {
    //   if (multiplayerState.inGame && multiplayerState.gameData?.state === "guess" && pinPoint) {
    //     // send guess
    //     console.log("pinpoint1", pinPoint)
    //     const pinpointLatLong = [pinPoint.lat, pinPoint.lng];
    //     ws.send(JSON.stringify({ type: "place", latLong: pinpointLatLong, final: false }))
    //   }
    // }, [multiplayerState, pinPoint])

    // Stable callback for chat toggle to prevent ChatBox re-renders
    const handleChatToggle = React.useCallback(() => {
        setMultiplayerChatOpen(prev => !prev);
    }, []);

    // Memoized ChatBox - uses stable function references (handleChatToggle) and
    // internal useCallback hooks to prevent chat input from resetting between rounds
    const ChatboxMemo = React.useMemo(() => <ChatBox
        miniMapShown={miniMapShown}
        ws={ws}
        open={multiplayerChatOpen}
        onToggle={handleChatToggle}
        enabled={session?.token?.secret && multiplayerChatEnabled && !process.env.NEXT_PUBLIC_COOLMATH && !process.env.NEXT_PUBLIC_GAMEDISTRIBUTION}
        isGuest={session?.token?.secret ? false : true}
        publicGame={multiplayerState?.gameData?.public}
        myId={multiplayerState?.gameData?.myId}
        inGame={multiplayerState?.inGame}
        roundOverScreenShown={multiplayerState?.inGame && multiplayerState?.gameData?.state === 'end'}
    />, [multiplayerChatOpen, multiplayerChatEnabled, ws, multiplayerState?.gameData?.myId, multiplayerState?.inGame, multiplayerState?.gameData?.public, session?.token?.secret, handleChatToggle, miniMapShown, multiplayerState?.gameData?.state])

    const [showPanoOnResult, setShowPanoOnResult] = useState(false);

    // Note: Both banned users and users with pending name change CAN still play singleplayer
    // They just can't do multiplayer - the check is done in the websocket server
    // Banned users are also excluded from leaderboards (handled in api/leaderboard.js)

    return (
        <>
            <HeadContent
                text={text}
                inCoolMathGames={inCoolMathGames}
                inCrazyGames={inCrazyGames}
                inGameDistribution={inGameDistribution}
                titleOverride={initialScreen === 'daily' ? `${text('dailyChallenge')} - WorldGuessr` : undefined}
                descOverride={initialScreen === 'daily' ? text('dailyLandingTagline') : undefined}
                canonicalOverride={initialScreen === 'daily' ? 'https://www.worldguessr.com/daily' : undefined}
            />



            <HomeShellModals
                accountModalOpen={accountModalOpen}
                setAccountModalOpen={setAccountModalOpen}
                inCrazyGames={inCrazyGames}
                session={session}
                setSession={setSession}
                eloData={eloData}
                accountModalPage={accountModalPage}
                setAccountModalPage={setAccountModalPage}
                ws={ws}
                multiplayerState={multiplayerState}
                sendInvite={sendInvite}
                options={options}
                showSuggestLoginModal={showSuggestLoginModal}
                setShowSuggestLoginModal={setShowSuggestLoginModal}
                suggestLoginShowNeverAgain={suggestLoginShowNeverAgain}
                showDiscordModal={showDiscordModal}
                setShowDiscordModal={setShowDiscordModal}
                mapGuessrModal={mapGuessrModal}
                setMapGuessrModal={setMapGuessrModal}
                pendingNameChangeModal={pendingNameChangeModal}
                setPendingNameChangeModal={setPendingNameChangeModal}
                chatbox={ChatboxMemo}
                welcomeOverlayShown={welcomeOverlayShown}
                screen={screen}
                setOnboardingMode={setOnboardingMode}
                setOnboarding={setOnboarding}
                setShowCountryButtons={setShowCountryButtons}
                setWelcomeOverlayShown={setWelcomeOverlayShown}
                setLatLong={setLatLong}
                setShowAnswer={setShowAnswer}
                setOnboardingCompleted={setOnboardingCompleted}
                setScreen={setScreen}
            />

            {/* Coolmath splash is now rendered statically in _document.js and removed via useEffect */}
            {/* Background street2 image is rendered via body::before in _document.js */}

            <main className={`home`} id="main">

                <StreetView
                    nm={gameOptions?.nm}
                    npz={gameOptions?.npz}
                    showAnswer={showAnswer}
                    lat={latLong?.lat}
                    long={latLong?.long}
                    panoId={latLong?.panoId}
                    heading={latLong?.heading}
                    pitch={latLong?.pitch}
                    showRoadLabels={screen === "onboarding" ? false : gameOptions?.showRoadName}
                    hidden={!!((!latLong || !latLong.lat || !latLong.long) || loading) || (
                        screen === "home" || !!(screen === "multiplayer" && (multiplayerState?.gameData?.state === "waiting" || multiplayerState?.enteringGameCode || multiplayerState?.gameQueued))
                    )}
                    refreshKey={latLongKey}
                    onLoad={() => {
                        if (window.roundStartTime) {
                            console.log(`[PERF] ========== Round complete! Total time from start to SV loaded: ${(performance.now() - window.roundStartTime).toFixed(2)}ms ==========`);
                        }
                        console.log("loaded")
                        setTimeout(() => {
                            setLoading(false)
                            setMapSwitchMaskShown(false);
                            setMapSwitchSawLoading(false);
                        }, 300)

                    }}
                />

                {/* Loading overlay - covers iframe with background image to prevent white flicker */}
                <div className={`loading-overlay ${(loading || mapSwitchMaskShown) ? 'loading-overlay--visible' : ''}`}>
                    <NextImage.default src={asset('/street2.webp')}
                        draggable={false}
                        width={1920}
                        height={1080}
                        priority
                        alt="Loading Background"
                        style={{
                            objectFit: "cover",
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            opacity: 0.5,
                        }}
                        sizes="100vw"
                    />
                    {/* Dark background behind the semi-transparent image to match home screen look */}
                    <div style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        backgroundColor: "#000",
                        zIndex: -1,
                    }} />
                </div>

                <BannerText text={`${text("loading")}...`} shown={loading} showCompass={true} />



                <Navbar
                    joinCodePress={() => {
                        setOnboarding(null)
                        setOnboardingCompleted(true)
                        gameStorage.setItem("onboarding", 'done')
                        setScreen("multiplayer")
                        setMultiplayerState((prev) => ({
                            ...prev,
                            enteringGameCode: true
                        }))
                    }}
                    accountModalOpen={accountModalOpen}
                    inCoolMathGames={inCoolMathGames}
                    inGameDistribution={inGameDistribution}
                    maintenance={maintenance}
                    inCrazyGames={inCrazyGames}
                    loading={loading}
                    onFriendsPress={() => { setAccountModalOpen(true); setAccountModalPage("list"); }}
                    loginQueued={loginQueued}
                    setLoginQueued={setLoginQueued}
                    inGame={multiplayerState?.inGame || screen === "singleplayer" || screen === "countryGuesser"}
                    openAccountModal={() => { setAccountModalOpen(true); setAccountModalPage("profile"); }}
                    session={session}
                    reloadBtnPressed={reloadBtnPressed}
                    backBtnPressed={backBtnPressed}
                    setGameOptionsModalShown={setGameOptionsModalShown}
                    onNavbarPress={() => onNavbarLogoPress()}
                    gameOptions={gameOptions}
                    screen={screen}
                    multiplayerState={multiplayerState}
                    shown={!multiplayerState?.gameData?.duel}
                    gameOptionsModalShown={gameOptionsModalShown}
                    selectCountryModalShown={selectCountryModalShown}
                    partyModalShown={partyModalShown}
                    dailyPhase={dailyPhase}
                    mapModalOpen={mapModal}
                    onConnectionError={() => setConnectionErrorModalShown(true)}
                    countryGuessrMode={countryGuessrMode}
                />

                <ModerationBanners
                    session={session}
                    screen={screen}
                    text={text}
                    dismissedNameChangeBanner={dismissedNameChangeBanner}
                    setDismissedNameChangeBanner={setDismissedNameChangeBanner}
                    setPendingNameChangeModal={setPendingNameChangeModal}
                    dismissedBanBanner={dismissedBanBanner}
                    setDismissedBanBanner={setDismissedBanBanner}
                    setAccountModalOpen={setAccountModalOpen}
                    setAccountModalPage={setAccountModalPage}
                />


                {screen === 'home' && !inCrazyGames && !process.env.NEXT_PUBLIC_COOLMATH && !process.env.NEXT_PUBLIC_GAMEDISTRIBUTION &&
                    <div className="home_ad">
                        <Ad
                            unit={"worldguessr_home_ad"}
                            inCrazyGames={inCrazyGames} showAdvertisementText={false} screenH={height} types={height < 510 ? [[300, 250]] : [[320, 50], [300, 250]]} screenW={width} vertThresh={width < 600 ? 0.28 : 0.5} />
                    </div>
                }
                {inGameDistribution && screen === 'home' && (
                    <div className="home_ad">
                        <GameDistributionBanner
                            id="gd-banner-home"
                            screenH={height} types={[[300, 250]]} screenW={width} vertThresh={width < 600 ? 0.28 : 0.5} />
                    </div>
                )}
                <span id="g2_playerCount" className={`bigSpan onlineText desktop ${screen !== 'home' ? 'notHome' : ''} ${(screen === 'singleplayer' || screen === 'onboarding' || screen === 'countryGuesser' || screen === 'daily' || (multiplayerState?.inGame && !['waitingForPlayers', 'findingGame', 'findingOpponent'].includes(multiplayerState?.gameData?.state)) || !multiplayerState?.connected || !multiplayerState?.playerCount) ? 'hide' : ''}`}>
                    {maintenance ? text("maintenanceMode") : text("onlineCnt", { cnt: multiplayerState?.playerCount || 0 })}
                </span>

                {/* reload button for public game */}
                {multiplayerState?.gameData?.duel && multiplayerState?.gameData?.state === "guess" && (
                    <div className="gameBtnContainer" style={{ position: 'fixed', top: width > 830 ? '90px' : '90px', left: width > 830 ? '10px' : '7px', zIndex: 1000000 }}>

                        <button className="gameBtn navBtn backBtn reloadBtn" onClick={() => reloadBtnPressed()}><img src={asset("/return.png")} alt="reload" height={13} style={{ filter: 'invert(1)', transform: 'scale(1.5)' }} /></button>
                    </div>
                )}



                {/* ELO/League button */}
                {/* <div>
                    {screen === "home" && !mapModal && session && session?.token?.secret && (
                        <button className="gameBtn leagueBtn" onClick={() => { setAccountModalOpen(true); setAccountModalPage("elo"); }}
                            style={{ backgroundColor: eloData?.league?.color }}
                        >
                            {!eloData ? '...' : animatedEloDisplay} ELO {eloData?.league?.emoji}
                        </button>
                    )}
                </div> */}

                {/* Community Maps icon (moved out of left menu) */}
                {screen === "home" && onboardingCompleted && !mapModal &&
                    !process.env.NEXT_PUBLIC_COOLMATH && !process.env.NEXT_PUBLIC_GAMEDISTRIBUTION && (
                    <DailyCommunityMapsButton
                        onClick={() => setMapModal(true)}
                        loggedOut={!session?.token?.secret}
                    />
                )}

                {/* Daily challenge screen (landing → game → results) */}
                {screen === "daily" && (
                    <DailyChallengeScreen
                        session={session}
                        options={options}
                        onExit={exitDailyMode}
                        inCrazyGames={inCrazyGames}
                        inCoolMathGames={inCoolMathGames}
                        inGameDistribution={inGameDistribution}
                        landingBootstrap={dailyBootstrap}
                        latLong={latLong}
                        setLatLong={setLatLong}
                        setLatLongKey={setLatLongKey}
                        loading={loading}
                        setLoading={setLoading}
                        onPhaseChange={setDailyPhase}
                    />
                )}

                {screen === "home" && <Home />}
                <HomeShellMapsModal
                    mapModal={mapModal}
                    gameOptionsModalShown={gameOptionsModalShown}
                    session={session}
                    screen={screen}
                    gameOptions={gameOptions}
                    setGameOptions={setGameOptions}
                    setMapModal={setMapModal}
                    setGameOptionsModalShown={setGameOptionsModalShown}
                    mapModalClosing={mapModalClosing}
                    setMapModalClosing={setMapModalClosing}
                    setMapSwitchMaskShown={setMapSwitchMaskShown}
                    setMapSwitchSawLoading={setMapSwitchSawLoading}
                    cancelInFlightLocationLoad={cancelInFlightLocationLoad}
                    setLoading={setLoading}
                    setLatLong={setLatLong}
                    setShowAnswer={setShowAnswer}
                    setShowCountryButtons={setShowCountryButtons}
                    setScreen={setScreen}
                    enterCountryGuessrMode={enterCountryGuessrMode}
                    openMap={openMap}
                    countryGuessrMode={countryGuessrMode}
                    text={text}
                />


                {settingsModal && <SettingsModal inCrazyGames={inCrazyGames} inGameDistribution={inGameDistribution} options={options} setOptions={setOptions} shown={true} onClose={() => setSettingsModal(false)} />}

                {connectionErrorModalShown && <AlertModal
                    isOpen={true}
                    onClose={() => setConnectionErrorModalShown(false)}
                    title={multiplayerState.connecting ? text("multiplayerConnecting") : text("multiplayerNotConnected")}
                    message={multiplayerState.connecting
                        ? text("connectingMessage", {
                            currentRetry: multiplayerState.currentRetry,
                            maxRetries: multiplayerState.maxRetries
                        })
                        : text("multiplayerConnectionErrorMessage")
                    }
                    type={multiplayerState.connecting ? "warning" : "error"}
                />}




                <GameScreens
                    screen={screen}
                    onboarding={onboarding}
                    multiplayerState={multiplayerState}
                    inCoolMathGames={inCoolMathGames}
                    inGameDistribution={inGameDistribution}
                    inCrazyGames={inCrazyGames}
                    miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
                    welcomeOverlayShown={welcomeOverlayShown}
                    showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult}
                    showDiscordModal={showDiscordModal} setShowDiscordModal={setShowDiscordModal}
                    singlePlayerRound={singlePlayerRound} setSinglePlayerRound={setSinglePlayerRound}
                    countryGuesserCorrect={countryGuesserCorrect} setCountryGuesserCorrect={setCountryGuesserCorrect}
                    showCountryButtons={showCountryButtons} setShowCountryButtons={setShowCountryButtons}
                    otherOptions={otherOptions}
                    countryGuessrMode={countryGuessrMode}
                    options={options}
                    countryStreak={countryStreak} setCountryStreak={setCountryStreak}
                    hintShown={hintShown} setHintShown={setHintShown}
                    pinPoint={pinPoint} setPinPoint={setPinPoint}
                    showAnswer={showAnswer} setShowAnswer={setShowAnswer}
                    loading={loading} setLoading={setLoading}
                    session={session}
                    gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown}
                    mapModal={mapModal}
                    latLong={latLong} setLatLong={setLatLong}
                    loadLocation={loadLocation}
                    gameOptions={gameOptions} setGameOptions={setGameOptions}
                    setOnboarding={setOnboarding}
                    backBtnPressed={backBtnPressed}
                    timeOffset={timeOffset}
                    ws={ws} setWs={setWs}
                    multiplayerChatOpen={multiplayerChatOpen} setMultiplayerChatOpen={setMultiplayerChatOpen}
                    setMultiplayerState={setMultiplayerState}
                    multiplayerError={multiplayerError}
                    partyModalShown={partyModalShown} setPartyModalShown={setPartyModalShown}
                    selectCountryModalShown={selectCountryModalShown} setSelectCountryModalShown={setSelectCountryModalShown}
                    handleMultiplayerAction={handleMultiplayerAction}
                    setOnboardingCompleted={setOnboardingCompleted}
                    setScreen={setScreen}
                    setMapModal={setMapModal}
                    enterCountryGuessrMode={enterCountryGuessrMode}
                    guessMultiplayer={guessMultiplayer}
                    text={text}
                />




                <AnalyticsScripts />

                <WhatsNewModal changelog={changelog} text={text} />
            </main>
        </>
    )
}
