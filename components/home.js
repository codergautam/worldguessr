import HeadContent from "@/components/headContent";
import { FaDiscord, FaBook } from "react-icons/fa";
import { FaGear, FaRankingStar, FaYoutube } from "react-icons/fa6";
import { useSession } from "@/components/auth/auth";
import { fetchWithFallback } from "@/components/utils/retryFetch";
import 'react-responsive-modal/styles.css';
import { useEffect, useLayoutEffect, useState, useRef, useCallback } from "react";
import Navbar from "@/components/ui/navbar";
import GameUI from "@/components/gameUI";
import BannerText from "@/components/bannerText";
import shuffle from "@/utils/shuffle";
// findLatLongRandom is dynamically imported when needed to avoid loading Google Maps API on page load
import Link from "next/link";
import React from "react";
import countryMaxDists from '../public/countryMaxDists.json';
import { useTranslation } from '@/components/useTranslations'
import useWindowDimensions from "@/components/useWindowDimensions";
import Script from "next/script";
import sendEvent from "@/components/utils/sendEvent";
import { useMultiplayer, initialMultiplayerState } from "@/components/multiplayer/MultiplayerProvider";
import { getPlatform } from "@/components/utils/getPlatform";
import deriveTeamEndFallback from "@/components/utils/teamDuelEndFallback";
import getMyTeam from "@/components/utils/getMyTeam";
import 'react-toastify/dist/ReactToastify.css';
import dynamic from "next/dynamic";
import NextImage from "next/image";
import OnboardingText from "@/components/onboardingText";
import continentFromCode, { ALL_CONTINENTS } from "@/components/utils/continentFromCode";
import { useRouter } from 'next/router';
import { asset, navigate, stripBase } from '@/lib/basePath';
import { preloadPinImages } from '@/lib/markerIcons';
// Pre-existing dynamic chunks: results screen and daily-challenge screen are
// big and only render after a round/onboarding completes. AccountModal stays
// dynamic because it pulls in chart.js (~220 KB) for the XP graph — saving
// that on the critical path is worth the one-time async open. MapGuessrModal
// is also kept dynamic to match its prior behavior.
const RoundOverScreen = dynamic(() => import('@/components/roundOverScreen'), { ssr: false });
const DailyChallengeScreen = dynamic(() => import('@/components/daily/DailyChallengeScreen'), { ssr: false });
const AccountModal = dynamic(() => import('@/components/accountModal'), { ssr: false });
const MapGuessrModal = dynamic(() => import('@/components/mapGuessrModal'), { ssr: false });
// Conditionally-rendered modals/screens ship as async chunks so they (and the
// react-responsive-modal dep most of them share) stay out of the initial index
// bundle — the welcome modal (our LCP element) can't paint until hydration
// finishes, so every KB cut here lands directly on LCP. WelcomeOverlay stays
// static: it must paint the instant onboarding starts, covering the street
// view load. AlertModal/EmoteReactions are too small to be worth a chunk.
const MultiplayerHome = dynamic(() => import("@/components/multiplayerHome"), { ssr: false });
const SetUsernameModal = dynamic(() => import("@/components/setUsernameModal"), { ssr: false });
const SettingsModal = dynamic(() => import("@/components/settingsModal"), { ssr: false });
const OnboardingComplete = dynamic(() => import("@/components/onboardingComplete"), { ssr: false });
const SuggestAccountModal = dynamic(() => import("@/components/suggestAccountModal"), { ssr: false });
const MapsModal = dynamic(() => import("@/components/maps/mapsModal"), { ssr: false });
const DiscordModal = dynamic(() => import("@/components/discordModal"), { ssr: false });
const WhatsNewModal = dynamic(() => import("@/components/ui/WhatsNewModal"), { ssr: false });
const PendingNameChangeModal = dynamic(() => import("./pendingNameChangeModal"), { ssr: false });
import EmoteReactions from "@/components/emoteReactions";
import WelcomeOverlay from "@/components/welcomeOverlay";
import AlertModal from "@/components/ui/AlertModal";
import Modal from "@/components/ui/Modal";
import DailyMenuItem from '@/components/daily/DailyMenuItem';
import DailyCommunityMapsButton from '@/components/daily/DailyCommunityMapsButton';
import msToTime from "@/components/msToTime";
import { toast, ToastContainer } from "react-toastify";
import { inIframe, isForbiddenIframe } from "@/components/utils/inIframe";

import countries from "@/public/countries.json";
import officialCountryMaps from "@/public/officialCountryMaps.json";

import gameStorage from "@/components/utils/localStorage";
import changelog from "@/components/changelog.json";
import clientConfig from "@/clientConfig";
import { useGoogleLogin } from "@react-oauth/google";
// import haversineDistance from "./utils/haversineDistance";
import StreetView from "./streetview/streetView";
// import SvEmbedIframe from "./streetview/svHandler"; // REMOVED: Using direct StreetView instead of double-iframe setup
// import getTimeString, { getMaintenanceDate } from "./maintenanceTime";
// import MaintenanceBanner from "./MaintenanceBanner";
import Ad from "./bannerAdNitro";
import GameDistributionBanner from "./bannerAdGameDistribution";

const ROUND_OVER_FADE_MS = 500;
const TEAM_2V2_END_EXIT_COVER_MS = 50;
const TEAM_2V2_END_EXIT_REVEAL_MS = 160;

// After sending a publicDuel/unrankedDuel join we wait this long for the server's
// `queueJoined` ack (ranked also sends `publicDuelRange`). No ack => the join never
// registered server-side, so we bail off the searching screen with a toast instead
// of leaving the user waiting on a queue they were never actually in. The ack is a
// same-tick server reply, so 8s is well above a normal round-trip. (Mirrors the
// mobile WS_QUEUE_CONFIRM_TIMEOUT_MS.)
const WS_QUEUE_CONFIRM_TIMEOUT_MS = 8000;


