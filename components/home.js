import HeadContent from "@/components/headContent";
import { FaDiscord, FaBook } from "react-icons/fa";
import { FaGear, FaRankingStar, FaYoutube } from "react-icons/fa6";
import { signOut, useSession } from "@/components/auth/auth";
import { fetchWithFallback } from "@/components/utils/retryFetch";
import 'react-responsive-modal/styles.css';
import { useEffect, useState, useRef, useCallback } from "react";
import Navbar from "@/components/ui/navbar";
import GameUI from "@/components/gameUI";
import BannerText from "@/components/bannerText";
import shuffle from "@/utils/shuffle";
// findLatLongRandom is dynamically imported when needed to avoid loading Google Maps API on page load
import Link from "next/link";
import MultiplayerHome from "@/components/multiplayerHome";
import AccountModal from "@/components/accountModal";
import SetUsernameModal from "@/components/setUsernameModal";
import ChatBox from "@/components/chatBox";
import React from "react";
import countryMaxDists from '../public/countryMaxDists.json';
import { useTranslation } from '@/components/useTranslations'
import useWindowDimensions from "@/components/useWindowDimensions";
import Script from "next/script";
import SettingsModal from "@/components/settingsModal";
import sendEvent from "@/components/utils/sendEvent";
import initWebsocket from "@/components/utils/initWebsocket";
import 'react-toastify/dist/ReactToastify.css';
import dynamic from "next/dynamic";
import NextImage from "next/image";
import OnboardingText from "@/components/onboardingText";
import WelcomeOverlay from "@/components/welcomeOverlay";
import OnboardingComplete from "@/components/onboardingComplete";
import { ALL_CONTINENTS } from "@/components/utils/continentFromCode";
import { useRouter } from 'next/router';
import { asset, navigate, stripBase } from '@/lib/basePath';
import { preloadPinImages } from '@/lib/markerIcons';
const RoundOverScreen = dynamic(() => import('@/components/roundOverScreen'), { ssr: false });
const DailyChallengeScreen = dynamic(() => import('@/components/daily/DailyChallengeScreen'), { ssr: false });
import DailyMenuItem from '@/components/daily/DailyMenuItem';
import DailyCommunityMapsButton from '@/components/daily/DailyCommunityMapsButton';
import msToTime from "@/components/msToTime";
import SuggestAccountModal from "@/components/suggestAccountModal";
import { toast, ToastContainer } from "react-toastify";
import { inIframe, isForbiddenIframe } from "@/components/utils/inIframe";
import MapsModal from "@/components/maps/mapsModal";

import countries from "@/public/countries.json";
import officialCountryMaps from "@/public/officialCountryMaps.json";

import gameStorage from "@/components/utils/localStorage";
import DiscordModal from "@/components/discordModal";
import AlertModal from "@/components/ui/AlertModal";
import WhatsNewModal from "@/components/ui/WhatsNewModal";
const MapGuessrModal = dynamic(() => import("@/components/mapGuessrModal"), { ssr: false });
import changelog from "@/components/changelog.json";
import clientConfig from "@/clientConfig";
import { useGoogleLogin } from "@react-oauth/google";
// import haversineDistance from "./utils/haversineDistance";
import StreetView from "./streetview/streetView";
import Stats from "stats.js";
// import SvEmbedIframe from "./streetview/svHandler"; // REMOVED: Using direct StreetView instead of double-iframe setup
// import getTimeString, { getMaintenanceDate } from "./maintenanceTime";
// import MaintenanceBanner from "./MaintenanceBanner";
import Ad from "./bannerAdNitro";
import GameDistributionBanner from "./bannerAdGameDistribution";
import PendingNameChangeModal from "./pendingNameChangeModal";


const initialMultiplayerState = {
    connected: false,
    connecting: false,
    verified: false,
    shouldConnect: false,
    gameQueued: false,
    inGame: false,
    nextGameQueued: false,
    enteringGameCode: false,
    nextGameType: null,
    maxRetries: 50,
    currentRetry: 0,
    createOptions: {
        rounds: 5,
        timePerRound: 30,
        location: "all",
        displayLocation: "All countries",
        progress: false
    },
    joinOptions: {
        gameCode: null,
        progress: false,
        error: false
    }
}

export default function Home({ initialScreen, dailyBootstrap } = {}) {

    const { width, height } = useWindowDimensions();
    const router = useRouter();
    const langInitRef = useRef(true);
    const statsRef = useRef();

    const [session, setSession] = useState(false);
    const { data: mainSession } = useSession();
    const [accountModalOpen, setAccountModalOpen] = useState(false);
    const [screen, setScreen] = useState(initialScreen === "daily" ? "daily" : "home");
    const [loading, setLoading] = useState(false);
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

    useEffect(() => {
        let hideInt = setInterval(() => {
            if (document.getElementById("cmpPersistentLink")) {
                document.getElementById("cmpPersistentLink").style.display = "none";
                clearInterval(hideInt);
            }
        }, 2000);

        return () => clearInterval(hideInt);
    }, [])

    useEffect(() => {
        const { ramUsage } = options;
        if (ramUsage) {
            if (!statsRef.current) {
                var stats = new Stats();
                stats.showPanel(2); // 0: fps, 1: ms, 2: mb, 3+: custom

                // move a bit lower
                stats.dom.style.transform = "translate(10px, 150px)";
                stats.dom.style.pointerEvents = "none";

                document.body.appendChild(stats.dom);
                statsRef.current = stats;

            } else {
                statsRef.current.dom.style.display = "";
            }
        } else {
            if (statsRef.current) {
                statsRef.current.dom.style.display = "none";
            }
        }

        let id = null;

        function animate() {
            statsRef.current.begin();
            // monitored code goes here
            statsRef.current.end();

            id = requestAnimationFrame(animate);
        }
        if (statsRef.current)
            animate();

        return () => {

            cancelAnimationFrame(id);
        }


    }, [options?.ramUsage])

    let login = null;
    if (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        login = useGoogleLogin({
            onSuccess: tokenResponse => {
                console.log("[Auth] Starting Google OAuth with retry mechanism");

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
                    console.log("[Auth] Google OAuth successful");

                    if (data.secret) {
                        setSession({ token: data })
                        window.localStorage.setItem("wg_secret", data.secret)
                        console.log(`[Auth] Login successful for user:`, data.username);
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
                console.log("login error", error);
            },
            onNonOAuthError: error => {
                setLoginQueued(false);
                console.log("login non oauth error", error);
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


    useEffect(() => {
        if (screen) {
            console.log("screen", screen)
        }
    }, [screen])

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
        }, 10);

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
            console.log("crazygames auth listener")
            const user = await window.CrazyGames.SDK.user.getUser();
            if (user) {
                console.log("crazygames user", user)
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
                        const crazyAuthDuration = (performance.now() - crazyAuthStart).toFixed(0);
                        console.log(`[CrazyAuth] completed (took ${crazyAuthDuration}ms)`, token, user, data)
                        if (data.secret && data.username) {
                            // Store full auth data including extended fields (elo, rank, etc.)
                            setSession({ token: data })
                            // verify the ws
                            window.verifyPayload = JSON.stringify({ type: "verify", secret: data.secret, username: data.username, platform: getPlatform() });

                            setWs((prev) => {

                                if (prev) {
                                    console.log("sending verify")

                                    prev.send(window.verifyPayload)
                                }
                                return prev;
                            });
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
                console.log("crazygames user not logged in")
                // user not logged in
                // verify with not_logged_in
                let rc = gameStorage.getItem("rejoinCode");

                window.verifyPayload = JSON.stringify({
                    type: "verify", secret: "not_logged_in", username: "not_logged_in",
                    rejoinCode: rc, platform: getPlatform()
                });
                setWs((prev) => {
                    if (prev) {
                        prev.send(window.verifyPayload)
                    } else {
                        console.log("no ws, waiting for connection")
                    }
                    return prev;
                });
            }
        }

        function finish() {
            const onboardingCompletedd = gameStorage.getItem("onboarding");
            console.log("onboarding", onboardingCompletedd)
            if (onboardingCompletedd !== "done") startOnboarding();
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
                    console.log("init crazygames sdk", window.CrazyGames)

                    window.CrazyGames.SDK.init().then(async () => {
                        console.log("sdk initialized")
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

    function gPlatform() {
        try {
        if(process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true") {
            return "gamedistribution";
        } else if (process.env.NEXT_PUBLIC_COOLMATH === "true") {
            return "coolmath";
        } else if (window.CrazyGames) {
            return "crazygames";
        } else if ( // check if domain is worldguessr.com
            typeof window !== "undefined" &&
            window.location.hostname === "worldguessr.com"
            || window.location.hostname === "www.worldguessr.com"
        ) {
            return "worldguessr";
        } else {
            if(inIframe()) {
                // return domain
                try {
                    const ancestorOrigin = window?.location?.ancestorOrigins[0] ?? document.referrer;
                    const url = new URL(ancestorOrigin);
                    return url.hostname.slice(0, 20);
                } catch (e) {
                    return "unknown_iframe";
                }
            } else {
                if(typeof window !== "undefined" && window.location && window.location.hostname) {
                    return window.location.hostname.slice(0, 20);
                } else return "unknown";
            }

        }
    } catch (e) {
            return "error";
    }

    }

    function getPlatform() {
        const platform = gPlatform();
        console.log("detected platform:", platform);
        return platform;
    }    // Close suggest login modal when user successfully logs in
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
    useEffect(() => {
        if (screen !== "home") return;
        if (session?.token?.secret) return;
        if (inCrazyGames || inCoolMathGames || inGameDistribution) return;
        if (typeof window === 'undefined') return;
        // Skip re-running while the modal is currently open — otherwise opening it
        // would immediately trigger another evaluation and double-increment the count.
        if (showSuggestLoginModal) return;

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
    }, [screen, session?.token?.secret, inCrazyGames, inCoolMathGames, inGameDistribution, showSuggestLoginModal]);

    // check if ?coolmath=true
    useEffect(() => {
        if (process.env.NEXT_PUBLIC_COOLMATH === "true") {
            setInCoolMathGames(true);
            window.lastCoolmathAd = Date.now();

            // Fade out and remove the static HTML splash from _document.js
            const splash = document.getElementById('cmg-splash');
            if (splash) {
                // Ensure splash was visible for at least 1.1s total
                const elapsed = Date.now() - (window.__cmgSplashStart || 0);
                const remaining = Math.max(0, 1100 - elapsed);

                const fadeOutTimer = setTimeout(() => {
                    splash.style.transition = 'opacity 0.4s ease';
                    splash.style.opacity = '0';
                }, remaining);
                const removeTimer = setTimeout(() => {
                    splash.remove();
                }, remaining + 500);

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
            window.onGDPauseGame = () => {
                console.log("GD: game paused for ad");
            };
            window.onGDResumeGame = () => {
                console.log("GD: game resumed after ad");
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
            console.log("GD: setting up preroll on first interaction");
            const handleFirstInteraction = () => {
                try {
                    console.log("GD: first interaction detected, showing preroll interstitial");
                    if (typeof gdsdk !== 'undefined' && typeof gdsdk.showAd !== 'undefined') {
                        console.log("GD: gdsdk available, calling showAd('interstitial')");
                        gdsdk.showAd('interstitial');
                    } else {
                        console.log("GD: gdsdk not available, skipping preroll");
                    }
                } catch (e) {
                    console.log("GD preroll error:", e);
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
                        console.log("[Auth] GD redirect login successful:", data.username);
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

        if (inCrazyGames) {
            // make sure its not an invite link
            const code = window.CrazyGames.SDK.game.getInviteParam("code")
            if (code && code.length === 6) {
                return;
            }

            // make sure tis not already completed
            const onboarding = gameStorage.getItem("onboarding");
            if (onboarding === "done") {
                return;
            }
        }

        setScreen("onboarding")

        // 3 universally recognizable locations for the tutorial
        const onboardingLocations = [
            { lat: 29.9773337, long: 31.1321796, country: "EG", otherOptions: ["TR", "BR", "IN"] },
            { lat: 40.7578892, long: -73.9856608, country: "US", otherOptions: ["GB", "JP", "AU"] },
            { lat: 48.8583601, long: 2.2915727, country: "FR", otherOptions: ["IT", "ES", "DE"] },
        ]

        setOnboarding({
            round: 1,
            locations: onboardingLocations,
            startTime: Date.now(),
            mode: mode,
        })
        sendEvent("tutorial_begin", { mode })
        setShowCountryButtons(mode !== "classic")
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
    useEffect(() => {
        try {
            const onboarding = gameStorage.getItem("onboarding");
            // check url
            const cg = window.location.search.includes("crazygames");
            const specifiedMapSlug = window.location.search.includes("map=");
            console.log("onboarding", onboarding, specifiedMapSlug)
            // make it false just for testing
            // gameStorage.setItem("onboarding", null)
            if (onboarding && onboarding === "done") {
                setOnboardingCompleted(true)


            }
            else if (specifiedMapSlug && !cg) setOnboardingCompleted(true)
            else setOnboardingCompleted(false)
        } catch (e) {
            console.error(e, "onboard");
            setOnboardingCompleted(true);
        }
        // setOnboardingCompleted(false)
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

                // Start onboarding immediately so street view preloads, then show modal on top
                if (!inCrazyGames) {
                    startOnboarding("classic");
                    setWelcomeOverlayShown(true);
                    return;
                }

                // const isPPC = window.location.search.includes("cpc=true");
                if (inIframe() && window.adBreak && !inCrazyGames) {
                    console.log("trying to show preroll")
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
                            console.log("preroll timeout")
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

            if (process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true") return;

            const currentPath = stripBase(window.location.pathname);

            // Special-case /daily (and /[lang]/daily): stay on daily, just swap
            // the locale segment. Without this, the redirect below would yank
            // the user off the daily challenge and onto /{lang}.
            const dailyRegex = /^\/(?:(es|fr|de|ru|en)\/)?daily$/;
            if (dailyRegex.test(currentPath)) {
                const desiredDaily = options.language === 'en' ? '/daily' : `/${options.language}/daily`;
                if (currentPath !== desiredDaily) {
                    langInitRef.current = false;
                    router.replace(desiredDaily);
                } else {
                    langInitRef.current = false;
                }
                return;
            }

            const target = `/${options.language}`;
            // Don't redirect to /en from root — English is the default
            const isDefaultOnRoot = options.language === "en" && (currentPath === "/" || currentPath === "");
            if (!isDefaultOnRoot && currentPath !== target) {
                const currentQueryParams = new URLSearchParams(window.location.search);
                const qPsuffix = currentQueryParams.toString() ? `?${currentQueryParams.toString()}` : "";
                if (langInitRef.current) {
                    // Initial load — update URL without history entry or page reload
                    langInitRef.current = false;
                    router.replace(target + qPsuffix);
                } else {
                    router.push(target + qPsuffix);
                }
            } else {
                langInitRef.current = false;
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
                    ramUsage: false,
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

    // multiplayer stuff
    const [ws, setWs] = useState(null);
    const [multiplayerState, setMultiplayerState] = useState(
        initialMultiplayerState
    );
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

    function handleMultiplayerAction(action, ...args) {
        console.log(action)

        if (!ws || !multiplayerState.connected) {
            setConnectionErrorModalShown(true);

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
                setMultiplayerState((prev) => {
                    return {
                        ...initialMultiplayerState,
                        connected: true,
                        enteringGameCode: true,
                        playerCount: prev.playerCount,
                        guestName: prev.guestName
                    }

                })
            }
        }

        if (action === "createPrivateGame") {

            // const maxDist = args[0].location === "all" ? 20000 : countryMaxDists[args[0].location];
            // setMultiplayerState((prev) => ({
            //   ...prev,
            //   createOptions: {
            //     ...prev.createOptions,
            //     progress: 0
            //   }
            // }));
            // (async () => {
            // const locations = [];
            // for (let i = 0; i < args[0].rounds; i++) {

            //   const loc = await findLatLongRandom({ location: multiplayerState.createOptions.location });
            //   locations.push(loc)
            //   setMultiplayerState((prev) => ({
            //     ...prev,
            //     createOptions: {
            //       ...prev.createOptions,
            //       progress: i + 1
            //     }
            //   }))
            // }

            setMultiplayerState((prev) => ({
                ...prev,
                createOptions: {
                    ...prev.createOptions,
                    progress: true
                }
            }));

            // send ws
            // ws.send(JSON.stringify({ type: "createPrivateGame", rounds: args[0].rounds, timePerRound: args[0].timePerRound, locations, maxDist }))
            ws.send(JSON.stringify({
                type: "createPrivateGame"

            }));
            setPartyModalShown(true)
            sendEvent("multiplayer_create_private_game")
            // })()
        }

        if (action === "setPrivateGameOptions" && multiplayerState?.inGame && multiplayerState?.gameData?.host && multiplayerState?.gameData?.state === "waiting") {

            if (inCrazyGames) {
                const link = window.CrazyGames.SDK.game.showInviteButton({ code: multiplayerState?.gameData?.code })
                console.log("crazygames invite link", link)
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

        if (action === 'screen') {
            ws.send(JSON.stringify({ type: "screen", screen: args[0] }))
        }


    }

    useEffect(() => {
        (async () => {


            if (!ws && !multiplayerState.connecting && !multiplayerState.connected && !window?.dontReconnect) {
                try {
                    setMultiplayerState((prev) => ({
                        ...prev,
                        connecting: true,
                        shouldConnect: false,
                        currentRetry: 1
                    }))

                    // Custom retry wrapper to track attempts
                    let ws = null;
                    let currentAttempt = 1;
                    const maxAttempts = 50;

                    while (currentAttempt <= maxAttempts && !ws) {
                        try {
                            setMultiplayerState((prev) => ({
                                ...prev,
                                currentRetry: currentAttempt
                            }))

                            ws = await initWebsocket(clientConfig().websocketUrl, null, 5000, 0) // 0 retries, we handle it ourselves
                            break;
                        } catch (error) {
                            console.log(`Connection attempt ${currentAttempt}/${maxAttempts} failed`);
                            if (currentAttempt < maxAttempts) {
                                currentAttempt++;
                                await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
                            } else {
                                throw error;
                            }
                        }
                    }

                    if (ws && ws.readyState === 1) {
                        setWs(ws)
                        setMultiplayerState((prev) => ({
                            ...prev,
                            connected: true,
                            connecting: false,
                            currentRetry: 0,
                            error: false
                        }))

                        console.log("connected to ws", window.verifyPayload)
                        if (!inCrazyGames && !window.location.search.includes("crazygames")) {

                            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                            let secret = "not_logged_in";
                            try {
                                const s = window.localStorage.getItem("wg_secret");
                                if (s) {
                                    secret = s;
                                }
                            } catch (e) {
                            }
                            if (session?.token?.secret) {
                                secret = session.token.secret;
                            }

                            if (secret !== "not_logged_in") {
                                window.verified = true;
                            }
                            const hasPartyLink = new URLSearchParams(window.location.search).has("party");
                            ws.send(JSON.stringify({ type: "verify", secret, tz, rejoinCode: gameStorage.getItem("rejoinCode"), skipRejoin: hasPartyLink || undefined, platform: getPlatform() }))
                        } else if (window.verifyPayload) {
                            console.log("sending verify from verifyPayload")
                            ws.send(window.verifyPayload)
                        }
                    } else {
                        // Connection failed - set disconnected state to show red wsIcon
                        console.error("WebSocket connection failed after all retries");
                        setMultiplayerState((prev) => ({
                            ...prev,
                            connected: false,
                            connecting: false,
                            error: true
                        }))
                    }
                } catch (error) {
                    // All retries exhausted - set disconnected state to show red wsIcon
                    console.error("WebSocket connection failed:", error);
                    setMultiplayerState((prev) => ({
                        ...prev,
                        connected: false,
                        connecting: false,
                        error: true
                    }))
                }
            }
        })();
    }, [multiplayerState, ws, screen])


    useEffect(() => {
        if (inCrazyGames || window.poki) {
            // Determine if actual gameplay is happening
            const isInGameplay = ((screen === "singleplayer" || screen === "countryGuesser") && singlePlayerRound && !singlePlayerRound.done) ||
                (screen === "onboarding" && onboarding && !onboarding.completed) ||
                (multiplayerState?.inGame && multiplayerState?.gameData?.state === "guess");

            if (isInGameplay) {
                console.log("gameplay start - actual gameplay detected")
                try {
                    window.CrazyGames.SDK.game.gameplayStart();
                } catch (e) { }
                try {
                    if (window.poki) window.PokiSDK.gameplayStart();
                } catch (e) { }
            } else {
                console.log("gameplay stop - not in actual gameplay")
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
                    console.log("crazygames");
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
                        handleMultiplayerAction("createPrivateGame")
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
            setMultiplayerState((prev) => ({
                ...prev,
                gameData: {
                    ...prev.gameData,
                    finalPlayers: prev.gameData.players
                }
            }))
        }

        if (multiplayerState?.gameData?.state === "waiting") {
            // remove gameData.finalPlayers
            setMultiplayerState((prev) => ({ ...prev, gameData: { ...prev.gameData, finalPlayers: undefined } }));
        }
    }, [multiplayerState?.gameData?.state])


    useEffect(() => {
        if (!multiplayerState?.inGame && multiplayerState?.gameData?.duel) {

            setMultiplayerChatEnabled(false)
            setMultiplayerChatOpen(false)
        }
        if (!ws) return;



        ws.onmessage = (msg) => {
            const data = JSON.parse(msg.data);

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

            if (data.type === "cnt") {
                setMultiplayerState((prev) => ({
                    ...prev,
                    playerCount: data.c
                }))
            } else if (data.type === "verify") {
                setMultiplayerState((prev) => ({
                    ...prev,
                    connected: true,
                    connecting: false,
                    verified: true,
                    guestName: data.guestName
                }))

                if (data.rejoinCode) {
                    gameStorage.setItem("rejoinCode", data.rejoinCode)
                }

            } else if (data.type === "error") {
                setMultiplayerState((prev) => ({
                    ...prev,
                    connecting: false,
                    connected: false,
                    shouldConnect: false,
                    error: data.message
                }))
                // disconnect
                if (data.message === "uac") {
                    window.dontReconnect = true;
                }
                if (data.failedToLogin) {
                    window.dontReconnect = true;
                    // logout
                    signOut()

                }
                ws.close();

                toast(data.message === 'uac' ? text('userAlreadyConnected') : data.message, { type: 'error' });

            } else if (data.type === "game") {
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
                setMultiplayerState((prev) => {

                    if (!data.duel) {
                        setMultiplayerChatEnabled(true)
                    }

                    // console.log('got game options', data)
                    setGameOptions((prev) => ({
                        ...prev,
                        nm: data.nm,
                        npz: data.npz,
                        showRoadName: data.showRoadName
                    }))



                    if (data.state === "getready") {
                        setMultiplayerChatEnabled(true)

                        // calculate extent on client
                        // if(data.map !== "all" && !countries.map((c) => c?.toLowerCase()).includes(data.map?.toLowerCase())  && !gameOptions?.extent) {
                        //   // calculate extent

                        //   fetch(`/mapLocations/${data.map}`).then((res) => res.json()).then((data) => {
                        //     if(data.ready) {

                        //       const mappedLatLongs = data.locations.map((l) => fromLonLat([l.lng, l.lat], "EPSG:4326"));
                        //       let extent = boundingExtent(mappedLatLongs);
                        //       console.log("extent", extent)

                        //       setGameOptions((prev) => ({
                        //         ...prev,
                        //         extent
                        //       }))

                        //     }
                        //   })
                        // }

                    } else if (data.state === "guess") {
                        const didIguess = (data.players ?? prev.gameData?.players)?.find((p) => p.id === prev.gameData?.myId)?.final;
                        if (didIguess) {
                            setMultiplayerChatEnabled(true)
                        } else {
                            // if(multiplayerState?.gameData?.public) setMultiplayerChatEnabled(false)
                        }
                    }

                    if ((!prev.gameData || (prev?.gameData?.state === "getready")) && data.state === "guess") {
                        setPinPoint(null)
                        // Set loading state when new round starts to show loading animation
                        setLoading(true)
                        // Increment key to force refresh even if coords are the same
                        setLatLongKey(k => k + 1)
                        if (!prev?.gameData?.locations && data.locations) {
                            setLatLong(data.locations[data.curRound - 1])


                        } else {
                            setLatLong(prev?.gameData?.locations[data.curRound - 1])
                        }
                    }

                    // Rejoin — restore latLong and pinPoint from game state
                    if (!prev.gameData && data.state === "getready" && data.locations && data.curRound > 1) {
                        setLatLong(data.locations[data.curRound - 2])
                    }
                    if (!prev.gameData && data.players) {
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
                        inGame: true,
                        gameData: {
                            ...prev.gameData,
                            ...data,
                            type: undefined
                        },
                        enteringGameCode: false,
                        joinOptions: initialMultiplayerState.joinOptions,
                    }
                })


            } else if (data.type === "duelEnd") {
                console.log("duel end", data)
                // { draw: boolean, newElo: number, oldElo: number, winner: boolean, timeElapsed: number }

                setMultiplayerState((prev) => ({
                    ...prev,
                    gameData: {
                        ...prev.gameData,
                        duelEnd: data
                    }
                }));
            } else if (data.type === "publicDuelRange") {
                setMultiplayerState((prev) => ({
                    ...prev,
                    publicDuelRange: data.range
                }))
            } else if (data.type === "maxDist") {
                const maxDist = data.maxDist;
                console.log("got new max dist", maxDist)
                setMultiplayerState((prev) => ({
                    ...prev,
                    gameData: {
                        ...prev.gameData,
                        maxDist
                    }
                }))

            } else if (data.type === "player") {
                if (data.action === "remove") {
                    setMultiplayerState((prev) => ({
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            players: prev.gameData.players.filter((p) => p.id !== data.id)
                        }
                    }))
                } else if (data.action === "add") {
                    setMultiplayerState((prev) => ({
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            players: [...prev.gameData.players, data.player]
                        }
                    }))
                }
            } else if (data.type === "place") {
                const id = data.id;
                if (id === multiplayerState.gameData.myId) {
                    setMultiplayerChatEnabled(true)
                }

                const player = multiplayerState.gameData.players.find((p) => p.id === id);
                if (player) {
                    player.final = data.final;
                    player.latLong = data.latLong;
                }
            } else if (data.type === "gameOver") {
                setLatLong(null)
                setGameOptions((prev) => ({
                    ...prev,
                    extent: null
                }))

            } else if (data.type === "gameShutdown") {
                setScreen("home")
                setMultiplayerChatEnabled(false)

                setMultiplayerState((prev) => {
                    return {
                        ...initialMultiplayerState,
                        connected: true,
                        nextGameQueued: prev.nextGameQueued,
                        nextGameType: prev.nextGameType,
                        playerCount: prev.playerCount,
                        guestName: prev.guestName
                    }
                });
                setGameOptions((prev) => ({
                    ...prev,
                    extent: null
                }))
            } else if (data.type === "gameCancelled") {
                // Game was cancelled before it started (opponent left during countdown)
                // No ELO was lost - just return to home and optionally re-queue
                toast.info(text("opponentLeftBeforeStart") || "Opponent left before the game started. Returning to queue...");

                setScreen("home")
                setMultiplayerChatEnabled(false)

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
                if (multiplayerState.enteringGameCode) {
                    setMultiplayerState((prev) => ({
                        ...prev,
                        joinOptions: {
                            ...prev.joinOptions,
                            error: data.error,
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
        }

        // ws on disconnect
        ws.onclose = () => {
            setWs(null)
            console.log("ws closed")
            if (!window.isPageClosing) sendEvent("multiplayer_disconnect")
            setMultiplayerState((prev) => ({
                ...initialMultiplayerState,
                maxRetries: prev.maxRetries,
                currentRetry: prev.currentRetry,
            }));
            // Always disable chat when WebSocket disconnects to prevent chat button showing in menu
            setMultiplayerChatEnabled(false)
            setMultiplayerChatOpen(false)
            if (window.screen !== "home" && window.screen !== "singleplayer" && window.screen !== "onboarding" && window.screen !== "countryGuesser" && window.screen !== "daily") {
                setMultiplayerError(true)
                setLoading(false)

                toast.info(text("connectionLostRecov"))

                setScreen("home")
            }


        }

        ws.onerror = () => {
            setWs(null)
            console.log("ws error")
            if (!window.isPageClosing) sendEvent("multiplayer_disconnect")

            setMultiplayerState((prev) => ({
                ...initialMultiplayerState,
                maxRetries: prev.maxRetries,
                currentRetry: prev.currentRetry,
            }));
            // Always disable chat when WebSocket has error to prevent chat button showing in menu
            setMultiplayerChatEnabled(false)
            setMultiplayerChatOpen(false)

            if (window.screen !== "home" && window.screen !== "singleplayer" && window.screen !== "onboarding" && window.screen !== "countryGuesser" && window.screen !== "daily") {
                setMultiplayerError(true)

                toast.info(text("connectionLostRecov"))
                setScreen("home")
            }

        }


        return () => {
            ws.onmessage = null;
        }
    }, [ws, multiplayerState, timeOffset, gameOptions?.extent]);

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


    // useEffect(() => {
    //   if (multiplayerState.inGame && multiplayerState.gameData?.state === "guess" && pinPoint) {
    //     // send guess
    //     console.log("pinpoint1", pinPoint)
    //     const pinpointLatLong = [pinPoint.lat, pinPoint.lng];
    //     ws.send(JSON.stringify({ type: "place", latLong: pinpointLatLong, final: false }))
    //   }
    // }, [multiplayerState, pinPoint])

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
        setMultiplayerChatEnabled(true);

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
                    adStarted: () => console.log("Start midgame ad"),
                };
                window.CrazyGames.SDK.ad.requestAd("midgame", callbacks);
            } catch (e) {
                console.log("error requesting midgame ad", e)
                adFinished()
            }
        } else if (process.env.NEXT_PUBLIC_COOLMATH === "true" && Date.now() - window.lastCoolmathAd > 120000) {
            try {
                window.lastCoolmathAd = Date.now();
                function onEnd() {
                    adFinished()
                    console.log("End midgame ad")
                    document.removeEventListener("adBreakComplete", onEnd);
                }
                function onStart() {
                    console.log("Start midgame ad")
                    document.removeEventListener("adBreakStart", onStart);
                }
                window.cmgAdBreak();
                document.addEventListener("adBreakStart", onStart);
                document.addEventListener("adBreakComplete", onEnd);
            } catch (e) {
                console.log("error requesting midgame ad", e)
                adFinished()
            }
        } else if (process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true") {
            try {
                if (typeof gdsdk !== 'undefined' && typeof gdsdk.showAd !== 'undefined') {
                    window._gdAdFinished = adFinished;
                    // Safety timeout in case SDK events never fire (no fill, dev mode, errors)
                    window._gdAdTimeout = setTimeout(() => {
                        console.log("GD ad timeout, forcing resume");
                        if (window._gdAdFinished) {
                            window._gdAdFinished();
                            window._gdAdFinished = null;
                        }
                    }, 15000);
                    gdsdk.showAd('interstitial');
                } else {
                    adFinished();
                }
            } catch (e) {
                console.log("error requesting GD midgame ad", e);
                adFinished();
            }
        } else {
            adFinished()
        }
    }


    useEffect(() => {
        window.crazyMidgame = crazyMidgame;

    }, []);


    function backBtnPressed(queueNextGame = false, nextGameType) {
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

        // Warning for ranked duels in progress - prevent accidental forfeits
        const isRankedDuel = multiplayerState?.inGame &&
            multiplayerState?.gameData?.duel &&
            !multiplayerState?.gameData?.public &&
            multiplayerState?.gameData?.state !== "end";

        if (isRankedDuel) {
            const confirmed = window.confirm(text("forfeitWarning"));
            if (!confirmed) {
                return; // User cancelled, don't leave the game
            }
        }

        if (multiplayerState?.inGame) {
            if (!multiplayerState?.gameData?.host || multiplayerState?.gameData?.state === "waiting") {
                ws.send(JSON.stringify({
                    type: 'leaveGame'
                }))

                if (inCrazyGames) {
                    try {
                        window.CrazyGames.SDK.game.hideInviteButton();
                    } catch (e) { }
                }


                setMultiplayerState((prev) => {
                    return {
                        ...prev,
                        nextGameQueued: queueNextGame === true,
                        nextGameType
                    }
                })
                setScreen("home")
                setMultiplayerChatEnabled(false)

                if (["getready", "guess"].includes(multiplayerState?.gameData?.state)) {
                    crazyMidgame()
                }
            } else {
                ws.send(JSON.stringify({ type: "resetGame" }))
            }
        } else if ((multiplayerState?.enteringGameCode) && multiplayerState?.connected) {

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
            console.log("gameQueued")
            ws.send(JSON.stringify({ type: "leaveQueue" }))

            setMultiplayerState((prev) => {
                return {
                    ...prev,
                    gameQueued: false
                }
            });
            setScreen("home")

        } else {
            setMultiplayerChatEnabled(false)

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
                crazyMidgame(afterBack);
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

    function loadLocation({ keepAnswer } = {}) {
        if (loading) return;
        console.log("[PERF] ========== Starting new round ==========");
        window.roundStartTime = performance.now();
        setLoading(true)
        if (!keepAnswer) setShowAnswer(false)
        setPinPoint(null)
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
                console.log("[PERF] loadLocation: Calling findLatLongRandom (dynamic import)");
                const startTime = performance.now();
                // Country/continent guesser can't tolerate Unknown-country spots.
                // With findCountry's local fallback, this rejection should rarely
                // fire (only for ocean / missing-polygon edge cases).
                const requireKnownCountry = screen === "countryGuesser" || (!!onboarding && onboarding?.mode !== "classic");
                try {
                    const mod = await import("@/components/findLatLong");
                    const findLatLongRandom = mod.default;
                    console.log(`[PERF] findLatLong module loaded in ${(performance.now() - startTime).toFixed(2)}ms`);
                    const latLong = await findLatLongRandom({ ...gameOptions, requireKnownCountry });
                    setLatLong(latLong);
                } catch (err) {
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
                const fetchStartTime = performance.now();
                console.log("[PERF] loadLocation: Starting fetch for locations");
                const url = config.apiUrl + ((gameOptions.location === "all") ? `/${window?.learnMode ? 'clue' : 'all'}Countries.json` :
                    gameOptions.countryMap && gameOptions.official ? `/countryLocations/${gameOptions.countryMap}` :
                        `/mapLocations/${gameOptions.location}`);
                fetch(url).then((res) => {
                    return res.json();
                }).then((data) => {
                    console.log(`[PERF] loadLocation: Fetched locations in ${(performance.now() - fetchStartTime).toFixed(2)}ms`);
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
                    if (!window._sentMapLoadErrorToast) {
                    toast(text("errorLoadingMap"), { type: 'error' })
                    window._sentMapLoadErrorToast = true;
                    }
                    defaultMethod()
                });
            }

            if (allLocsArray.length === 0) {
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

    // Generate country/continent options when location changes in country guesser mode
    useEffect(() => {
        if (screen !== "countryGuesser" || !latLong || !latLong.lat) return;
        const correctCountry = latLong.country || "??";
        if (countryGuessrMode.subMode === "continent") {
            setOtherOptions([...ALL_CONTINENTS]);
        } else {
            const distractors = [];
            const available = countries.filter(c => c !== correctCountry);
            while (distractors.length < 5) {
                const pick = available[Math.floor(Math.random() * available.length)];
                if (!distractors.includes(pick)) distractors.push(pick);
            }
            setOtherOptions(shuffle([...distractors, correctCountry]));
        }
        setShowCountryButtons(true);
    }, [latLong, screen]);

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

    // Send pong every 10 seconds if websocket is connected
    useEffect(() => {
        const pongInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'pong' }));
            }
        }, 10000); // Send pong every 10 seconds

        return () => clearInterval(pongInterval);
    }, [ws]);
    const [showPanoOnResult, setShowPanoOnResult] = useState(false);


    useEffect(() => {
        function checkForCheats() {
            if (document.getElementById("coo1rdinates")) return true;
            if (document.getElementById("map-canvas")) return true;
            function hasCheatStyles() {
                const cheatStyleSignatures = [
                    '.google-maps-iframe {',
                ];

                return Array.from(document.getElementsByTagName('style')).some(style => {
                    const content = style.textContent;
                    return cheatStyleSignatures.every(signature =>
                        content.includes(signature)
                    );
                });
            }
            if (hasCheatStyles()) return true;
            // try {
            // if(window.localStorage.getItem("banned")) return true;
            // } catch(e) {
            // }
            return false;
        }
        function banGame() {
            if (window.banned) return;
            sendEvent("cheat_detected")
            // redirect to banned page
            window.location.href = navigate("/banned");
            window.localStorage.setItem("banned", "true")
        }
        if (checkForCheats()) {
            banGame();
        }
        const i = setInterval(() => {
            if (checkForCheats()) {
                banGame();
            }
        }, 10000);
        return () => clearInterval(i);
    }, [])

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
                titleOverride={initialScreen === 'daily' ? `${text('dailyChallenge')} — WorldGuessr` : undefined}
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
            {showSuggestLoginModal && <SuggestAccountModal shown={true} setOpen={setShowSuggestLoginModal} showNeverAgain={suggestLoginShowNeverAgain} />}
            {showDiscordModal && typeof window !== 'undefined' && window.innerWidth >= 768 && <DiscordModal shown={true} setOpen={setShowDiscordModal} />}
            {mapGuessrModal && <MapGuessrModal isOpen={true} onClose={() => setMapGuessrModal(false)} />}
            {pendingNameChangeModal && <PendingNameChangeModal session={session} isOpen={true} onClose={() => setPendingNameChangeModal(false)} />}
            {ChatboxMemo}
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



            <div style={{
                top: 0,
                left: 0,
                position: 'fixed',
                width: '100%',
                height: '100%',
                transition: 'opacity 0.5s',
                opacity: 0.5,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                pointerEvents: 'none',
            }}>
                <NextImage.default src={asset('/street2.webp')}
                    draggable={false}
                    width={1920}
                    height={1080}
                    alt="Game Background" style={{
                        objectFit: "cover", userSelect: 'none',
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
            </div>


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
                        }, 300)

                    }}
                />

                {/* Loading overlay - covers iframe with background image to prevent white flicker */}
                <div className={`loading-overlay ${loading ? 'loading-overlay--visible' : ''}`}>
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

                {!inCrazyGames && !process.env.NEXT_PUBLIC_COOLMATH && !process.env.NEXT_PUBLIC_GAMEDISTRIBUTION &&

                    <div className={`home_ad `} style={{ display: (screen === 'home' && (!inCrazyGames && !process.env.NEXT_PUBLIC_COOLMATH && !process.env.NEXT_PUBLIC_GAMEDISTRIBUTION)) ? '' : 'none' }}>
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
                <span id="g2_playerCount" className={`bigSpan onlineText desktop ${screen !== 'home' ? 'notHome' : ''} ${(screen === 'singleplayer' || screen === 'onboarding' || screen === 'countryGuesser' || (multiplayerState?.inGame && !['waitingForPlayers', 'findingGame', 'findingOpponent'].includes(multiplayerState?.gameData?.state)) || !multiplayerState?.connected || !multiplayerState?.playerCount) ? 'hide' : ''}`}>
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
                    <DailyCommunityMapsButton onClick={() => setMapModal(true)} />
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
                                                        setNavSlideOut(true);
                                                        setMiniMapShown(false);
                                                        setTimeout(() => {
                                                            crazyMidgame(() => {
                                                                // First entry this session: check localStorage preference
                                                                if (!hasEnteredSingleplayer.current) {
                                                                    hasEnteredSingleplayer.current = true;
                                                                    const pref = gameStorage.getItem("singleplayerDefaultMode");
                                                                    if (pref === "countryGuesser") {
                                                                        setCountryGuessrMode({ subMode: "country", region: "all" });
                                                                        setScreen("countryGuesser");
                                                                        return;
                                                                    } else if (pref === "continentGuesser") {
                                                                        setCountryGuessrMode({ subMode: "continent", region: "all" });
                                                                        setScreen("countryGuesser");
                                                                        return;
                                                                    }
                                                                }
                                                                // Subsequent entries: restore last screen used this session
                                                                setScreen(lastSingleplayerScreen.current || "singleplayer");
                                                            });
                                                            setNavSlideOut(false); // Reset for next use
                                                        }, 300);
                                                    }}>
                                                    {text("singleplayer")}
                                                </button>
                                                {/* <span className="bigSpan">{text("playOnline")}</span> */}

                                                {/* <button className="g2_nav_text" aria-label="Duels" onClick={() => { setShowPartyCards(!showPartyCards) }}>{text("duels")}</button> */}
                                                {session?.token?.secret && (
                                                    <button className="g2_nav_text" aria-label="Duels" onClick={() => { handleMultiplayerAction("publicDuel") }}>{text("rankedDuel")}</button>
                                                )}
                                                <button className="g2_nav_text" aria-label="Duels" onClick={() => { handleMultiplayerAction("unrankedDuel") }}>{
                                                    session?.token?.secret ? text("unrankedDuel") : text("findDuel")}</button>



                                            </div>
                                            <div className="g2_nav_hr"></div>

                                            <div className="g2_nav_group">
                                                {/*<button className="g2_nav_text" aria-label="Party" onClick={() => { setShowPartyCards(!showPartyCards) }}>{text("privateGame")}</button>*/}
                                                <button className="g2_nav_text" disabled={maintenance} onClick={() => {
                                                    if (!ws || !multiplayerState?.connected) {
                                                        setConnectionErrorModalShown(true);
                                                        return;
                                                    }

                                                    setNavSlideOut(true);
                                                    setTimeout(() => {
                                                        setNavSlideOut(false); // Reset for next use
                                                        handleMultiplayerAction("createPrivateGame")
                                                    }, 300);
                                                }}>{text("createGame")}</button>
                                                <button className="g2_nav_text" disabled={maintenance} onClick={() => {
                                                    if (!ws || !multiplayerState?.connected) {
                                                        setConnectionErrorModalShown(true);
                                                        return;
                                                    }
                                                    setNavSlideOut(true);
                                                    setTimeout(() => {
                                                        setNavSlideOut(false); // Reset for next use
                                                        handleMultiplayerAction("joinPrivateGame")

                                                    }, 300);

                                                }}>{text("joinGame")}</button>
                                            </div>

                                            <div className="g2_nav_hr"></div>

                                            <div className="g2_nav_group">
                                                <DailyMenuItem session={session} onClick={() => enterDailyMode()} />

                                                {/* Twitch Streamer Link */}
                                                {/* <a
                                                    href="https://kick.com/ulkuemre"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="g2_nav_text"
                                                    style={{ color: '#ff4444', textDecoration: 'none' }}
                                                    aria-label="Watch UlkuEmre Live"
                                                >
                                                    🔴 Watch UlkuEmre Live
                                                </a> */}

                                                {inCrazyGames && (
                                                    <button className="g2_nav_text" aria-label="MapGuessr" onClick={() => {
                                                        setNavSlideOut(true);
                                                        setTimeout(() => {
                                                            setNavSlideOut(false); // Reset for next use
                                                            setMapGuessrModal(true);
                                                        }, 300);
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
                                        <Link target="_blank" href={"https://forum.worldguessr.com/"}><button className="g2_hover_effect home__squarebtn gameBtn g2_container forum" aria-label="Forum"><FaBook className="home__squarebtnicon" /></button></Link>
                                        <Link target="_blank" href={"https://discord.gg/ADw47GAyS5"}><button className="g2_hover_effect home__squarebtn gameBtn g2_container discord" aria-label="Discord"><FaDiscord className="home__squarebtnicon" /></button></Link>

                                        {!inCrazyGames && (
                                            <>
                                                <Link target="_blank" href={"https://www.youtube.com/@worldguessr?sub_confirmation=1"}><button className="g2_hover_effect home__squarebtn gameBtn g2_container youtube" aria-label="Youtube"><FaYoutube className="home__squarebtnicon" /></button></Link>
                                            </>
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

                        <div className="g2_content g2_content_margin g2_slide_in" style={{ display: "flex", gap: "20px", flexDirection: "column" }}>
                            {/*
                            {session?.token?.secret && (
                                <button className="g2_nav_text " onClick={() => { handleMultiplayerAction("publicDuel"); setShowPartyCards(false); }}
                                    disabled={!multiplayerState.connected || maintenance}>{text("rankedDuel")}</button>
                            )}
                            <button className="g2_nav_text " onClick={() => { handleMultiplayerAction("unrankedDuel"); setShowPartyCards(false); }}
                                disabled={!multiplayerState.connected || maintenance}>

                                {
                                    session?.token?.secret ? text("unrankedDuel") :
                                        text("findDuel")

                                }
                            </button>*/}
                            {/* {showPartyCards &&
                                <>
                                    <h1>{text("duels")}</h1>
                                    <div style={{ display: "flex", gap: "20px" }} >

                                        {session?.token?.secret && (
                                            <div className="g2_container_light g2_container_style g2_card">
                                                <button className="g2_text" disabled={!multiplayerState.connected || maintenance} onClick={() => { handleMultiplayerAction("publicDuel"); }}>{text("rankedDuel")}</button>
                                                <hr className="g2_nav_hr"></hr>
                                            </div>
                                        )}


                                        <div className="g2_container_light g2_container_style g2_card" >
                                        <button className="g2_text" disabled={!multiplayerState.connected || maintenance} onClick={() => { handleMultiplayerAction("unrankedDuel") }}>
                                                {
                                                    session?.token?.secret ? text("unrankedDuel") :
                                                        text("findDuel")
                                                }
                                            </button>
                                            <hr className="g2_nav_hr"></hr>
                                        </div>
                                    </div>
                                </>
                            } */}
                        </div>
                    </div>
                }
                {(mapModal || gameOptionsModalShown) && <MapsModal shown={true} session={session} onClose={() => {
                    if (mapModalClosing) return;
                    setMapModalClosing(true);
                    setTimeout(() => {
                        setMapModal(false); setGameOptionsModalShown(false); setMapModalClosing(false)
                    }, 300);
                }}
                    mapModalClosing={mapModalClosing}
                    text={text}
                    customChooseMapCallback={(gameOptionsModalShown && (screen === "singleplayer" || screen === "countryGuesser")) ? (map) => {
                        if (map.slug === "__countryGuesser") {
                            setCountryGuessrMode({ subMode: "country", region: "all" });
                            try { gameStorage.setItem("singleplayerDefaultMode", "countryGuesser"); } catch(e) {}
                            if (screen !== "countryGuesser") {
                                setScreen("countryGuesser");
                            } else {
                                setSinglePlayerRound({ round: 1, totalRounds: 10, locations: [] });
                                setShowCountryButtons(true);
                                loadLocation();
                            }
                            setGameOptionsModalShown(false);
                        } else if (map.slug === "__continentGuesser") {
                            setCountryGuessrMode({ subMode: "continent", region: "all" });
                            try { gameStorage.setItem("singleplayerDefaultMode", "continentGuesser"); } catch(e) {}
                            if (screen !== "countryGuesser") {
                                setScreen("countryGuesser");
                            } else {
                                setSinglePlayerRound({ round: 1, totalRounds: 10, locations: [] });
                                setShowCountryButtons(true);
                                loadLocation();
                            }
                            setGameOptionsModalShown(false);
                        } else {
                            if (screen === "countryGuesser") setScreen("singleplayer");
                            try { gameStorage.setItem("singleplayerDefaultMode", "world"); } catch(e) {}
                            openMap(map.countryMap || map.slug);
                            setGameOptionsModalShown(false);
                        }
                    } : null}
                    showAllCountriesOption={(gameOptionsModalShown && (screen === "singleplayer" || screen === "countryGuesser"))}
                    showOptions={screen === "singleplayer"}
                    showTimerOption={screen === "singleplayer"}
                    gameOptions={gameOptions} setGameOptions={setGameOptions} />}

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
singlePlayerRound={singlePlayerRound} setSinglePlayerRound={setSinglePlayerRound} showDiscordModal={showDiscordModal} setShowDiscordModal={setShowDiscordModal} inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult} countryGuesserCorrect={countryGuesserCorrect} setCountryGuesserCorrect={setCountryGuesserCorrect} showCountryButtons={showCountryButtons} setShowCountryButtons={setShowCountryButtons} otherOptions={otherOptions} countryGuesser={true} options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} mapModal={mapModal} latLong={latLong} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
                </div>}

                {screen === "onboarding" && (onboarding?.round || onboarding?.completed) && <div className="home__onboarding">
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
                            sendEvent("tutorial_end");
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            setMiniMapShown(false);
                            setLatLong(null);
                            setScreen("singleplayer");
                        }}
                        onDuel={() => {
                            sendEvent("tutorial_end");
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            handleMultiplayerAction("unrankedDuel");
                        }}
                        onCommunityMaps={() => {
                            sendEvent("tutorial_end");
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            setScreen("home");
                            setTimeout(() => setMapModal(true), 350);
                        }}
                        onCountryGuesser={() => {
                            sendEvent("tutorial_end");
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            try { gameStorage.setItem("singleplayerDefaultMode", "countryGuesser"); } catch(e) {}
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            setCountryGuessrMode({ subMode: "country", region: "all" });
                            setScreen("countryGuesser");
                        }}
                        onHome={() => {
                            sendEvent("tutorial_end");
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            setLatLong(null);
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            setScreen("home");
                        }}
                    />
                }

                <RoundOverScreen
                    hidden={!(multiplayerState?.inGame && multiplayerState?.gameData?.state === 'end' && multiplayerState?.gameData?.duelEnd)}
                    duel={true}
                    data={multiplayerState?.gameData?.duelEnd}
                    multiplayerState={multiplayerState}
                    session={session}
                    gameId={multiplayerState?.gameData?.code}
                    button1Text={text("playAgain")}
                    options={options}
                    button1Press={() => {
                        backBtnPressed(true, "ranked")
                    }}
                    button2Text={text("home")}
                    button2Press={() => {
                        backBtnPressed()
                    }}
                />


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
                    />
                </div>}

                {multiplayerState.inGame && ["guess", "getready", "end"].includes(multiplayerState.gameData?.state) && (
                    <GameUI
                        inCoolMathGames={inCoolMathGames}
                        inGameDistribution={inGameDistribution}
                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
                        inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult} options={options} timeOffset={timeOffset} ws={ws} backBtnPressed={backBtnPressed} multiplayerChatOpen={multiplayerChatOpen} setMultiplayerChatOpen={setMultiplayerChatOpen} multiplayerState={multiplayerState} pinPoint={pinPoint} setPinPoint={setPinPoint} loading={loading} setLoading={setLoading} session={session} latLong={latLong} loadLocation={() => { }} gameOptions={{
                            location: "all", maxDist: 20000, extent: gameOptions?.extent ?? multiplayerState?.gameData?.extent,
                            nm: multiplayerState?.gameData?.nm,
                            npz: multiplayerState?.gameData?.npz,
                            showRoadName: multiplayerState?.gameData?.showRoadName
                        }} setGameOptions={() => { }} showAnswer={(multiplayerState?.gameData?.curRound !== 1) && multiplayerState?.gameData?.state === 'getready'} setShowAnswer={guessMultiplayer} />
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
            if(window.PokiSDK) {
            console.log("Poki SDK found initialized")
            window.PokiSDK.init().then(() => {
    console.log("Poki SDK successfully initialized");
    window.poki = true;
    // fire your function to continue to game
    window.PokiSDK.gameLoadingFinished();

}).catch(() => {
    console.log("Initialized, something went wrong, load you game anyway");
    // fire your function to continue to game
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