export default function Home({ initialScreen, dailyBootstrap } = {}) {

    const { width, height } = useWindowDimensions();
    const router = useRouter();
    const langInitRef = useRef(true);

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
    const [dismissedDeletionBanner, setDismissedDeletionBanner] = useState(false)
    const [timeOffset, setTimeOffset] = useState(0)
    const timeSyncRef = useRef({ bestRtt: Infinity, lastSyncAt: 0, lastServerNow: 0 })
    const [loginQueued, setLoginQueued] = useState(false);
    const [options, setOptions] = useState({
    });
    const [multiplayerError, setMultiplayerError] = useState(null);
    const [miniMapShown, setMiniMapShown] = useState(false)
    const [multiplayerEndAnswerHoldExpired, setMultiplayerEndAnswerHoldExpired] = useState(false);
    const multiplayerEndAnswerHoldTimerRef = useRef(null);
    const [team2v2EndExitMaskShown, setTeam2v2EndExitMaskShown] = useState(false);
    const [team2v2EndExitMaskRevealing, setTeam2v2EndExitMaskRevealing] = useState(false);
    const team2v2EndExitTimersRef = useRef([]);
    // Queue-join confirmation watchdog: pending timeout id + a mirror of the latest
    // multiplayerState so the (delayed) timeout can read fresh state. See
    // WS_QUEUE_CONFIRM_TIMEOUT_MS and armQueueConfirmWatchdog().
    const queueConfirmTimerRef = useRef(null);
    const mpStateRef = useRef(null);
    const [accountModalPage, setAccountModalPage] = useState("profile");
    const [mapModalClosing, setMapModalClosing] = useState(false);
    const loadLocationRequestRef = useRef(0);
    const [pendingCountryGuessrLoad, setPendingCountryGuessrLoad] = useState(0);
    const countryGuessrLoadRecoveryRef = useRef(0);
    const MAP_MODAL_CLOSE_ANIMATION_MS = 400;

    useEffect(() => {
        if (!mapSwitchMaskShown) return;

        if (loading) {
            if (!mapSwitchSawLoading) setMapSwitchSawLoading(true);
            return;
        }

        if (mapSwitchSawLoading) {
            setMapSwitchMaskShown(false);
            setMapSwitchSawLoading(false);
        }
    }, [mapSwitchMaskShown, mapSwitchSawLoading, loading]);

    useEffect(() => {
        if (!mapSwitchMaskShown) return;

        const mapSwitchMaskTimeout = setTimeout(() => {
            setMapSwitchMaskShown(false);
            setMapSwitchSawLoading(false);
        }, 8000);

        return () => clearTimeout(mapSwitchMaskTimeout);
    }, [mapSwitchMaskShown]);

    useEffect(() => {
        let hideInt = setInterval(() => {
            if (document.getElementById("cmpPersistentLink")) {
                document.getElementById("cmpPersistentLink").style.display = "none";
                clearInterval(hideInt);
            }
        }, 2000);

        return () => clearInterval(hideInt);
    }, [])

    let login = null;
    if (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        login = useGoogleLogin({
            onSuccess: tokenResponse => {
                fetchWithFallback(
                    clientConfig().authUrl + "/api/googleAuth",
                    clientConfig().apiUrl + "/api/googleAuth",
                    {
                        body: JSON.stringify({ code: tokenResponse.code }),
                        method: "POST",
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    },
                    'googleAuthLogin',
                    {}
                ).then((res) => res.json()).then((data) => {
                    if (data.secret) {
                        setSession({ token: data })
                        window.localStorage.setItem("wg_secret", data.secret)
                    } else if (data.error) {
                        // Explicit server refusal — e.g. a blocklisted perm-banned
                        // identity trying to re-register (403 from googleAuth's
                        // blockIfBannedIdentity). Show the real reason instead of
                        // the generic contact-support line; longer autoClose so a
                        // ban message isn't gone before it's read.
                        console.error("[Auth] Sign-in refused:", data.error);
                        toast.error(data.error, { autoClose: 12000 });
                    } else {
                        console.error("[Auth] No secret received from server");
                        toast.error("Login error, contact support if this persists (2)")
                    }

                }).catch((e) => {
                    console.error("[Auth] Google OAuth failed after all retries:", e.message);
                    toast.error(`Login failed: ${e.message}. Please try again or contact support.`);
                }).finally(() => {
                    setLoginQueued(false);
                })
            },
            onError: error => {
                setLoginQueued(false);
                toast.error("Login error, contact support if this persists")
                console.error("login error", error);
            },
            onNonOAuthError: error => {
                setLoginQueued(false);
                console.error("login non oauth error", error);
                toast.error("Login error, contact support if this persists (1)")

            },
            flow: "auth-code",
            ...(process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true" ? {
                ux_mode: "redirect",
                redirect_uri: typeof window !== "undefined" ? window.location.origin + window.location.pathname : undefined,
            } : {}),
        });

        if (typeof window !== "undefined") window.login = login;
    }



    const [isApp, setIsApp] = useState(false);
    const [inCrazyGames, setInCrazyGames] = useState(false);
    const [maintenance, setMaintenance] = useState(false);


    useEffect(() => {

        if (!inCrazyGames) {
            setSession(mainSession)
        }
    }, [JSON.stringify(mainSession), inCrazyGames])

    // Pass hashed email (anonymous) to NitroAds for better ad targeting (logged-in users only, HTTPS only)
    useEffect(() => {
        const email = session?.token?.email;
        if (!email || typeof window === 'undefined' || !window.nitroAds || window.location.protocol !== 'https:') return;

        (async () => {
            try {
                const encoder = new TextEncoder();
                const data = encoder.encode(email.toLowerCase().trim());
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                window.nitroAds.addUserToken(email, 'PLAIN');
            } catch (e) {
                // Silently fail - ad targeting is non-critical
            }
        })();
    }, [session?.token?.email])


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


    const [config, setConfig] = useState(null);
    const [eloData, setEloData] = useState(null);
    const [animatedEloDisplay, setAnimatedEloDisplay] = useState(0);

    // Use session data for initial display only, then fetch fresh data when modal opens
    useEffect(() => {
        if (!session?.token?.username) return;

        // Only use session data as initial fallback when eloData hasn't been set yet
        // Don't overwrite fresh data (e.g., from websocket updates) with stale session data
        setEloData((prev) => {
            if (prev !== null) return prev; // Keep existing fresh data
            if (session.token.elo === undefined) return prev;
            return {
                id: session.token.accountId,
                elo: session.token.elo,
                rank: session.token.rank,
                league: session.token.league,
                duels_wins: session.token.duels_wins,
                duels_losses: session.token.duels_losses,
                duels_tied: session.token.duels_tied,
                win_rate: session.token.win_rate
            };
        });

        // Fetch fresh data when account modal opens (to get updated elo after games)
        if (accountModalOpen) {
            fetch(clientConfig().apiUrl + "/api/eloRank?username=" + session.token.username+"&secret=" + session.token.secret)
                .then((res) => res.json())
                .then((data) => {
                    if (data && data.elo !== undefined) {
                        setEloData(data);
                        // Update session with fresh elo data to prevent stale data issues
                        setSession((prev) => ({
                            ...prev,
                            token: {
                                ...prev?.token,
                                elo: data.elo,
                                rank: data.rank,
                                league: data.league,
                                duels_wins: data.duels_wins,
                                duels_losses: data.duels_losses,
                                duels_tied: data.duels_tied,
                                win_rate: data.win_rate
                            }
                        }));
                    }
                })
                .catch(() => {}); // Keep existing data on error
        }
    }, [session?.token?.username, accountModalOpen])
    useEffect(() => {
        if (!eloData?.elo) return;

        const interval = setInterval(() => {
            setAnimatedEloDisplay((prev) => {
                prev = parseInt(prev.toString().replace(/,/g, ""));
                const diff = eloData.elo - prev;

                // Determine the step based on the difference
                const step = Math.ceil(Math.abs(diff) / 10) || 1; // Minimum step is 1

                // Smooth animation
                if (diff > 0) return Math.min(prev + step, eloData.elo);
                if (diff < 0) return Math.max(prev - step, eloData.elo);
                return prev;
            });
        }, 50);

        return () => clearInterval(interval);
    }, [eloData?.elo]);
    useEffect(() => {
        const clientConfigData = clientConfig();
        setConfig(clientConfigData);
        window.cConfig = clientConfigData;

        if (window.location.search.includes("app=true")) {
            setIsApp(true);
        }
        if (window.location.search.includes("instantJoin=true")) {
            // crazygames
        }


        async function crazyAuthListener() {
          // Never let this reject. It runs both as `.then(finish)` below and as
          // the SDK's registered auth-listener callback; an unguarded throw (the
          // SDK being disabled / not yet initialized on this domain) would escape
          // as an unhandled promise rejection.
          try {
            const user = await window.CrazyGames.SDK.user.getUser();
            if (user) {
                const token = await window.CrazyGames.SDK.user.getUserToken();
                if (token && user.username) {
                    // /api/crazyAuth
                    let loadingStopCalled = false;
                    const callLoadingStop = () => {
                        if (loadingStopCalled) return;
                        loadingStopCalled = true;
                        try {
                            window.CrazyGames.SDK.game.loadingStop();
                        } catch (e) { }
                    };

                    const crazyAuthStart = performance.now();
                    fetch(clientConfigData.apiUrl + "/api/crazyAuth", {
                        method: "POST",
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ token, username: user.username })
                    }).then((res) => {
                        // Call loadingStop immediately when response is received (before JSON parsing)
                        callLoadingStop();
                        return res.json();
                    }).then((data) => {
                        if (data.secret && data.username) {
                            // Store full auth data including extended fields (elo, rank, etc.)
                            setSession({ token: data })
                            // verify the ws
                            window.verifyPayload = JSON.stringify({ type: "verify", secret: data.secret, username: data.username, platform: getPlatform(), teamSupport: true });

                            setWs((prev) => {
                                if (prev) prev.send(window.verifyPayload)
                                return prev;
                            });
                        } else if (data.error) {
                            // Explicit server refusal (blocklisted identity
                            // re-signup from crazyAuth) — show the real reason.
                            console.error("[CrazyAuth] sign-in refused:", data.error);
                            toast.error(data.error, { autoClose: 12000 });
                        } else {
                            toast.error("CrazyGames auth failed")
                        }
                    }).catch((e) => {
                        // Call loadingStop in case of network error (where first .then() never ran)
                        callLoadingStop();
                        const crazyAuthDuration = (performance.now() - crazyAuthStart).toFixed(0);
                        console.error(`[CrazyAuth] failed (took ${crazyAuthDuration}ms)`, e)
                    });

                }
            } else {
                // user not logged in
                // verify with not_logged_in
                let rc = gameStorage.getItem("rejoinCode");

                window.verifyPayload = JSON.stringify({
                    type: "verify", secret: "not_logged_in", username: "not_logged_in",
                    rejoinCode: rc, platform: getPlatform(), teamSupport: true
                });
                setWs((prev) => {
                    if (prev) prev.send(window.verifyPayload)
                    return prev;
                });
            }
          } catch (e) {
            console.error("crazygames auth listener failed", e);
          }
        }

        function finish() {
            const onboardingCompletedd = gameStorage.getItem("onboarding");
            if (onboardingCompletedd !== "done") {
                const started = startOnboarding();
                if (started) setWelcomeOverlayShown(true);
            }
            else setOnboardingCompleted(true)

            if (window.location.search.includes("map=")) {
                // get map slug map=slug from url
                const params = new URLSearchParams(window.location.search);
                const mapSlug = params.get("map");
                hasEnteredSingleplayer.current = true;
                setScreen("singleplayer")

                openMap(mapSlug)
            }
        }
        if (window.location.search.includes("crazygames")) {
            setInCrazyGames(true);
            window.inCrazyGames = true;
            setLoading(true)

            window.onCrazyload = () => {

                // initialize the sdk
                try {
                    window.CrazyGames.SDK.init().then(async () => {
                        setLoading(false)
                        try {
                            window.CrazyGames.SDK.game.loadingStart();
                        } catch (e) { }

                        crazyAuthListener().then(() => {
                            // check if onboarding is done
                            finish()
                        })


                        window.CrazyGames.SDK.user.addAuthListener(crazyAuthListener);

                    }).catch((e) => {
                        finish()
                        console.error("crazygames sdk init failed", e)
                        setLoading(false)
                    })
                } catch (e) {
                    console.error("crazygames sdk init failed", e)
                    finish()
                    setLoading(false)
                }
            }

            if (window.CrazyGames) {
                window.onCrazyload();
            }
        }
        initialMultiplayerState.createOptions.displayLocation = text("allCountries")

        return () => {
            try {
                if (!window.CrazyGames || !window.CrazyGames.SDK || !window.CrazyGames.SDK.user) return;
                window.CrazyGames.SDK.user.removeAuthListener(crazyAuthListener);
            } catch (e) {
                console.error("crazygames remove auth listener error", e)
            }
        }

    }, []);

    const [onboarding, setOnboarding] = useState(null);
    // Mirror DailyChallengeScreen's internal phase so the navbar can hide its
    // back button only during the actual round, not on landing/results.
    const [dailyPhase, setDailyPhase] = useState(null);
    const [onboardingCompleted, setOnboardingCompleted] = useState(null);
    const [otherOptions, setOtherOptions] = useState([]); // for country guesser
    const [showCountryButtons, setShowCountryButtons] = useState(true);
    const [countryGuesserCorrect, setCountryGuesserCorrect] = useState(false);
    const [welcomeOverlayShown, setWelcomeOverlayShown] = useState(false);
    // Gates the onboarding GameUI mount — and with it the round-1 street view
    // preload — until load + idle while the welcome overlay is up. See the
    // effect next to the onboarding-start effect.
    const [svPreloadReady, setSvPreloadReady] = useState(false);
    const [onboardingMode, setOnboardingMode] = useState("classic");
    const [countryGuessrMode, setCountryGuessrMode] = useState({ subMode: "country", region: "all" });
    const hasEnteredSingleplayer = useRef(false);
    const lastSingleplayerScreen = useRef(null);

    const [showSuggestLoginModal, setShowSuggestLoginModal] = useState(false);
    // Both login modals stay MOUNTED after their first open and close through
    // react-responsive-modal's `open` prop — conditional unmount tore them out
    // of the tree mid-close and skipped the exit animation. The ref delays the
    // first mount so the dynamic chunk isn't fetched pre-interaction.
    const suggestModalMountedRef = useRef(false);
    if (showSuggestLoginModal) suggestModalMountedRef.current = true;
    // Guest clicked a login-locked mode: '2v2' | 'ranked' picks the variant
    // copy, and (leaveConfirm-style) survives closing so the modal doesn't
    // blank mid fade-out; the boolean drives open/close.
    const [linkGoogleModal, setLinkGoogleModal] = useState(null);
    const [linkGoogleModalOpen, setLinkGoogleModalOpen] = useState(false);
    const [showDiscordModal, setShowDiscordModal] = useState(false);
    const [singlePlayerRound, setSinglePlayerRound] = useState(null);
    const [partyModalShown, setPartyModalShown] = useState(false);
    const [selectCountryModalShown, setSelectCountryModalShown] = useState(false);
    const [connectionErrorModalShown, setConnectionErrorModalShown] = useState(false);

    // Leave/forfeit confirmation (replaces window.confirm). The payload
    // survives closing so the message doesn't blank mid fade-out animation.
    const [leaveConfirm, setLeaveConfirm] = useState(null);
    const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);


    const [inCoolMathGames, setInCoolMathGames] = useState(false);
    const [inGameDistribution, setInGameDistribution] = useState(false);
    const [navSlideOut, setNavSlideOut] = useState(false);

    // Play the nav slide-out animation, then run the action once it finishes.
    // Every main-menu button that leaves the home screen must go through this —
    // acting immediately unmounts the menu with no transition.
    const navSlideOutThen = (action) => {
        setNavSlideOut(true);
        setTimeout(() => {
            setNavSlideOut(false); // Reset for next use
            action();
        }, 300);
    };

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
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (initialScreen === 'daily' || isDailyPath(window.location.pathname)) {
            setScreen('daily');
        }
        const onPop = () => {
            if (isDailyPath(window.location.pathname)) setScreen('daily');
            else if (screenRef.current === 'daily') setScreen('home');
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [initialScreen, isDailyPath]);

    // Keep the URL in sync with the `screen` state for daily mode. Anything
    // that transitions screen away from 'daily' (back button on the navbar,
    // exit from results modal, popstate, etc.) must also clear `/daily` from
    // the URL. Doing it here rather than inside each exit path means we
    // can't forget to call it.
    const prevScreenForUrlRef = useRef(screen);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const prev = prevScreenForUrlRef.current;
        prevScreenForUrlRef.current = screen;
        if (prev === 'daily' && screen !== 'daily' && isDailyPath(window.location.pathname)) {
            const match = /^\/(es|fr|de|ru|en)\/daily$/.exec(window.location.pathname);
            const target = match ? `/${match[1]}` : '/';
            window.history.pushState({}, '', target);
        }
    }, [screen, isDailyPath]);

    // Close suggest login modal when user successfully logs in
    useEffect(() => {
        if (session?.token?.secret && showSuggestLoginModal) {
            setShowSuggestLoginModal(false);
        }
        // Same for the link-Google conversion modal (covers the CrazyGames
        // auth-listener path too, which resolves outside the modal's control).
        if (session?.token?.secret && linkGoogleModalOpen) {
            setLinkGoogleModalOpen(false);
        }
    }, [session?.token?.secret, showSuggestLoginModal, linkGoogleModalOpen]);

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
    useEffect(() => {
        if (screen !== "home") return;
        if (session?.token?.secret) return;
        if (inCrazyGames || inCoolMathGames || inGameDistribution) return;
        if (typeof window === 'undefined') return;
        // Skip re-running while the modal is currently open — otherwise opening it
        // would immediately trigger another evaluation and double-increment the count.
        if (showSuggestLoginModal) return;
        // Never stack on top of the link-Google conversion modal. Also closes
        // the race where the 2.5s timer below is already pending when the user
        // clicks 2v2/Ranked: this dep change re-runs the effect, whose cleanup
        // cancels the pending timer.
        if (linkGoogleModalOpen) return;

        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        let willShowNeverAgain = false;
        try {
            // Hard opt-out: user clicked "Don't show this again"
            if (window.localStorage.getItem("suggestLoginNeverShow")) return;

            // Migrate legacy one-time flag: treat as just-shown-now so the 7-day rule applies
            const legacy = window.localStorage.getItem("suggestLoginShown");
            if (legacy && !window.localStorage.getItem("suggestLoginLastShown")) {
                window.localStorage.setItem("suggestLoginLastShown", String(Date.now()));
                window.localStorage.removeItem("suggestLoginShown");
            }

            const lastShownRaw = window.localStorage.getItem("suggestLoginLastShown");
            const lastShown = lastShownRaw ? parseInt(lastShownRaw, 10) : null;

            if (lastShown) {
                // Seen before — only show again once the cooldown window has elapsed.
                // The only permanent opt-out is the `suggestLoginNeverShow` flag that the
                // user sets explicitly by clicking "Don't show this again".
                if (Date.now() - lastShown < SEVEN_DAYS_MS) return;
                // Any repeat show (2nd onward) gets the "Don't show again" opt-out link
                willShowNeverAgain = true;
            }
        } catch (e) { return; }

        const timer = setTimeout(() => {
            // Re-check at fire time in case things changed during the delay
            if (session?.token?.secret) return;
            try {
                if (window.localStorage.getItem("suggestLoginNeverShow")) return;
                window.localStorage.setItem("suggestLoginLastShown", String(Date.now()));
                const prev = parseInt(window.localStorage.getItem("suggestLoginShownCount") || "0", 10);
                window.localStorage.setItem("suggestLoginShownCount", String(prev + 1));
            } catch (e) { return; }
            setSuggestLoginShowNeverAgain(willShowNeverAgain);
            setShowSuggestLoginModal(true);
        }, 2500);

        return () => clearTimeout(timer);
    }, [screen, session?.token?.secret, inCrazyGames, inCoolMathGames, inGameDistribution, showSuggestLoginModal, linkGoogleModalOpen]);

    // check if ?coolmath=true
    useEffect(() => {
        if (process.env.NEXT_PUBLIC_COOLMATH === "true") {
            setInCoolMathGames(true);
            window.lastCoolmathAd = Date.now();

            // Fade out and remove the static HTML splash from _document.js
            const splash = document.getElementById('cmg-splash');
            if (splash) {
                // Ensure splash was visible for at least 1s total
                const elapsed = Date.now() - (window.__cmgSplashStart || 0);
                const remaining = Math.max(0, 1000 - elapsed);

                const fadeOutTimer = setTimeout(() => {
                    splash.style.transition = 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
                    splash.style.opacity = '0';
                    splash.style.pointerEvents = 'none';
                }, remaining);
                const removeTimer = setTimeout(() => {
                    splash.remove();
                }, remaining + 600);

                return () => {
                    clearTimeout(fadeOutTimer);
                    clearTimeout(removeTimer);
                }
            }
        }
    }, [])

    // GameDistribution SDK initialization
    useEffect(() => {
        if (process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true") {
            setInGameDistribution(true);
            window.inGameDistribution = true;

            // Set up GD SDK event callbacks
            // Called by the GD SDK bridge in headContent.js
            window.onGDPauseGame = () => { };
            window.onGDResumeGame = () => {
                if (window._gdAdTimeout) {
                    clearTimeout(window._gdAdTimeout);
                    window._gdAdTimeout = null;
                }
                if (window._gdAdFinished) {
                    window._gdAdFinished();
                    window._gdAdFinished = null;
                }
            };

            // Show interstitial pre-roll on first user interaction (GD SDK requires a user gesture)
            const handleFirstInteraction = () => {
                try {
                    if (typeof gdsdk !== 'undefined' && typeof gdsdk.showAd !== 'undefined') {
                        gdsdk.showAd('interstitial');
                    }
                } catch (e) {
                    console.warn("GD preroll error:", e);
                }
                document.removeEventListener('click', handleFirstInteraction);
                document.removeEventListener('touchstart', handleFirstInteraction);
            };
            document.addEventListener('click', handleFirstInteraction, { once: true });
            document.addEventListener('touchstart', handleFirstInteraction, { once: true });

            // Handle Google OAuth redirect callback (redirect flow for iframe compatibility)
            const params = new URLSearchParams(window.location.search);
            const code = params.get("code");
            if (code) {
                // Clean the code from URL
                window.history.replaceState({}, '', window.location.pathname);
                setLoginQueued(true);
                fetchWithFallback(
                    clientConfig().authUrl + "/api/googleAuth",
                    clientConfig().apiUrl + "/api/googleAuth",
                    {
                        body: JSON.stringify({ code, redirect_uri: window.location.origin + window.location.pathname }),
                        method: "POST",
                        headers: { 'Content-Type': 'application/json' }
                    },
                    'googleAuthRedirect',
                    {}
                ).then((res) => res.json()).then((data) => {
                    if (data.secret) {
                        setSession({ token: data });
                        window.localStorage.setItem("wg_secret", data.secret);
                    } else if (data.error) {
                        // Same as the popup flow: surface an explicit server
                        // refusal (banned-identity re-signup) verbatim.
                        console.error("[Auth] GD redirect sign-in refused:", data.error);
                        toast.error(data.error, { autoClose: 12000 });
                    } else {
                        console.error("[Auth] GD redirect login: no secret received");
                        toast.error("Login error, contact support if this persists");
                    }
                }).catch((e) => {
                    console.error("[Auth] GD redirect login failed:", e);
                    toast.error("Login failed, please try again");
                }).finally(() => {
                    setLoginQueued(false);
                });
            }
        }
    }, [])

    useEffect(() => {
        if (screen === "singleplayer" || screen === "countryGuesser") {
            lastSingleplayerScreen.current = screen;
            setSinglePlayerRound({
                round: 1,
                totalRounds: screen === "countryGuesser" ? 10 : 5,
                locations: [],
            })
            if (screen === "countryGuesser") {
                setShowCountryButtons(true);
            }
        }
    }, [screen])

    const [allLocsArray, setAllLocsArray] = useState([]);

    function startOnboarding(mode = "classic") {

        if (inCrazyGames || window.inCrazyGames) {
            // make sure its not an invite link
            try {
                const code = window.CrazyGames?.SDK?.game?.getInviteParam?.("code")
                if (code && code.length === 6) {
                    return false;
                }
            } catch (e) {
                console.error("crazygames invite check failed", e);
            }

            // make sure tis not already completed
            const onboarding = gameStorage.getItem("onboarding");
            if (onboarding === "done") {
                return false;
            }
        }

        setScreen("onboarding")

        // 3 universally recognizable locations for the tutorial
        const onboardingLocations = [
            { lat: 29.9773337, long: 31.1321796, heading: 223, pitch: 5, country: "EG", otherOptions: ["TR", "BR", "IN"] },
            { lat: 40.7566514, long: -73.986534, heading: 31, country: "US", otherOptions: ["GB", "JP", "AU"] },
            { lat: 48.8583601, long: 2.2915727, heading: 41, country: "FR", otherOptions: ["IT", "ES", "DE"] },
        ]

        setOnboarding({
            round: 1,
            locations: onboardingLocations,
            startTime: Date.now(),
            mode: mode,
        })
        sendEvent("tutorial_begin", { mode })
        setShowCountryButtons(mode !== "classic")
        return true;
    }
    function openMap(mapSlug) {
        const country = countries.find((c) => c === mapSlug.toUpperCase());
        let officialCountryMap = null;
        if (country) {
            officialCountryMap = officialCountryMaps.find((c) => c.countryCode === mapSlug);
        }
        setAllLocsArray([])

        if (!country && mapSlug !== gameOptions.location) {
            if (((window?.lastPlayTrack || 0) + 20000 < Date.now())) {

                try {
                    fetch(clientConfig()?.apiUrl + `/mapPlay/${mapSlug}`, { method: "POST" })
                } catch (e) { }

            }

            try {
                window.lastPlayTrack = Date.now();
            } catch (e) { }
        }

        setGameOptions((prev) => {
            const newOptions = {
                ...prev,
                location: mapSlug,
                official: (country || mapSlug === 'all') ? true : false,
                countryMap: country,
                communityMapName: (country || mapSlug === 'all') ? "" : prev.communityMapName, // Clear community map name for official maps
                maxDist: country ? countryMaxDists[country] : 20000,
                extent: country && officialCountryMap && officialCountryMap.extent ? officialCountryMap.extent : null
            };


            return newOptions;
        })
    }

    function cancelInFlightLocationLoad() {
        loadLocationRequestRef.current += 1;
    }

    function setWorldMapOptions() {
        setGameOptions((prev) => ({
            ...prev,
            location: "all",
            official: true,
            countryMap: false,
            communityMapName: "",
            maxDist: 20000,
            extent: null
        }));
    }

    function enterCountryGuessrMode(subMode) {
        cancelInFlightLocationLoad();
        setLoading(false);
        setAllLocsArray([]);
        setLatLong(null);
        setShowAnswer(false);
        setPinPoint(null);
        setHintShown(false);
        setCountryGuessrMode({ subMode, region: "all" });
        setShowCountryButtons(true);
        setWorldMapOptions();
        setPendingCountryGuessrLoad((prev) => prev + 1);

        if (screen !== "countryGuesser") {
            setScreen("countryGuesser");
        } else {
            setSinglePlayerRound({ round: 1, totalRounds: 10, locations: [] });
        }
    }

    useEffect(() => {
        if (!pendingCountryGuessrLoad) return;
        if (screen !== "countryGuesser") return;
        if (gameOptions.location !== "all") return;

        setPendingCountryGuessrLoad(0);
        loadLocation({ force: true, ignoreCache: true });
    }, [pendingCountryGuessrLoad, screen, gameOptions.location, countryGuessrMode.subMode])

    useEffect(() => {
        if (screen !== "countryGuesser" || !loading || showAnswer) return;

        const recoveryId = countryGuessrLoadRecoveryRef.current + 1;
        countryGuessrLoadRecoveryRef.current = recoveryId;

        const recoveryTimeout = setTimeout(() => {
            if (countryGuessrLoadRecoveryRef.current !== recoveryId) return;
            cancelInFlightLocationLoad();
            setLoading(false);
            setAllLocsArray([]);
            setLatLong(null);
            setWorldMapOptions();
            setPendingCountryGuessrLoad((prev) => prev + 1);
        }, 12000);

        return () => clearTimeout(recoveryTimeout);
    }, [screen, loading, showAnswer, countryGuessrMode.subMode, gameOptions.location])

    // useLayoutEffect (not useEffect): this is the single path that loads the
    // next onboarding location. Running after paint leaves one frame where
    // showAnswer is cleared, the round bumped, but loading is still false and
    // latLong is still the old round — the old StreetView flashes uncovered.
    // useLayoutEffect runs before paint so the iframe is covered cleanly.
    useLayoutEffect(() => {
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
    useEffect(() => {
        try {
            const onboarding = gameStorage.getItem("onboarding");
            // check url
            const cg = window.location.search.includes("crazygames");
            const specifiedMapSlug = window.location.search.includes("map=");
            // Party-link entry (?party=...) must skip onboarding for this
            // session: the auto-join effect runs after `multiplayerState.verified`
            // flips, which is later than onboarding's startup, so the tutorial
            // would briefly start, allocate a streetview round, then get torn
            // down — producing the "connection lost" glitch. Like ?map= and
            // /daily, we don't write "done" to storage so the tutorial still
            // appears next time the user lands on home without a party link.
            const hasPartyParam = typeof window !== 'undefined'
              && new URLSearchParams(window.location.search).has('party');
            // Direct /daily entry skips the classic-mode tutorial — first-time
            // users came here for the daily challenge, not for an onboarding
            // street-view round. We don't write "done" to localStorage so
            // they'll still see the tutorial later if they navigate to home.
            const onDailyEntry = initialScreen === 'daily'
              || (typeof window !== 'undefined' && isDailyPath(window.location.pathname));
            if (onboarding && onboarding === "done") {
                setOnboardingCompleted(true)


            }
            else if (specifiedMapSlug && !cg) setOnboardingCompleted(true)
            else if (hasPartyParam) setOnboardingCompleted(true)
            else if (onDailyEntry) setOnboardingCompleted(true)
            else setOnboardingCompleted(false)
        } catch (e) {
            console.error(e, "onboard");
            setOnboardingCompleted(true);
        }
    }, [])



    useEffect(() => {

        // check if pirated
        if (isForbiddenIframe() && !window.blocked) {
            // display a message
            window.blocked = true;
            document.write(`
        <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Play WorldGuessr</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body, html {
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      background: url('https://www.worldguessr.com/street1.jpg') no-repeat center center/cover;
      font-family: 'Arial', sans-serif;
    }

    .container {
      text-align: center;
      background-color: rgba(255, 255, 255, 0.8);
      padding: 30px;
      border-radius: 10px;
    }

    h1 {
      font-size: 2.5rem;
      margin-bottom: 20px;
    }

    a {
      text-decoration: none;
    }

    .play-button {
      background-color: #2563eb;
      color: white;
      padding: 15px 30px;
      font-size: 1.5rem;
      border-radius: 50px;
      border: none;
      cursor: pointer;
      transition: background-color 0.3s ease, transform 0.2s ease;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    }

    .play-button:hover {
      background-color: #1d4ed8;
      transform: scale(1.05);
    }

    .play-button:active {
      background-color: #1e40af;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Welcome to WorldGuessr!</h1>
    <a href="https://worldguessr.com" target="_blank">
      <button class="play-button">Open in New Tab ↗</button>
    </a>
  </div>
</body>
</html>
`)
            sendEvent("blocked_iframe")
        }
        // check if learn mode
        if (window.location.search.includes("learn=true")) {
            window.learnMode = true;
            hasEnteredSingleplayer.current = true;
            // immediately open single player
            setScreen("singleplayer")
        }
        // check if from map screen
        if (window.location.search.includes("map=") && !window.location.search.includes("crazygames")) {
            // get map slug map=slug from url
            const params = new URLSearchParams(window.location.search);
            const mapSlug = params.get("map");
            hasEnteredSingleplayer.current = true;
            setScreen("singleplayer")

            openMap(mapSlug)
        }

        if (window.location.search.includes("createPrivateGame=true")) {
        }
    }, [])

    // Separate useEffect to clean up URL parameters after component has mounted
    useEffect(() => {
        // Remove map parameter from URL if present, without causing hydration issues
        if (window.location.search.includes("map=") && !window.location.search.includes("crazygames")) {
            setTimeout(() => {
                const params = new URLSearchParams(window.location.search);
                params.delete("map");
                const newSearch = params.toString();
                const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
                window.history.replaceState({}, '', newUrl);
            }, 1000); // Delay to ensure the component has mounted
        }
    }, [])

    useEffect(() => {

        // check if learn mode
        if (window.location.search.includes("learn=true")) {
            setOnboardingCompleted(true)
        }


        if (onboardingCompleted === false) {
            if (onboardingCompleted === null) return;
            if (!loading) {

                // Enter onboarding with the mode-select modal on top. The
                // street view preload behind it is held until load + idle
                // (svPreloadReady below) so the Google Maps embed can't
                // starve first paint / hydration on slow connections.
                // CrazyGames used to skip this branch, which started the tutorial without
                // letting players choose the onboarding mode.
                if (startOnboarding("classic")) {
                    setWelcomeOverlayShown(true);
                    return;
                }

                if (inIframe() && window.adBreak && !inCrazyGames) {
                    window.onboardPrerollEnd = false;
                    setLoading(true)
                    window.adBreak({
                        type: "preroll",
                        adBreakDone: function (e) {
                            if (window.onboardPrerollEnd) return;
                            setLoading(false)
                            window.onboardPrerollEnd = true;
                            sendEvent("interstitial", { type: "preroll", ...e })
                            startOnboarding()
                        }
                    })

                    setTimeout(() => {
                        if (!window.onboardPrerollEnd) {
                            window.onboardPrerollEnd = true;
                            setLoading(false)
                            startOnboarding()
                        }
                    }, 3000)
                } else if (!inCrazyGames) {

                    startOnboarding()
                }
            }
        }
    }, [onboardingCompleted])

    // While the welcome overlay covers the screen, hold the onboarding GameUI
    // mount (whose mount effect loads round 1 and with it the ~700 KB Google
    // Maps embed + pano tiles) until the load event plus an idle callback.
    // Real users spend seconds reading the modal, so the preload still wins
    // the race; picking a mode drops the overlay, which mounts GameUI
    // immediately regardless of this flag — fast clickers never wait on it.
    useEffect(() => {
        if (!welcomeOverlayShown || svPreloadReady) return;
        let cancelled = false;
        const allow = () => { if (!cancelled) setSvPreloadReady(true); };
        const whenIdle = () => {
            if ('requestIdleCallback' in window) requestIdleCallback(allow, { timeout: 4000 });
            else setTimeout(allow, 1500);
        };
        if (document.readyState === 'complete') whenIdle();
        else window.addEventListener('load', whenIdle, { once: true });
        return () => {
            cancelled = true;
            window.removeEventListener('load', whenIdle);
        };
    }, [welcomeOverlayShown, svPreloadReady])

    useEffect(() => {
        if (session && session.token && session.token.username && !inCrazyGames) {
            setOnboardingCompleted(true)
            try {
                gameStorage.setItem("onboarding", 'done')
            } catch (e) { }

            // If user is currently in onboarding, redirect to home
            if (screen === "onboarding") {
                setScreen("home")
                setOnboarding(null)
            }
        }
    }, [session])

    useEffect(() => {
        if (!options?.language) return;
        try {
            window.localStorage.setItem("lang", options?.language)
            window.language = options?.language;
            window.dispatchEvent(new CustomEvent('langChange', { detail: options?.language }));

            if (process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true") return;

            // On the very first paint, trust whatever URL the user landed on
            // and skip the auto-redirect entirely. Previously, e.g. visiting
            // `/daily` with localStorage.lang === "es" would `router.replace`
            // to `/es/daily`, unmounting and remounting Home and (until the
            // MultiplayerProvider lift) leaking the WebSocket connection,
            // which the server then kicked with "userAlreadyConnected".
            // Subsequent language changes (from settings) still redirect.
            if (langInitRef.current) {
                langInitRef.current = false;
                return;
            }

            const currentPath = stripBase(window.location.pathname);

            // Special-case /daily (and /[lang]/daily): stay on daily, just swap
            // the locale segment. Without this, the redirect below would yank
            // the user off the daily challenge and onto /{lang}.
            const dailyRegex = /^\/(?:(es|fr|de|ru|en)\/)?daily$/;
            if (dailyRegex.test(currentPath)) {
                const desiredDaily = options.language === 'en' ? '/daily' : `/${options.language}/daily`;
                if (currentPath !== desiredDaily) {
                    router.replace(desiredDaily);
                }
                return;
            }

            const target = `/${options.language}`;
            // Don't redirect to /en from root — English is the default
            const isDefaultOnRoot = options.language === "en" && (currentPath === "/" || currentPath === "");
            if (!isDefaultOnRoot && currentPath !== target) {
                const currentQueryParams = new URLSearchParams(window.location.search);
                const qPsuffix = currentQueryParams.toString() ? `?${currentQueryParams.toString()}` : "";
                router.push(target + qPsuffix);
            }
        } catch (e) { }
    }, [options?.language]);

    const loadOptions = async () => {

        // try to fetch options from localstorage
        try {
            const options = gameStorage.getItem("options");

            // Detect language: URL path wins, then localStorage.lang, then "en"
            let detectedLang = "en";
            try {
                const knownLangs = ["en", "es", "fr", "de", "ru"];
                const urlSegment = stripBase(window.location.pathname).split("/").filter(Boolean)[0];
                if (knownLangs.includes(urlSegment)) {
                    detectedLang = urlSegment;
                } else {
                    const storedLang = window.localStorage.getItem("lang");
                    if (storedLang && knownLangs.includes(storedLang)) {
                        detectedLang = storedLang;
                    }
                }
            } catch(e) {}

            if (options) {
                const parsed = JSON.parse(options);
                parsed.language = detectedLang;
                setOptions(parsed)
            } else {
                let system = "metric";

                // Detect US/UK users for imperial units using timezone + locale
                try {
                    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    const locale = navigator.language;

                    // US timezone detection
                    const isUSTimezone = timezone && (
                        timezone.startsWith('America/') &&
                        !timezone.startsWith('America/Argentina') &&
                        !timezone.startsWith('America/Brazil') &&
                        !timezone.includes('Mexico')
                    );

                    // UK timezone detection
                    const isUKTimezone = timezone && timezone.startsWith('Europe/London');

                    // Locale detection
                    const isUSLocale = locale && locale.startsWith('en-US');
                    const isUKLocale = locale && locale.startsWith('en-GB');

                    if (isUSTimezone || isUKTimezone || isUSLocale || isUKLocale) {
                        system = "imperial";
                    }
                } catch (e) {
                    // If everything fails, default to metric
                }


                setOptions({
                    units: system,
                    mapType: "m", //m for normal
                    language: detectedLang
                })
            }
        } catch (e) { }

    }
    useEffect(() => { loadOptions() }, [])

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

    const [multiplayerEmotesEnabled, setMultiplayerEmotesEnabled] = useState(() => {
        if (typeof window === 'undefined') return true;
        try { return gameStorage.getItem('multiplayerEmotesEnabled') !== 'false'; } catch { return true; }
    });

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
            ws.send(JSON.stringify({ type: "verify", secret: session.token.secret, username: session.token.username, teamSupport: true }))
        }
    }, [session?.token?.secret, ws])

    useEffect(() => {
        if (!ws) return;
        timeSyncRef.current = { bestRtt: Infinity, lastSyncAt: 0, lastServerNow: 0 };
        setTimeOffset(0);
        sendTimeSync();
        const interval = setInterval(() => {
            sendTimeSync();
        }, 30000);
        return () => clearInterval(interval);
    }, [ws])

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

    // NOTE: join-code errors are cleared by the join input's onChange (typing
    // dismisses them) — no auto-dismiss timer, so the message stays readable.

    useEffect(() => {
        if (multiplayerState?.connected && multiplayerError) {
            setMultiplayerError(null)
        }
    }, [multiplayerState?.connected, multiplayerError])

    // ── Queue-join confirmation watchdog ──────────────────────────────────────
    // The server acks a queue join with `queueJoined` (ranked also sends
    // `publicDuelRange`). If neither arrives within WS_QUEUE_CONFIRM_TIMEOUT_MS the
    // join never registered server-side, so we bail off the searching screen with a
    // toast instead of leaving the user waiting on a queue they were never in.
    function clearQueueConfirmWatchdog() {
        if (queueConfirmTimerRef.current) {
            clearTimeout(queueConfirmTimerRef.current);
            queueConfirmTimerRef.current = null;
        }
    }
    function armQueueConfirmWatchdog() {
        clearQueueConfirmWatchdog();
        queueConfirmTimerRef.current = setTimeout(() => {
            queueConfirmTimerRef.current = null;
            const st = mpStateRef.current;
            // Already moved on (match started, cancelled, or disconnected) — the
            // join clearly worked or no longer matters.
            if (!st || !st.gameQueued || st.inGame) return;
            // No ack: the server never queued us. Drop us (a no-op server-side if it
            // never had us), leave the searching screen, and surface the failure.
            try { ws?.send(JSON.stringify({ type: "leaveQueue" })); } catch (e) {}
            setMultiplayerState((prev) => ({ ...prev, gameQueued: false, publicDuelRange: null }));
            setScreen("home");
            toast(text("queueJoinFailed") || "Couldn't join the queue. Please try again.", { type: 'error', theme: "dark" });
        }, WS_QUEUE_CONFIRM_TIMEOUT_MS);
    }

    function handleMultiplayerAction(action, ...args) {
        if (!ws || !multiplayerState.connected) {
            setConnectionErrorModalShown(true);

            return;
        }

        // Cancel stage-1 teammate matchmaking WITHOUT leaving the lobby (the
        // back-button path would send leaveGame — inGame stays true during
        // stage 1). Drop the queue entry server-side; the lobby restore
        // re-sends state, confirming the optimistic flip below. Must run
        // before the gameQueued guard — we ARE queued while cancelling.
        if (action === "cancelTeammateSearch") {
            ws.send(JSON.stringify({ type: "leaveQueue" }));
            sendEvent("multiplayer_cancel_teammate_search");
            setMultiplayerState((prev) => ({ ...prev, gameQueued: false, queueStage: null }));
            return;
        }

        if (multiplayerState.gameQueued || multiplayerState.connecting) return;

        if (action === "publicDuel") {
            crazyMidgame(() => {
            setScreen("multiplayer")
            setMultiplayerState((prev) => ({
                ...prev,
                gameQueued: "publicDuel",
                nextGameType: undefined,
                nextGameQueued: false
            }))
            sendEvent("multiplayer_request_ranked_duel")
            ws.send(JSON.stringify({ type: "publicDuel" }))
            armQueueConfirmWatchdog()
            })
        }

        if (action === "unrankedDuel") {
            crazyMidgame(() => {
            setScreen("multiplayer")
            setMultiplayerState((prev) => ({
                ...prev,
                gameQueued: "unrankedDuel",
                nextGameType: undefined,
                nextGameQueued: false,
                publicDuelRange: null
            }))
            sendEvent("multiplayer_request_unranked_duel")
            ws.send(JSON.stringify({ type: "unrankedDuel" }))
            armQueueConfirmWatchdog()
            })
        }

        if (action === "joinPrivateGame") {

            if (args[0]) {
                setScreen("multiplayer")

                setMultiplayerState((prev) => ({
                    ...prev,
                    joinOptions: {
                        ...prev.joinOptions,
                        error: false,
                        progress: true
                    }
                }));
                // join Party
                ws.send(JSON.stringify({ type: "joinPrivateGame", gameCode: args[0] }))
                sendEvent("multiplayer_join_private_game", { gameCode: args[0] })

            } else {
                setScreen("multiplayer")
                // Reachable from inside the 2v2 staging lobby ("have a code?"
                // link) — leave the server-side lobby so it can't linger as a
                // ghost. No-op from home/onboarding (not in any lobby).
                if ((multiplayerState?.inGame && multiplayerState?.gameData?.state === "waiting")
                    || multiplayerState?.lobbyIntent) {
                    try { ws.send(JSON.stringify({ type: 'leaveGame' })) } catch (e) { }
                }
                setMultiplayerState((prev) => {
                    return {
                        ...initialMultiplayerState,
                        connected: true,
                        lobbyIntent: 'join',
                        playerCount: prev.playerCount,
                        guestName: prev.guestName
                    }

                })
            }
        }

        if (action === "createLobby") {
            // One create path for both flavors: a party, or a 2v2 staging
            // lobby (mode:'2v2' → server caps it at 2 and skips game options).
            // The lobby card renders its pending shell immediately; options
            // live behind the lobby's Edit button (no modal ambush on create).
            const intent = args[0] === "2v2" ? "2v2" : "party";
            setScreen("multiplayer")
            setMultiplayerState((prev) => ({
                ...prev,
                lobbyIntent: intent,
                joinOptions: { ...initialMultiplayerState.joinOptions },
                createOptions: { ...prev.createOptions, progress: true },
            }));
            ws.send(JSON.stringify({
                type: "createPrivateGame",
                ...(intent === "2v2" ? { mode: "2v2" } : {}),
            }));
            // Parties open the options modal right away so hosts pick their
            // settings first (2v2 staging has no options to edit).
            if (intent === "party") setPartyModalShown(true)
            sendEvent(intent === "2v2" ? "multiplayer_create_2v2_lobby" : "multiplayer_create_private_game")
        }

        if (action === "setPrivateGameOptions" && multiplayerState?.inGame && multiplayerState?.gameData?.host && multiplayerState?.gameData?.state === "waiting") {

            if (inCrazyGames) {
                window.CrazyGames.SDK.game.showInviteButton({ code: multiplayerState?.gameData?.code })
            }

            // Use the passed options directly to avoid stale state issues
            const options = args[0] || multiplayerState.createOptions;
            ws.send(JSON.stringify({
                type: "setPrivateGameOptions",
                rounds: options.rounds,
                timePerRound: options.timePerRound,
                nm: options.nm,
                npz: options.npz,
                showRoadName: options.showRoadName,
                location: options.location,
                displayLocation: options.displayLocation
            }));
        }

        if (action === 'startGameHost' && multiplayerState?.inGame && multiplayerState?.gameData?.host && multiplayerState?.gameData?.state === "waiting") {
            ws.send(JSON.stringify({ type: "startGameHost" }))
            sendEvent("multiplayer_start_game_host")
        }

        if (action === "kickPlayer" && args[0] && multiplayerState?.gameData?.host) {
            ws.send(JSON.stringify({ type: "kickPlayer", playerId: args[0] }))
        }

        // ---- Intra-party team mode ----
        // Client gates MIRROR the server's (host/waiting/allowTeamPick); the
        // server re-validates everything and its broadcast is authoritative.
        if (action === "setTeamConfig" && multiplayerState?.inGame && multiplayerState?.gameData?.host && multiplayerState?.gameData?.state === "waiting") {
            ws.send(JSON.stringify({ type: "setTeamConfig", ...args[0] }))
            sendEvent("multiplayer_set_team_config")
        }

        if (action === "shuffleTeams" && multiplayerState?.inGame && multiplayerState?.gameData?.host && multiplayerState?.gameData?.state === "waiting" && multiplayerState?.gameData?.teamGame) {
            ws.send(JSON.stringify({ type: "shuffleTeams" }))
            sendEvent("multiplayer_shuffle_teams")
        }

        if (action === "setPlayerTeam" && args[0] && (args[1] === 'a' || args[1] === 'b')
            && multiplayerState?.inGame && multiplayerState?.gameData?.state === "waiting" && multiplayerState?.gameData?.teamGame) {
            const gd = multiplayerState.gameData;
            const isSelf = args[0] === gd.myId;
            if (!(gd.host || (gd.allowTeamPick && isSelf))) return;
            ws.send(JSON.stringify({ type: "setPlayerTeam", playerId: args[0], team: args[1] }))
            // Optimistic flip so the row jumps columns instantly; the next
            // 'game' broadcast replaces players wholesale and self-corrects.
            setMultiplayerState((prev) => prev.gameData ? ({
                ...prev,
                gameData: {
                    ...prev.gameData,
                    players: prev.gameData.players.map((p) => p.id === args[0] ? { ...p, team: args[1] } : p)
                }
            }) : prev);
        }

        // Find Match: host queues the lobby (solo or duo) for 2v2 matchmaking.
        if (action === "find2v2Match") {
            ws.send(JSON.stringify({ type: "find2v2Match" }))
            sendEvent("multiplayer_find_2v2_match")
        }

        if (action === 'screen') {
            ws.send(JSON.stringify({ type: "screen", screen: args[0] }))
        }


    }

    // WebSocket connect / reconnect lives in MultiplayerProvider (pages/_app.js)
    // so navigation between pages that mount Home (e.g. / -> /es, /daily -> /es/daily)
    // doesn't tear down and re-open the connection — which previously caused the
    // server to kick the older connection with a "userAlreadyConnected" error.

    useEffect(() => {
        if (inCrazyGames || window.poki) {
            // Determine if actual gameplay is happening
            const isInGameplay = ((screen === "singleplayer" || screen === "countryGuesser") && singlePlayerRound && !singlePlayerRound.done) ||
                (screen === "onboarding" && onboarding && !onboarding.completed) ||
                (multiplayerState?.inGame && multiplayerState?.gameData?.state === "guess");

            if (isInGameplay) {
                try {
                    window.CrazyGames.SDK.game.gameplayStart();
                } catch (e) { }
                try {
                    if (window.poki) window.PokiSDK.gameplayStart();
                } catch (e) { }
            } else {
                try {
                    window.CrazyGames.SDK.game.gameplayStop();
                } catch (e) { }
                try {
                    if (window.poki) window.PokiSDK.gameplayStop();
                } catch (e) { }
            }
        }
    }, [screen, inCrazyGames, singlePlayerRound, onboarding, multiplayerState?.inGame, multiplayerState?.gameData?.state])

    useEffect(() => {
        // Wait for verified (not just connected) to ensure verify message was received by server
        if (multiplayerState?.verified && inCrazyGames) {

            // check if joined via invite link
            try {
                let code = window.CrazyGames.SDK.game.getInviteParam("code")
                let instantJoin = (inCrazyGames && window.CrazyGames.SDK.game.isInstantMultiplayer) || window.location.search.includes("instantJoin");

                if (window.CrazyGames.SDK.game.getInviteParam("code") || window.CrazyGames.SDK.game.isInstantMultiplayer) {
                    setInCrazyGames(true);
                }

                if (code || instantJoin) {

                    if (typeof code === "string") {
                        try {
                            code = parseInt(code)
                        } catch (e) {
                        }
                    }

                    setOnboardingCompleted(true)
                    setOnboarding(null)
                    setLoading(false)
                    setScreen("home")
                    if (code) {

                        // join Party
                        handleMultiplayerAction("joinPrivateGame")
                        // set the code
                        setMultiplayerState((prev) => ({
                            ...prev,
                            joinOptions: {
                                ...prev.joinOptions,
                                gameCode: code,
                                progress: true
                            }
                        }))
                        // press go
                        setTimeout(() => {
                            handleMultiplayerAction("joinPrivateGame", code)
                        }, 1000)
                    } else {
                        // create Party
                        handleMultiplayerAction("createLobby", "party")
                    }

                }

            } catch (e) { }

        }
    }, [multiplayerState?.verified, inCrazyGames])

    // Handle ?party= URL param to auto-join a party
    useEffect(() => {
        if (!multiplayerState?.verified || inCrazyGames) return;
        const params = new URLSearchParams(window.location.search);
        const partyCode = params.get("party");
        if (!partyCode) return;

        // Clean up the URL
        params.delete("party");
        const newSearch = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (newSearch ? '?' + newSearch : ''));

        const code = parseInt(partyCode);
        if (isNaN(code)) return;

        // Skip if already in this exact party
        if (multiplayerState?.inGame && multiplayerState?.gameData?.code === code) return;

        // Clear onboarding state if active
        setOnboardingCompleted(true);
        setOnboarding(null);
        setLoading(false);

        // Server already skipped rejoin due to skipRejoin flag, so player is free to join
        handleMultiplayerAction("joinPrivateGame", code);
    }, [multiplayerState?.verified])

    useEffect(() => {
        if (multiplayerState?.inGame && multiplayerState?.gameData?.state === "end") {
            // save the final players
            setMultiplayerState((prev) => {
                if (!prev.gameData) return prev;
                return {
                    ...prev,
                    gameData: {
                        ...prev.gameData,
                        finalPlayers: prev.gameData.players
                    }
                };
            })
        }

        if (multiplayerState?.gameData?.state === "waiting") {
            // remove gameData.finalPlayers
            setMultiplayerState((prev) => {
                if (!prev.gameData) return prev;
                return { ...prev, gameData: { ...prev.gameData, finalPlayers: undefined } };
            });
        }
    }, [multiplayerState?.gameData?.state])

    useEffect(() => {
        if (multiplayerState?.inGame && multiplayerState?.gameData?.state === "end") {
            setMultiplayerEndAnswerHoldExpired(false);
            if (multiplayerEndAnswerHoldTimerRef.current) {
                clearTimeout(multiplayerEndAnswerHoldTimerRef.current);
            }
            multiplayerEndAnswerHoldTimerRef.current = setTimeout(() => {
                setMultiplayerEndAnswerHoldExpired(true);
                multiplayerEndAnswerHoldTimerRef.current = null;
            }, ROUND_OVER_FADE_MS);
            return () => {
                if (multiplayerEndAnswerHoldTimerRef.current) {
                    clearTimeout(multiplayerEndAnswerHoldTimerRef.current);
                    multiplayerEndAnswerHoldTimerRef.current = null;
                }
            };
        }

        setMultiplayerEndAnswerHoldExpired(false);
        if (multiplayerEndAnswerHoldTimerRef.current) {
            clearTimeout(multiplayerEndAnswerHoldTimerRef.current);
            multiplayerEndAnswerHoldTimerRef.current = null;
        }
    }, [multiplayerState?.inGame, multiplayerState?.gameData?.state])


    useEffect(() => {
        // Subscribe to WS messages via the provider. The provider owns the
        // connection lifecycle (so onmessage/onclose/onerror live there too)
        // and forwards every parsed message to subscribers like this one.
        const unsubscribe = subscribeMessages((data) => {

            if (data.type === "restartQueued") {
                setMaintenance(data.value ? true : false)
                if (data.value) {
                    toast.info(text("maintenanceModeStarted"))
                } else if (!data.value && window.maintenance) {
                    toast.info(text("maintenanceModeEnded"))
                }
                window.maintenance = data.value ? true : false;

            }
            if (data.type === "t") {
                const offset = data.t - Date.now();
                const sync = timeSyncRef.current;
                const now = Date.now();
                const useFallback = sync.lastSyncAt === 0 || (now - sync.lastSyncAt) > 60000;
                if (useFallback && Math.abs(offset) < 300000) {
                    if (window.debugTimeSync) {
                        console.log("[TimeSync] fallback", {
                            offset,
                            serverNow: data.t,
                            lastSyncAt: sync.lastSyncAt
                        });
                    }
                    setTimeOffset(offset)
                }
            }
            if (data.type === "timeSync") {
                updateTimeOffsetFromSync(data.serverNow, data.clientSentAt);
            }

            if (data.type === "elo") {
                setEloData((prev) => ({
                    ...prev,
                    league: data.league,
                    elo: data.elo,
                }))
                // Also update session to keep it in sync
                setSession((prev) => ({
                    ...prev,
                    token: {
                        ...prev?.token,
                        elo: data.elo,
                        league: data.league,
                    }
                }));
            }

            // verify / cnt / error state updates live in MultiplayerProvider
            // (they must run even with no consumer mounted). Home adds only
            // what the provider can't do:
            if (data.type === "error") {
                // Force the close→reconnect cycle. For 'verifyError' (DB blip
                // during verify) the server deliberately leaves the socket
                // open and THIS close is what paces the retry; for uac /
                // failedToLogin the server closes anyway, so it's a no-op.
                ws.close();
                // Translated toast (the provider has no `text`).
                toast(data.message === 'uac' ? text('userAlreadyConnected') : data.message, { type: 'error' });

            } else if (data.type === "game") {
                // A match (or private game) started — we're no longer waiting on a
                // queue ack, so retire the watchdog.
                clearQueueConfirmWatchdog();
                // Dispatch global event to close any open modals/screens
                window.dispatchEvent(new CustomEvent('gameStarting'));

                // Close all open modals except party modal for party games
                setAccountModalOpen(false);
                setGameOptionsModalShown(false);
                setSettingsModal(false);
                setMapModal(false);
                setFriendsModal(false);
                setMerchModal(false);
                setShowSuggestLoginModal(false);
                setShowDiscordModal(false);
                setSelectCountryModalShown(false);
                setConnectionErrorModalShown(false);

                setScreen("multiplayer")

                // Play Again duo regroup: the staging lobby arrives queue-bound
                // (queueBoundDuo) and the server's enter2v2Queue follows in the
                // same burst. Skip straight to the queue screen instead of
                // painting the lobby card for a frame in between. Solo
                // survivors never get the flag — stage-1 teammate search
                // renders inside their lobby card — and the deliberate
                // "Queueing in 3…" preview beats don't set it either.
                if (data.is2v2Lobby && data.state === "waiting" && data.queueBoundDuo) {
                    setMultiplayerState((prev) => ({
                        ...prev,
                        inGame: false,
                        gameData: null,
                        lobbyIntent: null,
                        gameQueued: "2v2",
                        queueStage: "opponents",
                        // Emotes stay live on the queue banner (the duo still
                        // shares its staging lobby server-side) — keep my id
                        // around for self-styling now that gameData is gone.
                        queueMyId: data.myId,
                        joinOptions: initialMultiplayerState.joinOptions,
                    }));
                    return;
                }

                setMultiplayerState((prev) => {
                    setGameOptions((prev) => ({
                        ...prev,
                        nm: data.nm,
                        npz: data.npz,
                        showRoadName: data.showRoadName
                    }))

                    const incomingRoundLoc = (data.locations ?? prev?.gameData?.locations)?.[data.curRound - 1];
                    const needsRejoinGuessLocation = !!(
                        prev?.gameData?.state === "guess" &&
                        data.state === "guess" &&
                        !prev?.gameData?.locations?.[data.curRound - 1] &&
                        incomingRoundLoc
                    );

                    if (((!prev.gameData || (prev?.gameData?.state === "getready")) && data.state === "guess") || needsRejoinGuessLocation) {
                        setPinPoint(null)
                        // Set loading state when new round starts to show loading animation
                        setLoading(true)
                        // Increment key to force refresh even if coords are the same
                        setLatLongKey(k => k + 1)
                        if (incomingRoundLoc) {
                            setLatLong(incomingRoundLoc)
                        }
                    }

                    // Rejoin — restore latLong and pinPoint from game state
                    if (!prev.gameData && data.state === "getready" && data.locations && data.curRound > 1) {
                        setLatLong(data.locations[data.curRound - 2])
                    }
                    if ((!prev.gameData || needsRejoinGuessLocation) && data.players) {
                        const me = data.players.find(p => p.id === data.myId);
                        if (me?.guess) {
                            import('leaflet').then(L => {
                                setPinPoint(L.latLng(me.guess[0], me.guess[1]));
                            });
                        }
                    }

                    return {
                        ...prev,
                        gameQueued: false,
                        queueStage: null,
                        inGame: true,
                        gameData: {
                            ...prev.gameData,
                            ...data,
                            type: undefined
                        },
                        // A joiner's 'join' intent is served once the game
                        // arrives; creators keep 'party'/'2v2' for lobby
                        // presentation (primary action, title).
                        lobbyIntent: prev.lobbyIntent === 'join' ? null : prev.lobbyIntent,
                        joinOptions: initialMultiplayerState.joinOptions,
                    }
                })


            } else if (data.type === "playAgain2v2") {
                // Post-game Play Again consensus counter for the results
                // screen ("Play Again (1/2)"). Server re-broadcasts on every
                // ack and on teammate departure (which resets acks).
                setMultiplayerState((prev) => {
                    if (!prev.gameData) return prev;
                    return {
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            playAgain2v2: { needed: data.needed, ackedIds: data.ackedIds || [] }
                        }
                    };
                });
            } else if (data.type === "duelEnd") {
                // { draw: boolean, newElo: number, oldElo: number, winner: boolean, timeElapsed: number }

                setMultiplayerState((prev) => {
                    if (!prev.gameData) return prev;
                    return {
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            duelEnd: data,
                            // Fresh consensus per match — a stale counter from a
                            // previous game must never render on this end screen
                            // (the server re-broadcasts the real one right after).
                            playAgain2v2: null
                        }
                    };
                });
            } else if (data.type === "queueJoined") {
                // Server confirms we're actually in the duel queue (sent for BOTH
                // ranked and unranked). This is the ack the join watchdog waits on;
                // without it there's no way to tell "queued, waiting" apart from
                // "server never queued me".
                clearQueueConfirmWatchdog();
            } else if (data.type === "enter2v2Queue") {
                // Server moved us into 2v2 matchmaking — from a lobby's Find
                // Match, or an auto-requeue after a pre-game cancel.
                // Stage 1 (finding a teammate) renders INSIDE the lobby card,
                // so keep inGame/gameData/lobbyIntent — PartyLobby shows the
                // searching seat. Stage 2 (finding opponents) shows the queue
                // banner as before.
                const teammateStage = data.stage === "teammate";
                setScreen("multiplayer")
                setMultiplayerState((prev) => ({
                    ...prev,
                    inGame: teammateStage ? prev.inGame : false,
                    // Stage 1 keeps the lobby card, but any "Queueing in 3…"
                    // countdown is over the moment we're actually queued —
                    // clear the stamp so a stale one can't keep ticking.
                    gameData: teammateStage
                        ? (prev.gameData ? { ...prev.gameData, autoQueueInMs: null } : prev.gameData)
                        : null,
                    lobbyIntent: teammateStage ? prev.lobbyIntent : null,
                    gameQueued: "2v2",
                    queueStage: teammateStage ? "teammate" : "opponents",
                    // Stage 2 wipes gameData but the duo still shares its
                    // staging lobby server-side, so emotes keep flowing on the
                    // queue banner — preserve my id for self-styling.
                    queueMyId: prev.gameData?.myId ?? prev.queueMyId,
                }))
            } else if (data.type === "publicDuelRange") {
                // Also a valid join confirmation for ranked — retire the watchdog.
                clearQueueConfirmWatchdog();
                setMultiplayerState((prev) => ({
                    ...prev,
                    publicDuelRange: data.range
                }))
            } else if (data.type === "maxDist") {
                const maxDist = data.maxDist;
                setMultiplayerState((prev) => {
                    if (!prev.gameData) return prev;
                    return {
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            maxDist
                        }
                    };
                })

            } else if (data.type === "player") {
                if (data.action === "remove") {
                    setMultiplayerState((prev) => {
                        if (!prev.gameData?.players) return prev;
                        return {
                            ...prev,
                            gameData: {
                                ...prev.gameData,
                                players: prev.gameData.players.filter((p) => p.id !== data.id)
                            }
                        };
                    })
                } else if (data.action === "add") {
                    setMultiplayerState((prev) => {
                        if (!prev.gameData?.players) return prev;
                        return {
                            ...prev,
                            gameData: {
                                ...prev.gameData,
                                players: [...prev.gameData.players, data.player]
                            }
                        };
                    })
                }
            } else if (data.type === "place") {
                // Interim teammate placements AND final placements (broadcast
                // to everyone) both go through setState. The old final-guess
                // path mutated the player object in place with no re-render —
                // it only appeared to work because the 100ms round-timer tick
                // happened to repaint during 'guess'.
                const id = data.id;
                setMultiplayerState((prev) => {
                    if (!prev.gameData?.players) return prev;
                    return {
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            players: prev.gameData.players.map((p) =>
                                p.id === id ? { ...p, final: data.final, latLong: data.latLong } : p
                            )
                        }
                    };
                });
            } else if (data.type === "gameShutdown") {
                // gameShutdown only needs to force-reset the client when the
                // user is still in a game client-side (e.g. party host left
                // mid-round — the server is telling them the game is gone).
                // Two cases where we must NOT run the reset:
                //
                //  1. Public game in 'end' state — the user is viewing the
                //     results screen; back / play-again own the teardown.
                //
                //  2. !inGame already — backBtnPressed has already done the
                //     teardown locally. The server's gameShutdown is the
                //     echo of our own leaveGame. Running the reset here
                //     would clobber state that the re-queue effect has
                //     meanwhile set up (e.g. Play Again → handleMultiplayerAction
                //     sets gameQueued="publicDuel" + screen="multiplayer",
                //     and we'd wipe both and bounce the user to home).
                //
                // Check from the outer closure, not from inside a setState
                // updater — updaters run later in the commit phase, so a
                // flag set there is still false when we branch on it and
                // we'd flash setScreen("home") before the render settles,
                // which made the navbar glitch.
                if (
                    !multiplayerState?.inGame ||
                    (
                        multiplayerState?.gameData?.public &&
                        multiplayerState?.gameData?.state === 'end'
                    )
                ) {
                    return;
                }

                setScreen("home")
                setMultiplayerState((prev) => ({
                    ...initialMultiplayerState,
                    connected: true,
                    nextGameQueued: prev.nextGameQueued,
                    nextGameType: prev.nextGameType,
                    playerCount: prev.playerCount,
                    guestName: prev.guestName,
                    createOptions: prev.createOptions,
                    joinOptions: prev.joinOptions,
                }));
                setGameOptions((prev) => ({
                    ...prev,
                    extent: null
                }))
            } else if (data.type === "gameCancelled") {
                // Game was cancelled before it started (opponent left during countdown)
                // No ELO was lost - just return to home and optionally re-queue
                toast.info(text("opponentLeftBeforeStart") || "Opponent left before the game started. Returning to queue...");

                setScreen("home")

                setMultiplayerState((prev) => {
                    return {
                        ...initialMultiplayerState,
                        connected: true,
                        nextGameQueued: true, // Auto re-queue the player
                        nextGameType: 'ranked',
                        playerCount: prev.playerCount,
                        guestName: prev.guestName
                    }
                });
                setGameOptions((prev) => ({
                    ...prev,
                    extent: null
                }))
            } else if (data.type === "gameJoinError") {
                if (multiplayerState.lobbyIntent) {
                    // On the join screen (or a lobby shell) → inline error,
                    // translated via the same keys the deep-link toast uses.
                    const inlineKey = data.error === 'Game is full' ? 'partyFull' : 'invalidPartyCode';
                    setMultiplayerState((prev) => ({
                        ...prev,
                        joinOptions: {
                            ...prev.joinOptions,
                            error: text(inlineKey) || data.error,
                            progress: false
                        }
                    }))
                } else {
                    // Joined via link — show toast and go home
                    const errorKey = data.error === 'Game is full' ? 'partyFull' : 'invalidPartyCode';
                    toast(text(errorKey) || data.error, { type: 'error' });
                    setScreen("home");
                    setMultiplayerState((prev) => ({
                        ...initialMultiplayerState,
                        connected: prev.connected,
                        verified: prev.verified,
                        playerCount: prev.playerCount,
                        guestName: prev.guestName
                    }));
                }
            } else if (data.type === 'generating') {
                // location generation before round
                setMultiplayerState((prev) => {
                    if (!prev.gameData) return prev;
                    return {
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            generated: data.generated
                        }
                    }
                })
            } else if (data.type === "friendReq") {
                const from = data.name;
                const id = data.id;
                const toAccept = (closeToast) => {
                    ws.send(JSON.stringify({ type: 'acceptFriend', id }))
                    closeToast()
                }
                const toDecline = (closeToast) => {
                    ws.send(JSON.stringify({ type: 'declineFriend', id }))
                    closeToast()
                }
                const toastComponent = function ({ closeToast }) {
                    return (
                        <div>
                            <span>{text("youGotFriendReq", { from })}</span>

                            <button onClick={() => toAccept(closeToast)} className={"accept-button"}>✔</button>
                            &nbsp;
                            <button onClick={() => toDecline(closeToast)} className={"decline-button"}>✖</button>
                        </div>
                    )
                }

                toast(toastComponent, { type: 'info', theme: "dark" })


            } else if (data.type === 'toast') {
                toast(text(data.key, data), { type: data.toastType ?? 'info', theme: "dark", closeOnClick: data.closeOnClick ?? false, autoClose: data.autoClose ?? 5000 })
            } else if (data.type === 'invite') {
                // code, invitedByName, invitedById
                const { code, invitedByName, invitedById } = data;

                const toAccept = (closeToast) => {
                    ws.send(JSON.stringify({ type: 'acceptInvite', code, invitedById }))
                    closeToast()
                }
                const toDecline = (closeToast) => {
                    closeToast()
                }
                const toastComponent = function ({ closeToast }) {
                    return (
                        <div>
                            <span>{text("youGotInvite", { from: invitedByName })}</span>

                            <button onClick={() => toAccept(closeToast)} className={"accept-button"}>{text("join")}</button>
                            &nbsp;
                            <button onClick={() => toDecline(closeToast)} className={"decline-button"}>{text("decline")}</button>
                        </div>
                    )
                }

                toast(toastComponent, { type: 'info', theme: "dark", autoClose: 10000 })
            } else if (data.type === 'streak') {
                const streak = data.streak;

                if (streak === 0) {
                    toast(text("streakLost"), { type: 'info', theme: "dark", autoClose: 5000, closeOnClick: true })
                } else if (streak === 1) {
                    toast(text("streakStarted"), { type: 'info', theme: "dark", autoClose: 5000, closeOnClick: true })
                } else {
                    toast(text("streakGained", { streak }), { type: 'info', theme: "dark", autoClose: 5000, closeOnClick: true })
                }
            }
        });

        return unsubscribe;
        // The handler closes over multiplayerState/timeOffset/gameOptions.extent;
        // re-subscribe whenever any of those change so the closure stays fresh.
    }, [subscribeMessages, ws, multiplayerState, timeOffset, gameOptions?.extent]);

    // Home-side cleanup when the WS goes from connected to disconnected.
    // The provider already resets multiplayerState on close; this effect handles
    // the home-only side effects (error modal, redirect to home, toast).
    // `text` is read through a ref so we don't re-fire on every Home render
    // (useTranslation returns a fresh `t` closure each render).
    const textRef = useRef(text);
    useEffect(() => { textRef.current = text; }, [text]);
    // Keep the latest multiplayerState readable from the delayed queue-confirm
    // watchdog (which would otherwise close over a stale snapshot).
    useEffect(() => { mpStateRef.current = multiplayerState; }, [multiplayerState]);
    const prevWsForCloseRef = useRef(null);
    useEffect(() => {
        if (prevWsForCloseRef.current && !ws) {
            if (window.screen !== "home" && window.screen !== "singleplayer" && window.screen !== "onboarding" && window.screen !== "countryGuesser" && window.screen !== "daily") {
                setMultiplayerError(true);
                setLoading(false);
                toast.info(textRef.current("connectionLostRecov"));
                setScreen("home");
            }
        }
        prevWsForCloseRef.current = ws;
    }, [ws]);

    useEffect(() => {
        window.screen = screen;
    }, [screen])

    useEffect(() => {
        if (multiplayerState?.connected && !multiplayerState?.inGame && multiplayerState?.nextGameQueued) {
            // handleMultiplayerAction("publicDuel");
            if (multiplayerState?.nextGameType === "ranked") {
                handleMultiplayerAction("publicDuel")
            } else if (multiplayerState?.nextGameType === "unranked") {
                handleMultiplayerAction("unrankedDuel")
            }
        }
    }, [multiplayerState, timeOffset])

    useEffect(() => {
        if (multiplayerState?.connected) {
            handleMultiplayerAction("screen", screen);
        }
    }, [screen]);


    function guessMultiplayer(send) {
        if (!send) return;
        // Use the ref to always get the latest pinPoint, avoiding stale closure issues
        // where pinPoint from a previous render (or even previous round) could be sent
        const latestPinPoint = pinPointRef.current;
        if (!multiplayerState.inGame || multiplayerState.gameData?.state !== "guess" || !latestPinPoint) return;

        // Prevent duplicate sends (e.g. space bar spam) — check optimistic final flag
        const me = multiplayerState.gameData.players.find(p => p.id === multiplayerState.gameData.myId);
        if (me?.final) return;

        const pinpointLatLong = [latestPinPoint.lat, latestPinPoint.lng];

        // Optimistically update local player state so UI updates instantly
        if (me) {
            me.final = true;
            me.latLong = pinpointLatLong;
        }

        ws.send(JSON.stringify({ type: "place", latLong: pinpointLatLong, final: true, round: multiplayerState.gameData?.curRound }))
    }

    function sendInvite(id) {
        if (!ws || !multiplayerState?.connected) return;
        ws.send(JSON.stringify({ type: 'inviteFriend', friendId: id }))
    }

    useEffect(() => {
        try {
            const streak = gameStorage.getItem("countryStreak");
            if (streak) {
                const parsedStreak = parseInt(streak);
                if (!isNaN(parsedStreak)) {
                    setCountryStreak(parsedStreak)
                } else {
                    setCountryStreak(0)
                    gameStorage.setItem("countryStreak", 0)
                }
            }
            const cgs = gameStorage.getItem("countryGuessrStreak");
            if (cgs) {
                const parsed = parseInt(cgs);
                if (!isNaN(parsed)) setCgStreak(parsed);
            }

            // preload/cache pin images (kept alive in window.__pinImageCache)
            preloadPinImages();
        } catch (e) { }

    }, [])

    function reloadBtnPressed() {
        if (window.reloadLoc) {
            window.reloadLoc()
        }
    }

    function crazyMidgame(adFinished = () => { }) {
        if (window.inCrazyGames && window.CrazyGames.SDK.environment !== "disabled") {
            try {
                const callbacks = {
                    adFinished: () => adFinished(),
                    adError: (error) => adFinished(),
                };
                window.CrazyGames.SDK.ad.requestAd("midgame", callbacks);
            } catch (e) {
                console.warn("error requesting midgame ad", e)
                adFinished()
            }
        } else if (process.env.NEXT_PUBLIC_COOLMATH === "true" && Date.now() - window.lastCoolmathAd > 600000) {
            try {
                window.lastCoolmathAd = Date.now();
                let cleanedUp = false;
                let safetyTimeout = null;
                const cleanup = () => {
                    if (cleanedUp) return;
                    cleanedUp = true;
                    document.removeEventListener("adBreakStart", onStart);
                    document.removeEventListener("adBreakComplete", onEnd);
                    if (safetyTimeout) {
                        clearTimeout(safetyTimeout);
                        safetyTimeout = null;
                    }
                };
                function onEnd() {
                    cleanup();
                    adFinished();
                }
                function onStart() {
                    // Real ad started — cancel the no-fill fallback so it can't resume mid-ad.
                    if (safetyTimeout) {
                        clearTimeout(safetyTimeout);
                        safetyTimeout = null;
                    }
                }
                document.addEventListener("adBreakStart", onStart);
                document.addEventListener("adBreakComplete", onEnd);
                window.cmgAdBreak();
                // Fallback: if adBreakComplete never fires (no fill, blocker), release listeners and resume.
                safetyTimeout = setTimeout(() => {
                    console.warn("CMG ad timeout, forcing resume");
                    cleanup();
                    adFinished();
                }, 15000);
            } catch (e) {
                console.warn("error requesting midgame ad", e)
                adFinished()
            }
        } else if (process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true") {
            try {
                if (typeof gdsdk !== 'undefined' && typeof gdsdk.showAd !== 'undefined') {
                    // Clear any previous pending state to avoid leaking the prior closure.
                    if (window._gdAdTimeout) {
                        clearTimeout(window._gdAdTimeout);
                        window._gdAdTimeout = null;
                    }
                    window._gdAdFinished = adFinished;
                    // Safety timeout in case SDK events never fire (no fill, dev mode, errors)
                    window._gdAdTimeout = setTimeout(() => {
                        console.warn("GD ad timeout, forcing resume");
                        window._gdAdTimeout = null;
                        const cb = window._gdAdFinished;
                        window._gdAdFinished = null;
                        if (cb) cb();
                    }, 15000);
                    gdsdk.showAd('interstitial');
                } else {
                    adFinished();
                }
            } catch (e) {
                console.warn("error requesting GD midgame ad", e);
                adFinished();
            }
        } else {
            adFinished()
        }
    }


    useEffect(() => {
        window.crazyMidgame = crazyMidgame;

    }, []);

    function clearTeam2v2EndExitTimers() {
        team2v2EndExitTimersRef.current.forEach((timer) => clearTimeout(timer));
        team2v2EndExitTimersRef.current = [];
    }

    function beginTeam2v2EndExit(afterCovered) {
        clearTeam2v2EndExitTimers();
        setTeam2v2EndExitMaskRevealing(false);
        setTeam2v2EndExitMaskShown(true);

        const actionTimer = setTimeout(() => {
            try {
                afterCovered();
            } finally {
                const revealTimer = setTimeout(() => {
                    setTeam2v2EndExitMaskRevealing(true);
                    const clearTimer = setTimeout(() => {
                        setTeam2v2EndExitMaskShown(false);
                        setTeam2v2EndExitMaskRevealing(false);
                    }, TEAM_2V2_END_EXIT_REVEAL_MS);
                    team2v2EndExitTimersRef.current.push(clearTimer);
                }, TEAM_2V2_END_EXIT_COVER_MS);
                team2v2EndExitTimersRef.current.push(revealTimer);
            }
        }, TEAM_2V2_END_EXIT_COVER_MS);
        team2v2EndExitTimersRef.current.push(actionTimer);
    }

    useEffect(() => () => clearTeam2v2EndExitTimers(), []);


    function backBtnPressed(queueNextGame = false, nextGameType, skipConfirm = false) {
        if (!skipConfirm && multiplayerState?.inGame && multiplayerState?.gameData?.team2v2 && multiplayerState?.gameData?.state === "end") {
            beginTeam2v2EndExit(() => backBtnPressed(queueNextGame, nextGameType, true));
            return;
        }

        // Confirm gate runs before any teardown so cancelling leaves the game
        // untouched (window.confirm used to run after the pin/location resets,
        // wiping them even on cancel).
        if (!skipConfirm) {
            const gd = multiplayerState?.gameData;

            // Warning for ranked duels in progress - prevent accidental forfeits
            const isRankedDuel = multiplayerState?.inGame &&
                gd?.duel && !gd?.public && gd?.state !== "end";

            const isPrivateParty = multiplayerState?.inGame &&
                !!gd && !gd.duel && !gd.public;
            const liveRound = !["waiting", "end"].includes(gd?.state);
            // Round-1 countdown = server's own preGame definition (teamDuel
            // routes these leaves to a penalty-free cancel): nothing played
            // yet, so host back is a silent cancel-start, no confirm. Bounded
            // by curRound <= 1 — the post-final ghost getready (curRound =
            // rounds+1) must KEEP the confirm, it guards the results screen.
            const preGameCountdown = gd?.state === "getready" && (gd?.curRound ?? 0) <= 1;

            // Host backing out mid-game ends the match for everyone
            // (resetGame → lobby) — team and classic FFA parties alike.
            const isHostEndMatch = isPrivateParty && gd.host && liveRound && !preGameCountdown;

            // Host backing out of a waiting party lobby disbands it for everyone
            // (server host-leave rule; 2v2 staging lobbies pass the crown to a
            // teammate instead). Only worth a confirm with other players inside.
            const isPartyDisband = isPrivateParty && gd.host &&
                gd.state === "waiting" &&
                !gd.is2v2Lobby &&
                (gd.players?.length ?? 0) > 1;

            // Members: leaving a party is permanent (rejoining needs the code),
            // so confirm in every state — lobby, live rounds and especially the
            // results screen. Mid-round team mode gets the team-abandon wording.
            // 2v2 staging lobbies are exempt: they're disposable by design
            // (entering a friend's code already hops out of one silently).
            const isPartyMemberLeave = isPrivateParty && !gd.host && !gd.is2v2Lobby;

            if (isRankedDuel || isHostEndMatch || isPartyDisband || isPartyMemberLeave) {
                setLeaveConfirm({
                    messageKey: isRankedDuel ? "forfeitWarning"
                        : isPartyDisband ? "disbandPartyWarning"
                        : isHostEndMatch ? "endMatchWarning"
                        : gd.teamGame && liveRound ? "leaveTeamGameWarning"
                        : "leavePartyWarning",
                    confirmKey: isRankedDuel ? "forfeit"
                        : isPartyDisband ? "disbandParty"
                        : isHostEndMatch ? "endMatch"
                        : gd.teamGame && liveRound ? "leaveMatch"
                        : "leaveParty",
                    // navbar wires this straight to onClick, so the first arg
                    // can be a click event — coerce before stashing
                    queueNextGame: queueNextGame === true,
                    nextGameType,
                });
                setLeaveConfirmOpen(true);
                return;
            }
        }

        setOnboardingCompleted(true)
        setLatLong(null)
        setShowAnswer(false)
        setPinPoint(null)

        if (loading) setLoading(false);
        if (multiplayerError) setMultiplayerError(false)

        setPartyModalShown(false)

        if (window.learnMode) {
            // redirect to home
            window.location.href = navigate("/")
            return;
        }

        if (screen === "onboarding") {
            setLatLong(null)
            setShowAnswer(false)
            setScreen("home")
            setOnboarding(null)
            gameStorage.setItem("onboarding", 'done')

            return;
        }

        if (multiplayerState?.inGame) {
            if (!multiplayerState?.gameData?.host || multiplayerState?.gameData?.state === "waiting") {
                const prevState = multiplayerState?.gameData?.state;

                ws.send(JSON.stringify({
                    type: 'leaveGame'
                }))

                if (inCrazyGames) {
                    try {
                        window.CrazyGames.SDK.game.hideInviteButton();
                    } catch (e) { }
                }

                // Own the full teardown here instead of waiting for the
                // server's gameShutdown to reset inGame — public end-state
                // games intentionally ignore that message, so this branch
                // must clear gameData itself or the RoundOverScreen (gated on
                // inGame && state==='end' in GameUI) would keep overlaying home.
                //
                // Preserve createOptions / joinOptions so a user who customised
                // their private-game settings doesn't lose them when backing
                // out of a played game.
                setMultiplayerState((prev) => ({
                    ...initialMultiplayerState,
                    connected: true,
                    nextGameQueued: queueNextGame === true,
                    nextGameType,
                    playerCount: prev.playerCount,
                    guestName: prev.guestName,
                    createOptions: prev.createOptions,
                    joinOptions: prev.joinOptions,
                }))
                setScreen("home")
                // gameShutdown used to clear this; now that we own the
                // teardown, do it here so a stale community-map extent
                // doesn't leak into the next singleplayer / multiplayer game.
                setGameOptions((prev) => ({
                    ...prev,
                    extent: null,
                }))

                if (["getready", "guess"].includes(prevState)) {
                    crazyMidgame()
                }
            } else {
                ws.send(JSON.stringify({ type: "resetGame" }))
            }
        } else if (multiplayerState?.lobbyIntent && multiplayerState?.connected) {
            // Covers the join screen AND a pending create shell. If the server
            // already created the lobby but its `game` message hasn't landed
            // yet, leaveGame prevents a ghost lobby (harmless no-op otherwise).
            try { ws.send(JSON.stringify({ type: 'leaveGame' })) } catch (e) { }

            setMultiplayerState((prev) => {
                return {
                    ...initialMultiplayerState,
                    connected: true,
                    playerCount: prev.playerCount,
                    guestName: prev.guestName

                }
            })
            setScreen("home")

        } else if (multiplayerState?.gameQueued) {
            clearQueueConfirmWatchdog();
            ws.send(JSON.stringify({ type: "leaveQueue" }))

            if (multiplayerState.gameQueued === "2v2") {
                // Backing out of 2v2 matchmaking returns to the team lobby.
                // The server keeps the staging lobby alive while queued and
                // re-sends its state (same code, same teammate) on leaveQueue;
                // show the lobby shell until that lands.
                setMultiplayerState((prev) => ({
                    ...prev,
                    gameQueued: false,
                    queueStage: null,
                    lobbyIntent: '2v2',
                    joinOptions: { ...initialMultiplayerState.joinOptions },
                }));
                return;
            }

            setMultiplayerState((prev) => {
                return {
                    ...prev,
                    gameQueued: false
                }
            });
            setScreen("home")

        } else {
            const afterBack = () => {
                setScreen("home");
                setGameOptions((prev) => ({
                    ...prev,
                    extent: null
                }))
                clearLocation();
            };
            // Show midgame ad when leaving an active singleplayer game
            if (screen === "singleplayer" || screen === "countryGuesser") {
                // crazyMidgame(afterBack);
                afterBack();
            } else {
                afterBack();
            }
        }
    }

    function clearLocation() {
        setLatLong({ lat: 0, long: 0 })
        setShowAnswer(false)
        setPinPoint(null)
        setHintShown(false)
    }

    function loadLocation({ keepAnswer, force, ignoreCache } = {}) {
        if (loading && !force) return;
        const loadLocationRequestId = ++loadLocationRequestRef.current;
        const isCurrentLocationLoad = () => loadLocationRequestId === loadLocationRequestRef.current;
        setLoading(true)
        if (!keepAnswer) setShowAnswer(false)
        if (!keepAnswer) setPinPoint(null)
        if (!keepAnswer) setLatLong(null)
        setHintShown(false)

        if (screen === "onboarding") {
            const loc = onboarding.locations[onboarding.round - 1];
            setLatLong(loc);
            const mode = onboarding.mode || "classic";
            if (mode === "continent") {
                const { ALL_CONTINENTS } = require("@/components/utils/continentFromCode");
                setOtherOptions([...ALL_CONTINENTS]);
            } else if (mode === "country") {
                // Pick 3 random wrong countries for onboarding (4 total - simpler for new players)
                const distractors = [];
                const available = countries.filter(c => c !== loc.country);
                while (distractors.length < 3) {
                    const pick = available[Math.floor(Math.random() * available.length)];
                    if (!distractors.includes(pick)) distractors.push(pick);
                }
                setOtherOptions(shuffle([...distractors, loc.country]));
            } else {
                let options = JSON.parse(JSON.stringify(loc.otherOptions));
                options.push(loc.country);
                setOtherOptions(shuffle(options));
            }
        } else {
            async function defaultMethod() {
                // Country/continent guesser can't tolerate Unknown-country spots.
                // With findCountry's local fallback, this rejection should rarely
                // fire (only for ocean / missing-polygon edge cases).
                const requireKnownCountry = screen === "countryGuesser" || (!!onboarding && onboarding?.mode !== "classic");
                const requireKnownContinent = (screen === "countryGuesser" && countryGuessrMode.subMode === "continent") ||
                    (!!onboarding && onboarding?.mode === "continent");
                try {
                    const mod = await import("@/components/findLatLong");
                    const findLatLongRandom = mod.default;
                    const latLong = await findLatLongRandom({ ...gameOptions, requireKnownCountry, requireKnownContinent });
                    if (!isCurrentLocationLoad()) return;
                    setLatLong(latLong);
                } catch (err) {
                    if (!isCurrentLocationLoad()) return;
                    console.error("[ERROR] Failed to load location:", err);
                    setLoading(false);
                    toast(text("errorLoadingMap"), { type: 'error' });
                }
            }
            function fetchMethod() {
                //gameOptions.countryMap && gameOptions.offical
                const config = clientConfig();
                if (!config?.apiUrl) {
                    defaultMethod();
                    return;
                }
                const url = config.apiUrl + ((gameOptions.location === "all") ? `/${window?.learnMode ? 'clue' : 'all'}Countries.json` :
                    gameOptions.countryMap && gameOptions.official ? `/countryLocations/${gameOptions.countryMap}` :
                        `/mapLocations/${gameOptions.location}`);
                fetch(url).then((res) => {
                    return res.json();
                }).then((data) => {
                    if (!isCurrentLocationLoad()) return;
                    if (data.ready) {
                        // this uses long for lng
                        for (let i = 0; i < data.locations.length; i++) {
                            if (data.locations[i].lng && !data.locations[i].long) {
                                data.locations[i].long = data.locations[i].lng;
                                delete data.locations[i].lng;
                            }
                        }

                        // Fisher-Yates shuffle (unbiased)
                        for (let i = data.locations.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [data.locations[i], data.locations[j]] = [data.locations[j], data.locations[i]];
                        }


                        setAllLocsArray(data.locations)

                        if (gameOptions.location === "all") {
                            const loc = data.locations[0]
                            setLatLong(loc)
                        } else {
                            let loc = data.locations[Math.floor(Math.random() * data.locations.length)];

                            while (latLong && loc.lat === latLong.lat && loc.long === latLong.long) {
                                loc = data.locations[Math.floor(Math.random() * data.locations.length)];
                            }

                            setLatLong(loc)
                            if (data.name) {

                                // calculate extent - simple bounding box [minLng, minLat, maxLng, maxLat]
                                const lngs = data.locations.map(l => l.long);
                                const lats = data.locations.map(l => l.lat);
                                const extent = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];

                                setGameOptions((prev) => ({
                                    ...prev,
                                    communityMapName: data.name,
                                    official: data.official ?? false,
                                    maxDist: data.maxDist ?? 20000,
                                    extent: extent
                                }))

                            }
                        }

                    } else {
                        if (gameOptions.location !== "all") {
                            toast(text("errorLoadingMap"), { type: 'error' })
                        }
                        defaultMethod()
                    }
                }).catch(() => {
                    if (!isCurrentLocationLoad()) return;
                    if (!window._sentMapLoadErrorToast) {
                    toast(text("errorLoadingMap"), { type: 'error' })
                    window._sentMapLoadErrorToast = true;
                    }
                    defaultMethod()
                });
            }

            if (ignoreCache || allLocsArray.length === 0) {
                fetchMethod()
            } else if (allLocsArray.length > 0) {
                const locIndex = (latLong && latLong.lat != null && latLong.long != null)
                    ? allLocsArray.findIndex((l) => l.lat === latLong.lat && l.long === latLong.long)
                    : -1;
                if ((locIndex === -1) || allLocsArray.length === 1) {
                    // No prior location (or only one left) — pick directly from the preloaded array
                    // to avoid an unnecessary refetch.
                    if (!latLong || latLong.lat == null || latLong.long == null) {
                        setAllLocsArray((prev) => {
                            if (!isCurrentLocationLoad()) return prev;
                            if (!prev || prev.length === 0) return prev;
                            const loc = gameOptions.location === "all"
                                ? prev[0]
                                : prev[Math.floor(Math.random() * prev.length)];
                            setLatLong(loc);
                            return prev.filter((l) => l.lat !== loc.lat || l.long !== loc.long);
                        });
                    } else {
                        fetchMethod()
                    }
                } else {
                    // prevent repeats: remove the prev location from the array (for both all and community maps)
                    setAllLocsArray((prev) => {
                        if (!isCurrentLocationLoad()) return prev;
                        const newArr = prev.filter((l) => l.lat !== latLong.lat || l.long !== latLong.long);

                        // Pick next location
                        const loc = gameOptions.location === "all"
                            ? newArr[0]  // World map: take first from shuffled remaining
                            : newArr[Math.floor(Math.random() * newArr.length)];  // Community: random

                        setLatLong(loc);
                        return newArr;
                    })
                }

            }
        }

    }

    // Generate country/continent options when location or submode changes in country guesser mode.
    // Continent options are fixed (the 6 continent names), so we pre-populate them as soon as
    // subMode flips — otherwise switching country<->continent before the next location arrives
    // leaves the row rendered with stale options, which can look empty on mobile.
    //
    // We also refuse to render a round whose correct answer isn't resolvable: a spot with
    // no country (or, in continent mode, a country that doesn't map to a continent) would
    // otherwise show "??" as the right answer. Instead, skip silently to the next location.
    useEffect(() => {
        if (screen !== "countryGuesser") return;

        const isContinentMode = countryGuessrMode.subMode === "continent";

        if (isContinentMode) {
            setOtherOptions([...ALL_CONTINENTS]);
        }

        if (!latLong || !latLong.lat) return;

        const correctCountry = latLong.country;
        const invalid = !correctCountry || correctCountry === "Unknown" ||
            (isContinentMode && continentFromCode(correctCountry) === "Unknown");

        if (invalid) {
            // Don't let a "??" round reach the player. Hide the option row and
            // rotate to the next preloaded location (cheap — no refetch). If the
            // preloaded array is empty or exhausted, fall through to loadLocation,
            // which will fetch fresh data once the in-flight load settles.
            setShowCountryButtons(false);
            setAllLocsArray((prev) => {
                if (!prev || prev.length === 0) return prev;
                const remaining = prev.filter((l) => l.lat !== latLong.lat || l.long !== latLong.long);
                if (remaining.length === 0) return prev;
                const next = gameOptions.location === "all"
                    ? remaining[0]
                    : remaining[Math.floor(Math.random() * remaining.length)];
                setLatLong(next);
                return remaining;
            });
            return;
        }

        if (!isContinentMode) {
            const distractors = [];
            const available = countries.filter((c) => c !== correctCountry);
            while (distractors.length < 5 && available.length > distractors.length) {
                const pick = available[Math.floor(Math.random() * available.length)];
                if (!distractors.includes(pick)) distractors.push(pick);
            }
            setOtherOptions(shuffle([...distractors, correctCountry]));
        }
        setShowCountryButtons(true);
    }, [latLong, screen, countryGuessrMode.subMode]);

    function onNavbarLogoPress() {
        if (screen === "onboarding") return;

        if (screen !== "home" && !loading) {
            if (screen === "multiplayer" && multiplayerState?.connected && !multiplayerState?.inGame) {
                return;
            }
            if (!multiplayerState?.inGame) loadLocation()
            else if (multiplayerState?.gameData?.state === "guess") {

            }
        }
    }

    // My team ('a'|'b'|null) for emote allegiance coloring — derived outside
    // the memo so it only re-renders on an actual team change, not on every
    // players-array update.
    const myEmoteTeam = getMyTeam(multiplayerState?.gameData?.players, multiplayerState?.gameData?.myId);
    // 2v2 queue (stage-2 "finding opponents" banner) keeps emotes alive: the
    // duo still shares its staging lobby server-side, so sends/broadcasts work
    // even though inGame is false and gameData is wiped.
    const emotesLive = multiplayerState?.inGame || multiplayerState?.gameQueued === '2v2';
    const EmoteReactionsMemo = React.useMemo(() => <EmoteReactions
        ws={ws}
        subscribeMessages={subscribeMessages}
        enabled={multiplayerEmotesEnabled && !process.env.NEXT_PUBLIC_SCHOOLGUESSR}
        inGame={emotesLive}
        myId={multiplayerState?.gameData?.myId ?? multiplayerState?.queueMyId}
        myTeam={myEmoteTeam}
        // Hide names only in 1v1 duels, where attribution is obvious (you or
        // the one opponent). 2v2 duels NEED the name + team color — with four
        // players an anonymous emote is unreadable.
        hideName={multiplayerState?.gameData?.duel && !multiplayerState?.gameData?.team2v2}
        rightSide={multiplayerState?.inGame && multiplayerState?.gameData?.state === 'end'}
    />, [ws, subscribeMessages, multiplayerEmotesEnabled, emotesLive, multiplayerState?.inGame, multiplayerState?.gameData?.myId, multiplayerState?.queueMyId, myEmoteTeam, multiplayerState?.gameData?.duel, multiplayerState?.gameData?.team2v2, multiplayerState?.gameData?.state])

    const [showPanoOnResult, setShowPanoOnResult] = useState(false);


    useEffect(() => {
        // Silent cheat detection. We deliberately do NOT notify the user, redirect,
        // write to localStorage, or fire a gtag event: the popular "CheatGuessr"
        // userscript neutralizes all three on worldguessr (it swallows gtag events
        // whose name contains "cheat", drops localStorage writes whose key contains
        // "banned", and its settings panel has no id, so the old DOM-id checks miss
        // it entirely). Instead we fingerprint the artifacts it leaves on the page
        // and quietly report which signals tripped over the already-authenticated
        // websocket, so the server can attribute it to the logged-in account.
        // The client never transmits the account secret — the server derives
        // identity from the socket it verified.
        function detectCheatSignals() {
            const signals = [];

            // Injected DOM from other overlay cheats (kept from the prior check).
            if (document.getElementById("coo1rdinates")) signals.push("dom:coordinates");
            if (document.getElementById("map-canvas")) signals.push("dom:mapcanvas");
            if (document.querySelector(".sgp-fab")) signals.push("dom:sgpfab");
            if (document.getElementById("gmf-panel")) signals.push("dom:gmfpanel");
            if (document.getElementById("wg-helper-ui")) signals.push("dom:wghelper");
            if (document.getElementById("cgx-settings-panel")) signals.push("dom:cgx");
            if (document.getElementById("cmTitle")) signals.push("dom:cmtitle");

            // CheatGuessr Universal (v12.x) fingerprints — the parts of the script
            // that patch the page to defeat detection are themselves detectable:

            // 1. It pins document.visibilityState to always return "visible" (killing
            //    tab-switch detection) by redefining the prototype getter with a plain
            //    JS function. A real browser's getter stringifies to "[native code]".
            try {
                const d = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
                if (d && typeof d.get === "function" && !String(d.get).includes("[native code]")) {
                    signals.push("vis-getter");
                }
            } catch (e) {}

            // 2. It proxies Storage.setItem to silently drop any key containing
            //    "banned". Probe it: a value we write but can't read back was eaten.
            try {
                const k = "wg_bannedprobe";
                window.localStorage.removeItem(k);
                window.localStorage.setItem(k, "1");
                if (window.localStorage.getItem(k) !== "1") signals.push("ls-swallow");
                window.localStorage.removeItem(k);
            } catch (e) {}

            // 3. It locks window.banned to an immutable, non-configurable `true`.
            try {
                const d = Object.getOwnPropertyDescriptor(window, "banned");
                if (d && d.value === true && d.writable === false && d.configurable === false) {
                    signals.push("win-banned-lock");
                }
            } catch (e) {}

            return signals;
        }

        // A logged-in user has an account secret; the server verifies identity
        // from it and pulls username + ELO from the DB. A guest has no secret at
        // all, only an ephemeral name, so it is reported best-effort and flagged
        // unverified server-side. The secret (when present) goes to our own API
        // over HTTPS solely as the identity lookup key; it is never forwarded to
        // the webhook, and the webhook URL is server-only.
        const token = session?.token?.secret || null;
        const guestName = (!token && multiplayerState?.guestName) ? multiplayerState.guestName : null;

        let lastReported = "";
        async function reportIfCheating() {
            const signals = detectCheatSignals();
            if (!signals.length) return;
            const sig = signals.slice().sort().join(",");
            if (sig === lastReported) return; // don't re-send an unchanged finding

            if (!window.cConfig?.apiUrl) return;
            // Need something to attribute the report to — a logged-in secret or,
            // failing that, a guest name. Anonymous with neither: nothing to send.
            if (!token && !guestName) return;

            try {
                const res = await fetch(window.cConfig.apiUrl + "/api/reportClientState", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token, guestName, signals }),
                });
                // Only latch once the server accepted it, so a transient failure
                // (offline, not yet connected) retries on the next tick.
                if (res.ok) lastReported = sig;
            } catch (e) {
                // Silent by design — never surface anything to the user.
            }
        }

        reportIfCheating();
        const i = setInterval(reportIfCheating, 10000);
        return () => clearInterval(i);
    }, [session?.token?.secret, multiplayerState?.guestName])

    // Note: Both banned users and users with pending name change CAN still play singleplayer
    // They just can't do multiplayer - the check is done in the websocket server
    // Banned users are also excluded from leaderboards (handled in api/leaderboard.js)

    const multiplayerGameState = multiplayerState?.gameData?.state;
    const multiplayerEndAnswerHoldActive = multiplayerGameState === 'end' && !multiplayerEndAnswerHoldExpired;
    const multiplayerShowAnswer = multiplayerEndAnswerHoldActive || (
        multiplayerState?.gameData?.curRound !== 1 && multiplayerGameState === 'getready'
    );
    const isTeam2v2EndScreen = !!(
        screen === "multiplayer" &&
        multiplayerState?.inGame &&
        multiplayerGameState === "end" &&
        multiplayerState?.gameData?.team2v2
    );
    const showPublicDuelEndScreen = !!(
        multiplayerState?.inGame &&
        multiplayerGameState === 'end' &&
        multiplayerState?.gameData?.public &&
        (multiplayerState?.gameData?.duelEnd || multiplayerState?.gameData?.team2v2)
    );

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



            {accountModalOpen && <AccountModal inCrazyGames={inCrazyGames} shown={true} session={session} setSession={setSession} setAccountModalOpen={setAccountModalOpen}
                eloData={eloData} accountModalPage={accountModalPage} setAccountModalPage={setAccountModalPage}
                ws={ws} canSendInvite={
                    multiplayerState?.inGame && !multiplayerState?.gameData?.public
                } sendInvite={sendInvite} options={options}
            />}
            {session?.token?.secret && !session.token.username && <SetUsernameModal shown={true} session={session} />}
            {/* The link-Google variant always wins over the periodic suggestion —
                the two must never stack (also enforced at open time). Both stay
                mounted after first open so closes animate (open-prop driven);
                react-responsive-modal renders nothing while closed. */}
            {suggestModalMountedRef.current && <SuggestAccountModal shown={showSuggestLoginModal && !linkGoogleModalOpen} setOpen={setShowSuggestLoginModal} showNeverAgain={suggestLoginShowNeverAgain} />}
            {linkGoogleModal && <SuggestAccountModal shown={linkGoogleModalOpen} setOpen={(v) => { if (!v) setLinkGoogleModalOpen(false); }} variant={linkGoogleModal} inCrazyGames={inCrazyGames} />}
            {showDiscordModal && typeof window !== 'undefined' && window.innerWidth >= 768 && <DiscordModal shown={true} setOpen={setShowDiscordModal} />}
            {mapGuessrModal && <MapGuessrModal isOpen={true} onClose={() => setMapGuessrModal(false)} />}
            {pendingNameChangeModal && <PendingNameChangeModal session={session} isOpen={true} onClose={() => setPendingNameChangeModal(false)} />}
            {!process.env.NEXT_PUBLIC_SCHOOLGUESSR && EmoteReactionsMemo}
            <ToastContainer pauseOnFocusLoss={false} />

            {welcomeOverlayShown && screen === "onboarding" && (
                <WelcomeOverlay
                    onModeSelected={(mode) => {
                        setOnboardingMode(mode);
                        try { gameStorage.setItem("onboarding_seen", "true"); } catch(e) {}
                        // Update the running onboarding with the chosen mode
                        setOnboarding((prev) => prev ? { ...prev, mode } : prev);
                        setShowCountryButtons(mode !== "classic");
                        setWelcomeOverlayShown(false);
                    }}
                    onSkip={() => {
                        try {
                            gameStorage.setItem("onboarding_seen", "true");
                            gameStorage.setItem("onboarding", "done");
                        } catch(e) {}
                        // GameUI mounts under this overlay at load+idle and starts
                        // the round-1 street view load (loading=true). Clearing
                        // latLong below unmounts the iframe, so its onLoad —
                        // the only thing that resets loading — never fires;
                        // without this, home is stuck behind the loading mask.
                        cancelInFlightLocationLoad();
                        setLoading(false);
                        setLatLong(null);
                        setShowAnswer(false);
                        setWelcomeOverlayShown(false);
                        setOnboarding(null);
                        setOnboardingCompleted(true);
                        setScreen("home");
                    }}
                />
            )}

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
                        screen === "home" || !!(screen === "multiplayer" && (isTeam2v2EndScreen || multiplayerState?.gameData?.state === "waiting" || multiplayerState?.lobbyIntent === 'join' || multiplayerState?.gameQueued))
                    )}
                    refreshKey={latLongKey}
                    onLoad={() => {
                        setTimeout(() => {
                            setLoading(false)
                            setMapSwitchMaskShown(false);
                            setMapSwitchSawLoading(false);
                        }, 300)

                    }}
                />

                {team2v2EndExitMaskShown && (
                    <div
                        className={`team-2v2-end-exit-mask ${team2v2EndExitMaskRevealing ? 'team-2v2-end-exit-mask--revealing' : ''}`}
                        aria-hidden="true"
                    />
                )}

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
                            lobbyIntent: 'join'
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
                    shown={!multiplayerState?.gameData?.duel || (multiplayerState?.gameData?.team2v2 && multiplayerState?.gameData?.state === 'end')}
                    gameOptionsModalShown={gameOptionsModalShown}
                    selectCountryModalShown={selectCountryModalShown}
                    partyModalShown={partyModalShown}
                    dailyPhase={dailyPhase}
                    mapModalOpen={mapModal}
                    onConnectionError={() => setConnectionErrorModalShown(true)}
                    countryGuessrMode={countryGuessrMode}
                />

                {/* Pending Name Change Banner */}
                {session?.token?.pendingNameChange && screen === 'home' && !dismissedNameChangeBanner && (
                    <div className="modBanner modBanner--warning">
                        <button
                            onClick={() => setDismissedNameChangeBanner(true)}
                            className="modBanner__close"
                            title="Dismiss"
                        >
                            ×
                        </button>
                        <div className="modBanner__content">
                            <span>⚠️</span>
                            <span className="modBanner__text">{text("usernameChangeRequired")}</span>
                            <button
                                onClick={() => setPendingNameChangeModal(true)}
                                className="modBanner__btn modBanner__btn--dark"
                            >
                                Change Name
                            </button>
                        </div>
                        {session?.token?.pendingNameChangePublicNote && (
                            <div className="modBanner__note">
                                {session.token.pendingNameChangePublicNote}
                            </div>
                        )}
                    </div>
                )}

                {/* Account Banned Banner */}
                {session?.token?.banned && !session?.token?.pendingNameChange && screen === 'home' && !dismissedBanBanner && (
                    <div className="modBanner modBanner--error">
                        <button
                            onClick={() => setDismissedBanBanner(true)}
                            className="modBanner__close"
                            title="Dismiss"
                        >
                            ×
                        </button>
                        <div className="modBanner__content">
                            <span>⛔</span>
                            <span className="modBanner__text">
                                {text("accountSuspended")}
                                {session?.token?.banType === 'temporary' && session?.token?.banExpiresAt && (
                                    <span className="modBanner__expires">
                                        (Expires: {new Date(session.token.banExpiresAt).toLocaleDateString()})
                                    </span>
                                )}
                            </span>
                        </div>
                        {session?.token?.banPublicNote && (
                            <div className="modBanner__note">
                                {session.token.banPublicNote}
                            </div>
                        )}
                        <button
                            className="modBanner__detailsBtn"
                            onClick={() => {
                                setAccountModalOpen(true);
                                setAccountModalPage("moderation");
                            }}
                        >
                            {text("viewDetails") || "View Details"}
                        </button>
                    </div>
                )}

                {/* Account Pending Deletion Banner — within the 30-day grace period.
                    Explicit Restore (we never auto-cancel on login). */}
                {session?.token?.pendingDeletion && screen === 'home' && !dismissedDeletionBanner && (
                    <div className="modBanner modBanner--error">
                        <button
                            onClick={() => setDismissedDeletionBanner(true)}
                            className="modBanner__close"
                            title="Dismiss"
                        >
                            ×
                        </button>
                        <div className="modBanner__content">
                            <span>🗑️</span>
                            <span className="modBanner__text">
                                {session?.token?.scheduledDeletionAt
                                    ? text("accountScheduledForDeletion", { date: new Date(session.token.scheduledDeletionAt).toLocaleDateString() })
                                    : text("accountScheduledForDeletionShort")}
                            </span>
                        </div>
                        <button
                            className="modBanner__detailsBtn"
                            onClick={async () => {
                                try {
                                    const res = await fetch(window.cConfig.apiUrl + '/api/cancelDeletion', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ secret: session?.token?.secret }),
                                    });
                                    if (res.ok) {
                                        setSession((prev) => prev ? { token: { ...prev.token, pendingDeletion: false, scheduledDeletionAt: null } } : prev);
                                        toast.success(text("accountRestoredBody"));
                                    } else {
                                        const data = await res.json().catch(() => ({}));
                                        toast.error(data.error || text("deletionAlreadyProcessed"));
                                    }
                                } catch (e) {
                                    toast.error(text("deleteAccountFailed"));
                                }
                            }}
                        >
                            {text("restoreAccount")}
                        </button>
                    </div>
                )}

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
                <div>
                    {screen === "home" && !mapModal && session && session?.token?.secret && (
                        <button className="gameBtn leagueBtn" onClick={() => { setAccountModalOpen(true); setAccountModalPage("elo"); }}
                            style={{ backgroundColor: eloData?.league?.color }}
                        >
                            {!eloData ? '...' : animatedEloDisplay} ELO {eloData?.league?.emoji}
                        </button>
                    )}
                </div>

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

                {screen == "home" &&
                    <div className={`home__content g2_modal ${screen !== "home" ? "hidden" : "cshown"} `}>
                        <div className={`g2_nav_ui ${navSlideOut ? 'g2_slide_out' : ''} ${onboardingCompleted !== true ? 'hide' : ''}`} >


                            {onboardingCompleted === null ? (
                                <>

                                </>
                            ) : (
                                <>


                                    {onboardingCompleted && (

                                        <>
                                            <h1 className={`home__title g2_nav_title wg_font ${navSlideOut ? 'g2_slide_out' : ''}`}>WorldGuessr</h1>

                                            {/* <MaintenanceBanner /> */}
                                        </>

                                    )}



                                    {onboardingCompleted && (

                                        <>

                                            <div className="g2_nav_hr"></div>
                                            <div className="g2_nav_group">
                                                <button className="g2_nav_text singleplayer"

                                                    onClick={() => {
                                                        if (loading) return;
                                                        setMiniMapShown(false);
                                                        navSlideOutThen(() => crazyMidgame(() => {
                                                            // First entry this session: check localStorage preference
                                                            if (!hasEnteredSingleplayer.current) {
                                                                hasEnteredSingleplayer.current = true;
                                                                const pref = gameStorage.getItem("singleplayerDefaultMode");
                                                                if (pref === "countryGuesser") {
                                                                    enterCountryGuessrMode("country");
                                                                    return;
                                                                } else if (pref === "continentGuesser") {
                                                                    enterCountryGuessrMode("continent");
                                                                    return;
                                                                }
                                                            }
                                                            // Subsequent entries: restore last screen used this session
                                                            setScreen(lastSingleplayerScreen.current || "singleplayer");
                                                        }));
                                                    }}>
                                                    {text("singleplayer")}
                                                </button>
                                                {/* Ranked shows for guests too — clicking opens the link-Google
                                                    conversion modal instead of the queue (server publicDuel
                                                    requires accountId anyway). Hidden on CoolMathGames. */}
                                                {!inCoolMathGames && (
                                                    <button className="g2_nav_text" aria-label="Duels" onClick={() => {
                                                        if (!session?.token?.secret) {
                                                            setShowSuggestLoginModal(false); // never stack the two login modals
                                                            setLinkGoogleModal('ranked');
                                                            setLinkGoogleModalOpen(true);
                                                            return;
                                                        }
                                                        if (!ws || !multiplayerState?.connected) {
                                                            setConnectionErrorModalShown(true);
                                                            return;
                                                        }
                                                        navSlideOutThen(() => handleMultiplayerAction("publicDuel"));
                                                    }}>{text("rankedDuel")}</button>
                                                )}
                                                <button className="g2_nav_text" aria-label="Duels" onClick={() => {
                                                    if (!ws || !multiplayerState?.connected) {
                                                        setConnectionErrorModalShown(true);
                                                        return;
                                                    }
                                                    navSlideOutThen(() => handleMultiplayerAction("unrankedDuel"));
                                                }}>{
                                                    session?.token?.secret ? text("unrankedDuel") : text("findDuel")}</button>

                                                {!inCoolMathGames && (
                                                    <button className="g2_nav_text" aria-label="2v2 Match" onClick={() => {
                                                        if (!session?.token?.secret) {
                                                            setShowSuggestLoginModal(false); // never stack the two login modals
                                                            setLinkGoogleModal('2v2');
                                                            setLinkGoogleModalOpen(true);
                                                            return;
                                                        }
                                                        if (!ws || !multiplayerState?.connected) {
                                                            setConnectionErrorModalShown(true);
                                                            return;
                                                        }
                                                        navSlideOutThen(() => handleMultiplayerAction("createLobby", "2v2"));
                                                    }}>
                                                        {text("twovtwo")}
                                                        <span className="g2_nav_new_sticker" aria-hidden="true">{text("newSticker")}</span>
                                                    </button>
                                                )}



                                            </div>
                                            <div className="g2_nav_hr"></div>

                                            <div className="g2_nav_group">
                                                <button className="g2_nav_text" disabled={maintenance} onClick={() => {
                                                    if (!ws || !multiplayerState?.connected) {
                                                        setConnectionErrorModalShown(true);
                                                        return;
                                                    }

                                                    navSlideOutThen(() => handleMultiplayerAction("createLobby", "party"));
                                                }}>{text("createGame")}</button>
                                                <button className="g2_nav_text" disabled={maintenance} onClick={() => {
                                                    if (!ws || !multiplayerState?.connected) {
                                                        setConnectionErrorModalShown(true);
                                                        return;
                                                    }
                                                    navSlideOutThen(() => handleMultiplayerAction("joinPrivateGame"));
                                                }}>{text("joinGame")}</button>
                                            </div>

                                            <div className="g2_nav_hr"></div>

                                            <div className="g2_nav_group">
                                                <DailyMenuItem session={session} onClick={() => enterDailyMode()} />

                                                {inCrazyGames && (
                                                    <button className="g2_nav_text" aria-label="MapGuessr" onClick={() => {
                                                        navSlideOutThen(() => setMapGuessrModal(true));
                                                    }}>MapGuessr</button>
                                                )}

                                            </div>
                                        </>
                                    )}

                                </>
                            )}
                            <br />

                        </div>

                        {/* Footer moved outside of sliding navigation */}
                        <div className={`home__footer ${(screen === "home" && onboardingCompleted === true && !mapModal && !merchModal && !friendsModal && !accountModalOpen && !mapGuessrModal) ? "visible" : ""}`}>
                            <div className="footer_btns">
                                {!isApp && !inCoolMathGames && !inGameDistribution && (
                                    <>
                                        {!process.env.NEXT_PUBLIC_SCHOOLGUESSR && (
                                            <Link target="_blank" href={"https://discord.gg/ADw47GAyS5"}><button className="g2_hover_effect home__squarebtn gameBtn g2_container discord" aria-label="Discord"><FaDiscord className="home__squarebtnicon" /></button></Link>
                                        )}

                                        <Link target="_blank" href={"https://www.youtube.com/@worldguessr?sub_confirmation=1"}><button className="g2_hover_effect home__squarebtn gameBtn g2_container youtube" aria-label="Youtube"><FaYoutube className="home__squarebtnicon" /></button></Link>
                                        {!inCrazyGames && !process.env.NEXT_PUBLIC_SCHOOLGUESSR && (
                                            <Link target="_blank" href={"https://www.coolmathgames.com/0-worldguessr"} onClick={() => sendEvent("coolmathgames_backlink_click")}><button className="g2_hover_effect home__squarebtn gameBtn g2_container_full" aria-label="CoolmathGames"><NextImage.default src={asset('/cmlogo.png')} draggable={false} fill alt="Coolmath Games Logo" className="home__squarebtnicon" /></button></Link>
                                        )}
                                        <Link href={"/leaderboard" + (inCrazyGames ? "?crazygames" : "")}>

                                            <button className="g2_hover_effect home__squarebtn gameBtn g2_container_full " aria-label="Leaderboard"><FaRankingStar className="home__squarebtnicon" /></button></Link>
                                    </>
                                )}
                                {!isApp && inGameDistribution && (
                                    <Link href={"/leaderboard"}>
                                        <button className="g2_hover_effect home__squarebtn gameBtn g2_container_full " aria-label="Leaderboard"><FaRankingStar className="home__squarebtnicon" /></button>
                                    </Link>
                                )}

                                <button className="g2_hover_effect home__squarebtn gameBtn g2_container_full " aria-label="Settings" onClick={() => setSettingsModal(true)}><FaGear className="home__squarebtnicon" /></button>
                            </div>
                        </div>

                    </div>
                }
                {(mapModal || gameOptionsModalShown) && <MapsModal shown={true} session={session} onClose={() => {
                    if (mapModalClosing) return;
                    setMapModalClosing(true);
                    setTimeout(() => {
                        setMapModal(false);
                        setGameOptionsModalShown(false);
                        setMapModalClosing(false);
                    }, MAP_MODAL_CLOSE_ANIMATION_MS);
                }}
                    mapModalClosing={mapModalClosing}
                    text={text}
                    customChooseMapCallback={(gameOptionsModalShown && (screen === "singleplayer" || screen === "countryGuesser")) ? (map) => {
                        if (mapModalClosing) return;
                        const selectedMapSlug = map.countryMap || map.slug;
                        const selectingCountryGuesser = map.slug === "__countryGuesser";
                        const selectingContinentGuesser = map.slug === "__continentGuesser";
                        const selectingRegularMap = !selectingCountryGuesser && !selectingContinentGuesser;
                        const isSameSelection =
                            (selectingCountryGuesser && screen === "countryGuesser" && countryGuessrMode?.subMode === "country") ||
                            (selectingContinentGuesser && screen === "countryGuesser" && countryGuessrMode?.subMode === "continent") ||
                            (selectingRegularMap && screen === "singleplayer" && selectedMapSlug === gameOptions.location);

                        const closeMapChooser = () => {
                            setTimeout(() => {
                                setMapModal(false);
                                setGameOptionsModalShown(false);
                                setMapModalClosing(false);
                            }, MAP_MODAL_CLOSE_ANIMATION_MS);
                        };

                        // No-op if user clicks the currently active map/mode.
                        if (isSameSelection) {
                            setMapSwitchMaskShown(false);
                            setMapSwitchSawLoading(false);
                            setMapModalClosing(true);
                            closeMapChooser();
                            return;
                        }

                        setMapModalClosing(true);
                        setMapSwitchMaskShown(true);
                        setMapSwitchSawLoading(false);

                        const applyMapSelection = () => {
                            if (map.slug === "__countryGuesser") {
                                try { gameStorage.setItem("singleplayerDefaultMode", "countryGuesser"); } catch(e) {}
                                enterCountryGuessrMode("country");
                            } else if (map.slug === "__continentGuesser") {
                                try { gameStorage.setItem("singleplayerDefaultMode", "continentGuesser"); } catch(e) {}
                                enterCountryGuessrMode("continent");
                            } else {
                                cancelInFlightLocationLoad();
                                setLoading(false);
                                setLatLong(null);
                                setShowAnswer(false);
                                setShowCountryButtons(false);
                                if (screen === "countryGuesser") setScreen("singleplayer");
                                try { gameStorage.setItem("singleplayerDefaultMode", "world"); } catch(e) {}
                                openMap(selectedMapSlug);
                            }
                        };

                        // Let the close class render first so fade-out starts immediately.
                        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
                            window.requestAnimationFrame(() => {
                                window.requestAnimationFrame(applyMapSelection);
                            });
                        } else {
                            setTimeout(applyMapSelection, 0);
                        }

                        closeMapChooser();
                    } : null}
                    showAllCountriesOption={(gameOptionsModalShown && (screen === "singleplayer" || screen === "countryGuesser"))}
                    showOptions={screen === "singleplayer"}
                    showTimerOption={screen === "singleplayer"}
                    gameOptions={gameOptions} setGameOptions={setGameOptions} />}

                {settingsModal && <SettingsModal inCrazyGames={inCrazyGames} inGameDistribution={inGameDistribution} options={options} setOptions={setOptions} multiplayerEmotesEnabled={multiplayerEmotesEnabled} setMultiplayerEmotesEnabled={(v) => { setMultiplayerEmotesEnabled(v); try { gameStorage.setItem('multiplayerEmotesEnabled', v ? 'true' : 'false'); } catch {} }} shown={true} onClose={() => setSettingsModal(false)} session={session} setSession={setSession} ws={ws} />}

                <Modal
                    isOpen={leaveConfirmOpen}
                    onClose={() => setLeaveConfirmOpen(false)}
                    title={text("areYouSure")}
                    actions={
                        <>
                            <button onClick={() => setLeaveConfirmOpen(false)}>{text("cancel")}</button>
                            <button onClick={() => {
                                setLeaveConfirmOpen(false);
                                backBtnPressed(leaveConfirm?.queueNextGame, leaveConfirm?.nextGameType, true);
                            }}>{leaveConfirm ? text(leaveConfirm.confirmKey) : ""}</button>
                        </>
                    }
                >
                    <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{leaveConfirm ? text(leaveConfirm.messageKey) : ""}</p>
                </Modal>

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




                {screen === "singleplayer" && <div className="home__singleplayer">
                    <GameUI
                        inCoolMathGames={inCoolMathGames}
                        inGameDistribution={inGameDistribution}
                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
singlePlayerRound={singlePlayerRound} setSinglePlayerRound={setSinglePlayerRound} showDiscordModal={showDiscordModal} setShowDiscordModal={setShowDiscordModal} inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult} options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} mapModal={mapModal} latLong={latLong} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
                </div>}

                {screen === "countryGuesser" && <div className="home__singleplayer">
                    <GameUI
                        inCoolMathGames={inCoolMathGames}
                        inGameDistribution={inGameDistribution}
                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
singlePlayerRound={singlePlayerRound} setSinglePlayerRound={setSinglePlayerRound} showDiscordModal={showDiscordModal} setShowDiscordModal={setShowDiscordModal} inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult} countryGuesserCorrect={countryGuesserCorrect} setCountryGuesserCorrect={setCountryGuesserCorrect} showCountryButtons={showCountryButtons} setShowCountryButtons={setShowCountryButtons} otherOptions={otherOptions} countryGuesser={true} countryGuessrMode={countryGuessrMode} options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} mapModal={mapModal} latLong={latLong} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
                </div>}

                {/* (!welcomeOverlayShown || svPreloadReady): while the welcome
                    overlay is up, GameUI's mount is what triggers the round-1
                    street view load — deferred to load+idle, see svPreloadReady */}
                {screen === "onboarding" && (onboarding?.round || onboarding?.completed) && (!welcomeOverlayShown || svPreloadReady) && <div className="home__onboarding">
                    <GameUI
                        inCoolMathGames={inCoolMathGames}
                        inGameDistribution={inGameDistribution}
                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
                        welcomeOverlayShown={welcomeOverlayShown}
                        inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult} countryGuesserCorrect={countryGuesserCorrect} setCountryGuesserCorrect={setCountryGuesserCorrect} showCountryButtons={showCountryButtons} setShowCountryButtons={setShowCountryButtons} otherOptions={otherOptions} onboarding={onboarding} countryGuesser={onboarding?.mode && onboarding.mode !== "classic"} setOnboarding={setOnboarding} backBtnPressed={backBtnPressed} options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} latLong={latLong} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
                </div>}

                {screen === "onboarding" && onboarding?.completed &&
                    <RoundOverScreen
                        points={onboarding.points}
                        time={msToTime(onboarding.timeTaken)}
                        maxPoints={onboarding.mode === "classic" ? 15000 : 3000}
                        history={onboarding.locations || []}
                        options={options}
                    />
                }

                {screen === "onboarding" && onboarding?.completed &&
                    <OnboardingComplete
                        mode={onboarding.mode}
                        points={onboarding.points}
                        maxPoints={onboarding.mode === "classic" ? 15000 : 3000}
                        onClassic={() => {
                            sendEvent("tutorial_end", { mode: "classic" });
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            setMiniMapShown(false);
                            setLatLong(null);
                            setScreen("singleplayer");
                        }}
                        onDuel={() => {
                            sendEvent("tutorial_end", { mode: "duel" });
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            handleMultiplayerAction("unrankedDuel");
                        }}
                        onCommunityMaps={() => {
                            sendEvent("tutorial_end", { mode: "community" });
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            setScreen("home");
                            setTimeout(() => setMapModal(true), 350);
                        }}
                        onCountryGuesser={() => {
                            sendEvent("tutorial_end", { mode: "country" });
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            try { gameStorage.setItem("singleplayerDefaultMode", "countryGuesser"); } catch(e) {}
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            enterCountryGuessrMode("country");
                        }}
                        onHome={() => {
                            sendEvent("tutorial_end", { mode: "home" });
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            setLatLong(null);
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            setScreen("home");
                        }}
                    />
                }

                {screen === "multiplayer" && <div className="home__multiplayer">
                    <MultiplayerHome
                        partyModalShown={partyModalShown}
                        setPartyModalShown={setPartyModalShown}
                        multiplayerError={multiplayerError}
                        handleAction={handleMultiplayerAction}
                        session={session}
                        ws={ws}
                        setWs={setWs}
                        multiplayerState={multiplayerState}
                        setMultiplayerState={setMultiplayerState}
                        selectCountryModalShown={selectCountryModalShown}
                        setSelectCountryModalShown={setSelectCountryModalShown}
                        inCrazyGames={inCrazyGames}
                        openFriends={() => { setAccountModalPage('list'); setAccountModalOpen(true); }}
                    />
                </div>}

                {multiplayerState.inGame && ["guess", "getready", "end"].includes(multiplayerState.gameData?.state) && (
                    <GameUI
                        inCoolMathGames={inCoolMathGames}
                        inGameDistribution={inGameDistribution}
                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
                        inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult} options={options} timeOffset={timeOffset} ws={ws} backBtnPressed={backBtnPressed} multiplayerState={multiplayerState} pinPoint={pinPoint} setPinPoint={setPinPoint} loading={loading} setLoading={setLoading} session={session} latLong={latLong} loadLocation={() => { }} gameOptions={{
                            location: "all", maxDist: 20000, extent: gameOptions?.extent ?? multiplayerState?.gameData?.extent,
                            nm: multiplayerState?.gameData?.nm,
                            npz: multiplayerState?.gameData?.npz,
                            showRoadName: multiplayerState?.gameData?.showRoadName
                        }} setGameOptions={() => { }} showAnswer={multiplayerShowAnswer} setShowAnswer={guessMultiplayer} />
                )}

                {/* End screen for PUBLIC matchmade duels (ranked 1v1 + 2v2) —
                    private games (party team duels set duelEnd too) are owned
                    by GameUI's mounts; without the public gate both screens
                    stack and every button shows twice. Keep this after GameUI:
                    the final answer map also uses z-index 1000, so later DOM
                    order lets the summary's fade-in remain visible. */}
                {showPublicDuelEndScreen && (
                    <RoundOverScreen
                        duel={true}
                        data={multiplayerState?.gameData?.duelEnd ?? deriveTeamEndFallback(multiplayerState?.gameData)}
                        multiplayerState={multiplayerState}
                        session={session}
                        gameId={multiplayerState?.gameData?.code}
                        button1Text={text("playAgain")}
                        options={options}
                        button1Press={() => {
                            backBtnPressed(true, "ranked")
                        }}
                        // team2v2 drops the in-card Home button: Play Again +
                        // Back cover the card, and the navbar back button (shown
                        // for team2v2 end screens, see Navbar shown= below) is
                        // the straight-to-home exit for everyone — including
                        // chosen-duo guests, who get no in-card Back.
                        button2Text={multiplayerState?.gameData?.team2v2 ? null : text("home")}
                        button2Press={() => {
                            backBtnPressed()
                        }}
                        teamActions={multiplayerState?.gameData?.team2v2 ? {
                            playAgain: ({ willExit } = {}) => {
                                const sendPlayAgain = () => { try { ws.send(JSON.stringify({ type: 'playAgain2v2' })); } catch (e) {} };
                                if (willExit) beginTeam2v2EndExit(sendPlayAgain);
                                else sendPlayAgain();
                            },
                            back: () => { beginTeam2v2EndExit(() => { try { ws.send(JSON.stringify({ type: 'teamDuelBack' })); } catch (e) {} }); }
                        } : null}
                    />
                )}



                <Script id="clarity">
                    {`

document.addEventListener(
  'wheel',
  function touchHandler(e) {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  },
  { passive: false }
);
            window.gameOpen = Date.now();

            setTimeout(() => {
                if (window.PokiSDK) {
                    window.PokiSDK.init().then(() => {
                        window.poki = true;
                        window.PokiSDK.gameLoadingFinished();
                    }).catch(() => {
                        // Poki init failed — load the game anyway.
                    });
                }
            }, 1000);


  	window.aiptag = window.aiptag || {cmd: []};
	aiptag.cmd.display = aiptag.cmd.display || [];

	//CMP tool settings
	aiptag.cmp = {
		show: true,
		position: "centered",  //centered, bottom
		button: true,
		buttonText: "Privacy settings",
		buttonPosition: "bottom-left" //bottom-left, bottom-right, bottom-center, top-left, top-right
	}
   window.adsbygoogle = window.adsbygoogle || [];
  window.adBreak = adConfig = function(o) {adsbygoogle.push(o);}
   adConfig({preloadAdBreaks: 'on'});

  `}
                </Script>

                <WhatsNewModal changelog={changelog} text={text} />
            </main>
        </>
    )
}
