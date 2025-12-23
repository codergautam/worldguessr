import HeadContent from "@/components/headContent";
import { FaDiscord, FaGithub } from "react-icons/fa";
import { FaArrowRotateRight, FaGear, FaRankingStar, FaYoutube } from "react-icons/fa6";
import { signOut, useSession } from "@/components/auth/auth";
import retryManager from "@/components/utils/retryFetch";
import 'react-responsive-modal/styles.css';
import { useEffect, useState, useRef } from "react";
import Navbar from "@/components/ui/navbar";
import GameUI from "@/components/gameUI";
import BannerText from "@/components/bannerText";
import findLatLongRandom from "@/components/findLatLong";
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
// import RoundOverScreen from "@/components/roundOverScreen";
const RoundOverScreen = dynamic(() => import('@/components/roundOverScreen'), { ssr: false });
import msToTime from "@/components/msToTime";
import SuggestAccountModal from "@/components/suggestAccountModal";
import FriendsModal from "@/components/friendModal";
import { toast, ToastContainer } from "react-toastify";
import InfoModal from "@/components/infoModal";
import { inIframe, isForbiddenIframe } from "@/components/utils/inIframe";
import moment from 'moment-timezone';
import MapsModal from "@/components/maps/mapsModal";
import { useRouter } from "next/router";
import { fromLonLat } from "ol/proj";
import { boundingExtent } from "ol/extent";

import countries from "@/public/countries.json";
import officialCountryMaps from "@/public/officialCountryMaps.json";

import gameStorage from "@/components/utils/localStorage";
import DiscordModal from "@/components/discordModal";
import MerchModal from "@/components/merchModal";
import AlertModal from "@/components/ui/AlertModal";
import WhatsNewModal from "@/components/ui/WhatsNewModal";
import MapGuessrModal from "@/components/mapGuessrModal";
import changelog from "@/components/changelog.json";
import clientConfig from "@/clientConfig";
import { useGoogleLogin } from "@react-oauth/google";
import haversineDistance from "./utils/haversineDistance";
import StreetView from "./streetview/streetView";
import Stats from "stats.js";
import SvEmbedIframe from "./streetview/svHandler";
import HomeNotice from "./homeNotice";
import getTimeString, { getMaintenanceDate } from "./maintenanceTime";
// import MaintenanceBanner from "./MaintenanceBanner";
import Ad from "./bannerAdNitro";
import PendingNameChangeModal from "./pendingNameChangeModal";


const initialMultiplayerState = {
    connected: false,
    connecting: false,
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

export default function Home({ }) {

    const { width, height } = useWindowDimensions();
    const statsRef = useRef();

    const [session, setSession] = useState(false);
    const { data: mainSession } = useSession();
    const [accountModalOpen, setAccountModalOpen] = useState(false);
    const [screen, setScreen] = useState("home");
    const [loading, setLoading] = useState(false);
    // game state
    const [latLong, setLatLong] = useState({ lat: 0, long: 0 })
    const [latLongKey, setLatLongKey] = useState(0) // Increment to force refresh even with same coords
    const [gameOptionsModalShown, setGameOptionsModalShown] = useState(false);
    // location aka map slug
    const [gameOptions, setGameOptions] = useState({ location: "all", maxDist: 20000, official: true, countryMap: false, communityMapName: "", extent: null, showRoadName: true }) // rate limit fix: showRoadName true
    const [showAnswer, setShowAnswer] = useState(false)

    const [pinPoint, setPinPoint] = useState(null)
    const [hintShown, setHintShown] = useState(false)
    const [countryStreak, setCountryStreak] = useState(0)
    const [settingsModal, setSettingsModal] = useState(false)
    const [mapModal, setMapModal] = useState(false)
    const [friendsModal, setFriendsModal] = useState(false)
    const [merchModal, setMerchModal] = useState(false)
    const [mapGuessrModal, setMapGuessrModal] = useState(false)
    const [pendingNameChangeModal, setPendingNameChangeModal] = useState(false)
    const [dismissedNameChangeBanner, setDismissedNameChangeBanner] = useState(false)
    const [dismissedBanBanner, setDismissedBanBanner] = useState(false)
    const [timeOffset, setTimeOffset] = useState(0)
    const [loginQueued, setLoginQueued] = useState(false);
    const [options, setOptions] = useState({
    });
    const [multiplayerError, setMultiplayerError] = useState(null);
    const [miniMapShown, setMiniMapShown] = useState(false)
    const [accountModalPage, setAccountModalPage] = useState("profile");
    const [mapModalClosing, setMapModalClosing] = useState(false);

    useEffect(() => {
      let hideInt = setInterval(() => {
        if(document.getElementById("cmpPersistentLink")) {
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

                retryManager.fetchWithRetry(
                    clientConfig().apiUrl + "/api/googleAuth",
                    {
                        body: JSON.stringify({ code: tokenResponse.code }),
                        method: "POST",
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    },
                    'googleAuthLogin'
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
                })
            },
            onError: error => {
                toast.error("Login error, contact support if this persists")
                console.log("login error", error);
            },
            onNonOAuthError: error => {
                console.log("login non oauth error", error);
                toast.error("Login error, contact support if this persists (1)")

            },
            flow: "auth-code",

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
    useEffect(() => {
        if (!session?.token?.username) return;
        if (!accountModalOpen && window.firstFetchElo) return;

        fetch(clientConfig().apiUrl + "/api/eloRank?username=" + session?.token?.username).then((res) => res.json()).then((data) => {
            setEloData(data)
            window.firstFetchElo = true;
        }).catch((e) => {
            window.firstFetchElo = true;
        });



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
                    fetch(clientConfigData.apiUrl + "/api/crazyAuth", {
                        method: "POST",
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ token, username: user.username })
                    }).then((res) => res.json()).then((data) => {
                        console.log("crazygames auth", token, user, data)
                        try {
                            window.CrazyGames.SDK.game.loadingStop();
                        } catch (e) { }
                        if (data.secret && data.username) {
                            setSession({ token: { secret: data.secret, username: data.username, accountId: data.accountId } })
                            // verify the ws
                            window.verifyPayload = JSON.stringify({ type: "verify", secret: data.secret, username: data.username });

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
                        try {
                            window.CrazyGames.SDK.game.loadingStop();
                        } catch (e) { }
                        console.error("crazygames auth failed", e)
                    });

                }
            } else {
                console.log("crazygames user not logged in")
                // user not logged in
                // verify with not_logged_in
                let rc = gameStorage.getItem("rejoinCode");

                window.verifyPayload = JSON.stringify({
                    type: "verify", secret: "not_logged_in", username: "not_logged_in",
                    rejoinCode: rc
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
                if(!window.CrazyGames || !window.CrazyGames.SDK || !window.CrazyGames.SDK.user) return;
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

    const [showSuggestLoginModal, setShowSuggestLoginModal] = useState(false);
    const [showDiscordModal, setShowDiscordModal] = useState(false);
    const [singlePlayerRound, setSinglePlayerRound] = useState(null);
    const [partyModalShown, setPartyModalShown] = useState(false);
    const [selectCountryModalShown, setSelectCountryModalShown] = useState(false);
    const [connectionErrorModalShown, setConnectionErrorModalShown] = useState(false);


    const [inCoolMathGames, setInCoolMathGames] = useState(false);
    const [coolmathSplash, setCoolmathSplash] = useState(null);
    const [navSlideOut, setNavSlideOut] = useState(false);


    // check if ?coolmath=true
    useEffect(() => {
        if (process.env.NEXT_PUBLIC_COOLMATH === "true") {
            setInCoolMathGames(true);
            window.lastCoolmathAd = Date.now();

            setCoolmathSplash(0);
            let interval = setInterval(() => {
                setCoolmathSplash((prev) => {
                    if (prev >= 1) {
                        clearInterval(interval);
                        interval = setInterval(() => {
                            setCoolmathSplash((prev) => {
                                if (prev <= 0) {
                                    clearInterval(interval);
                                    return null;
                                }
                                return prev - 0.1
                            })
                        }, 100)
                    }
                    return prev + 0.1
                })
            }, 100)

            return () => {
                clearInterval(interval);
            }
        }
    }, [])

    useEffect(() => {
        if (screen === "singleplayer") {
            // start the single player game
            setSinglePlayerRound({
                round: 1,
                totalRounds: 5,
                locations: [],
            })
        }
    }, [screen])

    const [allLocsArray, setAllLocsArray] = useState([]);

    function startOnboarding() {

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

        let onboardingLocations = [
            { lat: 40.7598687, long: -73.9764681, country: "US", otherOptions: ["GB", "JP"] },
            { lat: 27.1719752, long: 78.0422793, country: "IN", otherOptions: ["ZA", "FR"] },
            { lat: 51.5080896, long: -0.087694, country: "GB", otherOptions: ["US", "DE"] },
            { lat: 55.7495807, long: 37.616477, country: "RU", otherOptions: ["CN", "PL"] },
            // pyramid of giza 29.9773337,31.1321796
            { lat: 29.9773337, long: 31.1321796, country: "EG", otherOptions: ["TR", "BR"] },
            // eiffel tower 48.8592946,2.2927855
            { lat: 48.8592946, long: 2.2927855, country: "FR", otherOptions: ["IT", "ES"] },
            // statue of liberty 40.6909253,-74.0552998
            { lat: 40.6909253, long: -74.0552998, country: "US", otherOptions: ["CA", "AU"] },
            // brandenburg gate 52.5161999,13.3756414
            { lat: 52.5161999, long: 13.3756414, country: "DE", otherOptions: ["RU", "JP"] },

        ]

        // pick 5 random locations no repeats
        const locations = [];
        while (locations.length < 5) {
            const loc = onboardingLocations[Math.floor(Math.random() * onboardingLocations.length)]
            if (!locations.find((l) => l.country === loc.country)) {
                locations.push(loc)
            }
        }

        setOnboarding({
            round: 1,
            locations: locations,
            startTime: Date.now(),
        })
        sendEvent("tutorial_begin")
        setShowCountryButtons(false)
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
            loadLocation()
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

            // immediately open single player
            setScreen("singleplayer")
        }
        // check if from map screen
        if (window.location.search.includes("map=") && !window.location.search.includes("crazygames")) {
            // get map slug map=slug from url
            const params = new URLSearchParams(window.location.search);
            const mapSlug = params.get("map");
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
            console.log("set lang", options?.language)
            const currentQueryParams = new URLSearchParams(window.location.search);
            const qPsuffix = currentQueryParams.toString() ? `?${currentQueryParams.toString()}` : "";

            const location = `/${options?.language !== "en" ? options?.language : ""}`
            if (!window.location.pathname.includes(location)) {
                console.log("changing lang", location)
                window.location.href = location + qPsuffix;
            }
            if (options?.language === "en" && ["es", "fr", "de", "ru"].includes(window.location.pathname.split("/")[1])) {
                console.log("changing lang", location)
                window.location.href = "/" + qPsuffix;
            }
        } catch (e) { }
    }, [options?.language]);

    const loadOptions = async () => {

        // try to fetch options from localstorage
        try {
            const options = gameStorage.getItem("options");
            console.log("options", options)


            if (options) {
                setOptions(JSON.parse(options))
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
                    mapType: "m" //m for normal
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

    useEffect(() => {
        window.disableVideoAds = options?.disableVideoAds;
    }, [options?.disableVideoAds]);

    // multiplayer stuff
    const [ws, setWs] = useState(null);
    const [multiplayerState, setMultiplayerState] = useState(
        initialMultiplayerState
    );
    const [multiplayerChatOpen, setMultiplayerChatOpen] = useState(false);
    const [multiplayerChatEnabled, setMultiplayerChatEnabled] = useState(false);


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
            setScreen("multiplayer")
            setMultiplayerState((prev) => ({
                ...prev,
                gameQueued: "publicDuel",
                nextGameType: undefined,
                nextGameQueued: false
            }))
            sendEvent("multiplayer_request_ranked_duel")
            ws.send(JSON.stringify({ type: "publicDuel" }))
        }

        if (action === "unrankedDuel") {
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

          if(inCrazyGames) {
            const link = window.CrazyGames.SDK.game.showInviteButton({ code:  multiplayerState?.gameData?.code })
            console.log("crazygames invite link", link)
          }

          setMultiplayerState((prev) => {
                ws.send(JSON.stringify({ type: "setPrivateGameOptions", rounds: prev.createOptions.rounds, timePerRound: prev.createOptions.timePerRound, nm: prev.createOptions.nm, npz: prev.createOptions.npz, showRoadName: prev.createOptions.showRoadName, location: prev.createOptions.location, displayLocation: prev.createOptions.displayLocation }))
                return prev;
            })
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

                            const tz = moment.tz.guess();
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
                            ws.send(JSON.stringify({ type: "verify", secret, tz, rejoinCode: gameStorage.getItem("rejoinCode") }))
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
            const isInGameplay = (screen === "singleplayer" && singlePlayerRound && !singlePlayerRound.done) ||
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
        if (multiplayerState?.connected && inCrazyGames) {

            // check if joined via invite link
            try {
                let code = window.CrazyGames.SDK.game.getInviteParam("code")
                let instantJoin =  (inCrazyGames && window.CrazyGames.SDK.game.isInstantMultiplayer) || window.location.search.includes("instantJoin");

            if( window.CrazyGames.SDK.game.getInviteParam("code") || window.CrazyGames.SDK.game.isInstantMultiplayer) {
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
    }, [multiplayerState?.connected, inCrazyGames])

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
                if (Math.abs(offset) > 1000 && ((Math.abs(offset) < Math.abs(timeOffset)) || !timeOffset)) {
                    setTimeOffset(offset)
                }
            }

            if (data.type === "elo") {
                setEloData((prev) => ({
                    ...prev,
                    league: data.league,
                    elo: data.elo,
                }))
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
            } else if (data.type === "gameJoinError" && multiplayerState.enteringGameCode) {
                setMultiplayerState((prev) => {
                    return {
                        ...prev,
                        joinOptions: {
                            ...prev.joinOptions,
                            error: data.error,
                            progress: false
                        }
                    }
                })
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
            sendEvent("multiplayer_disconnect")

            setMultiplayerState((prev) => ({
                ...initialMultiplayerState,
                maxRetries: prev.maxRetries,
                currentRetry: prev.currentRetry,
            }));
            if (window.screen !== "home" && window.screen !== "singleplayer" && window.screen !== "onboarding") {
                setMultiplayerError(true)
                setLoading(false)

                toast.info(text("connectionLostRecov"))

                setScreen("home")
            }


        }

        ws.onerror = () => {
            setWs(null)
            console.log("ws error")
            sendEvent("multiplayer_disconnect")

            setMultiplayerState((prev) => ({
                ...initialMultiplayerState,
                maxRetries: prev.maxRetries,
                currentRetry: prev.currentRetry,
            }));

            if (window.screen !== "home" && window.screen !== "singleplayer" && window.screen !== "onboarding") {
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
        if (!multiplayerState.inGame || multiplayerState.gameData?.state !== "guess" || !pinPoint) return;
        const pinpointLatLong = [pinPoint.lat, pinPoint.lng];

        ws.send(JSON.stringify({ type: "place", latLong: pinpointLatLong, final: true }))
    }

    function sendInvite(id) {
        if (!ws || !multiplayerState?.connected) return;
        ws.send(JSON.stringify({ type: 'inviteFriend', friendId: id }))
    }

    useEffect(() => {
        try {
            const streak = gameStorage.getItem("countryStreak");
            if (streak) {
                setCountryStreak(parseInt(streak))
            }

            // preload/cache src.png and dest.png and src2.png
            const img = new Image();
            img.src = "./src.png";
            const img2 = new Image();
            img2.src = "./dest.png";
            const img3 = new Image();
            img3.src = "./src2.png";
            // easter eggs too
            const polandball = new Image();
            polandball.src = "./polandball.png";
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
        } else {
            adFinished()
        }
    }


    useEffect(() => {
        window.crazyMidgame = crazyMidgame;

    }, []);


    function backBtnPressed(queueNextGame = false, nextGameType) {
        setOnboardingCompleted(true)

        if (loading) setLoading(false);
        if (multiplayerError) setMultiplayerError(false)

        setPartyModalShown(false)

        if (window.learnMode) {
            // redirect to home
            window.location.href = "/"
            return;
        }

        if (screen === "onboarding") {
            setScreen("home")
            setOnboarding(null)
            gameStorage.setItem("onboarding", 'done')

            return;
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

            setScreen("home");
            setGameOptions((prev) => ({
                ...prev,
                extent: null
            }))
            clearLocation();
        }
    }

    function clearLocation() {
        setLatLong({ lat: 0, long: 0 })
        setShowAnswer(false)
        setPinPoint(null)
        setHintShown(false)
    }

    function loadLocation() {
        if (loading) return;
        setLoading(true)
        setShowAnswer(false)
        setPinPoint(null)
        setLatLong(null)
        setHintShown(false)

        if (screen === "onboarding") {
            setLatLong(onboarding.locations[onboarding.round - 1]);
            let options = JSON.parse(JSON.stringify(onboarding.locations[onboarding.round - 1].otherOptions));
            options.push(onboarding.locations[onboarding.round - 1].country)
            // shuffle
            options = options.sort(() => Math.random() - 0.5)
            setOtherOptions(options)
        } else {
            function defaultMethod() {
                findLatLongRandom(gameOptions).then((latLong) => {
                    setLatLong(latLong);
                });
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
                    if (data.ready) {
                        // this uses long for lng
                        for (let i = 0; i < data.locations.length; i++) {
                            if (data.locations[i].lng && !data.locations[i].long) {
                                data.locations[i].long = data.locations[i].lng;
                                delete data.locations[i].lng;
                            }
                        }

                        // shuffle data.locations
                        data.locations = data.locations.sort(() => Math.random() - 0.5)


                        setAllLocsArray(data.locations)

                        if (gameOptions.location === "all") {
                            const loc = data.locations[0]
                            setLatLong(loc)
                            console.log("setting latlong", loc)
                                } else {
                            let loc = data.locations[Math.floor(Math.random() * data.locations.length)];

                            while (loc.lat === latLong.lat && loc.long === latLong.long) {
                                loc = data.locations[Math.floor(Math.random() * data.locations.length)];
                            }

                            setLatLong(loc)
                            if (data.name) {

                                // calculate extent (for openlayers)
                                const mappedLatLongs = data.locations.map((l) => fromLonLat([l.long, l.lat], 'EPSG:4326'));
                                let extent = boundingExtent(mappedLatLongs);
                                console.log("extent", extent)
                                // convert extent from EPSG:4326 to EPSG:3857 (for openlayers)

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
                }).catch((e) => {
                    toast(text("errorLoadingMap"), { type: 'error' })
                    defaultMethod()
                });
            }

            if (allLocsArray.length === 0) {
                fetchMethod()
            } else if (allLocsArray.length > 0) {
                const locIndex = allLocsArray.findIndex((l) => l.lat === latLong.lat && l.long === latLong.long);
                if ((locIndex === -1) || allLocsArray.length === 1) {
                    fetchMethod()
                } else {
                    if (gameOptions.location === "all") {
                        const loc = allLocsArray[locIndex + 1] ?? allLocsArray[0];
                        setLatLong(loc);
                        } else {
                        // prevent repeats: remove the prev location from the array
                        setAllLocsArray((prev) => {
                            const newArr = prev.filter((l) => l.lat !== latLong.lat && l.long !== latLong.long)


                            // community maps are randomized
                            const loc = newArr[Math.floor(Math.random() * newArr.length)];


                            setLatLong(loc);
                                    return newArr;
                        })

                    }
                }

            }
        }

    }

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
        enabled={session?.token?.secret && multiplayerChatEnabled && !process.env.NEXT_PUBLIC_COOLMATH}
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
            window.location.href = "/banned";
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
            <HeadContent text={text} inCoolMathGames={inCoolMathGames} inCrazyGames={inCrazyGames} />

            <AccountModal inCrazyGames={inCrazyGames} shown={accountModalOpen} session={session} setAccountModalOpen={setAccountModalOpen}
                eloData={eloData} accountModalPage={accountModalPage} setAccountModalPage={setAccountModalPage}
                ws={ws} canSendInvite={
                    // send invite if in a private multiplayer game, dont need to be host or in game waiting just need to be in a Party
                    multiplayerState?.inGame && !multiplayerState?.gameData?.public
                } sendInvite={sendInvite} options={options}

            />
            <SetUsernameModal shown={session && session?.token?.secret && !session.token.username} session={session} />
            <SuggestAccountModal shown={showSuggestLoginModal} setOpen={setShowSuggestLoginModal} />
            <DiscordModal shown={showDiscordModal && (typeof window !== 'undefined' && window.innerWidth >= 768)} setOpen={setShowDiscordModal} />
            {/* <MerchModal shown={merchModal} onClose={() => setMerchModal(false)} session={session} /> */}
            <MapGuessrModal isOpen={mapGuessrModal} onClose={() => setMapGuessrModal(false)} />
            <PendingNameChangeModal
              session={session}
              isOpen={pendingNameChangeModal}
              onClose={() => setPendingNameChangeModal(false)}
            />
            {ChatboxMemo}
            <ToastContainer pauseOnFocusLoss={false} />

            <div className="videoAdParent hidden">
                <div className="videoAdPlayer">
                    <div className="messageContainer">
                        <p className="thankYouMessage">{text("videoAdThanks")}<br />{text("enjoyGameplay")}</p>
                    </div>
                    <div id="videoad"></div>
                </div>
            </div>

            {typeof coolmathSplash === "number" && (
                // black background
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    backgroundColor: 'rgb(36,36,36)',
                    zIndex: 100090,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: 'white',
                    fontSize: '2em'
                }}>
                    <div>
                        {/* image /coolmath-splash.png */}
                        <NextImage.default src={'/coolmath-splash.png'} draggable={false} fill alt="Coolmath Splash" style={{ objectFit: "contain", userSelect: 'none', opacity: coolmathSplash }} />

                    </div>
                </div>

            )}



            <div style={{
                top: 0,
                left: 0,
                position: 'fixed',
                width: '100vw',
                height: '100vh',
                height: '100dvh', // Modern browsers dynamic viewport
                height: '-webkit-fill-available', // iOS Safari fix
                transition: 'opacity 0.5s',
                opacity: 0.5,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                pointerEvents: 'none',
            }}>
                <NextImage.default src={'./street2christmas.jpg'}
                    draggable={false}
                    width={1920}
                    height={1080}
                    alt="Game Background" style={{
                        objectFit: "cover", userSelect: 'none',
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100vw",
                        height: "100vh",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
            </div>


            <main className={`home`} id="main">

                <SvEmbedIframe
                    nm={gameOptions?.nm}
                    npz={gameOptions?.npz}
                    showAnswer={showAnswer}
                    lat={latLong?.lat}
                    long={latLong?.long}
                    panoId={latLong?.panoId}
                    heading={latLong?.heading}
                    pitch={latLong?.pitch}
                    showRoadLabels={screen === "onboarding" ? false : gameOptions?.showRoadName}
                    loading={loading}
                    setLoading={setLoading}
                    latLongKey={latLongKey}
                    hidden={!!((!latLong || !latLong.lat || !latLong.long) || loading) || (
                        screen === "home" || !!(screen === "multiplayer" && (multiplayerState?.gameData?.state === "waiting" || multiplayerState?.enteringGameCode || multiplayerState?.gameQueued))
                    )}
                    onLoad={() => {
                        console.log("loaded")
                        setTimeout(() => {
                            setLoading(false)
                        }, 1000)

                    }}
                />

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
                    maintenance={maintenance}
                    inCrazyGames={inCrazyGames}
                    loading={loading}
                    onFriendsPress={() => { setAccountModalOpen(true); setAccountModalPage("list"); }}
                    loginQueued={loginQueued}
                    setLoginQueued={setLoginQueued}
                    inGame={multiplayerState?.inGame || screen === "singleplayer"}
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
                  </div>
                )}

                                {!inCrazyGames && !process.env.NEXT_PUBLIC_COOLMATH &&

                                                        <div className={`home_ad `} style={{ display: (screen === 'home' && ( !inCrazyGames && !process.env.NEXT_PUBLIC_COOLMATH)) ? '' : 'none' }}>
                                                          <Ad
                                                          unit={"worldguessr_home_ad"}
                                                        inCrazyGames={inCrazyGames} showAdvertisementText={false} screenH={height} types={[[300,250]]} screenW={width} vertThresh={width < 600 ? 0.33 : 0.5} />
                                                        </div>
                                }
                <span id="g2_playerCount" className={`bigSpan onlineText desktop ${screen !== 'home' ? 'notHome' : ''} ${(screen === 'singleplayer' || screen === 'onboarding' || (multiplayerState?.inGame && !['waitingForPlayers', 'findingGame', 'findingOpponent'].includes(multiplayerState?.gameData?.state)) || !multiplayerState?.connected || !multiplayerState?.playerCount) ? 'hide' : ''}`}>
                    {maintenance ? text("maintenanceMode") : text("onlineCnt", { cnt: multiplayerState?.playerCount || 0 })}
                </span>

                {/* reload button for public game */}
                {multiplayerState?.gameData?.duel && multiplayerState?.gameData?.state === "guess" && (
                    <div className="gameBtnContainer" style={{ position: 'fixed', top: width > 830 ? '90px' : '50px', left: width > 830 ? '10px' : '0px', zIndex: 1000000 }}>

                        <button className="gameBtn navBtn backBtn reloadBtn" onClick={() => reloadBtnPressed()}><FaArrowRotateRight /></button>
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
                                                              crazyMidgame(() => setScreen("singleplayer"));
                                                              setNavSlideOut(false); // Reset for next use
                                                            }, 300);
                                                    }}>
                                                    {text("singleplayer")}
                                                </button>
                                                {/* <span className="bigSpan">{text("playOnline")}</span> */}

                                                {/* <button className="g2_nav_text" aria-label="Duels" onClick={() => { setShowPartyCards(!showPartyCards) }}>{text("duels")}</button> */}
                                                    { session?.token?.secret && (
                                                 <button className="g2_nav_text" aria-label="Duels" onClick={() => { handleMultiplayerAction("publicDuel") }}>{text("rankedDuel")}</button>
                                                    )}
                                                 <button className="g2_nav_text" aria-label="Duels" onClick={() => { handleMultiplayerAction("unrankedDuel") }}>{
                                                    session?.token?.secret ? text("unrankedDuel") : text("findDuel")}</button>



                                            </div>
                                            <div className="g2_nav_hr"></div>

                                            <div className="g2_nav_group">
                                                {/*<button className="g2_nav_text" aria-label="Party" onClick={() => { setShowPartyCards(!showPartyCards) }}>{text("privateGame")}</button>*/}
                                                <button className="g2_nav_text" disabled={maintenance} onClick={() => {
                                                    if(!ws || !multiplayerState?.connected) {
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
                                                    if(!ws || !multiplayerState?.connected) {
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
                                                {!process.env.NEXT_PUBLIC_COOLMATH &&
                                                    <button className="g2_nav_text" aria-label="Community Maps" onClick={() => {
                                                        setNavSlideOut(true);
                                                        setTimeout(() => {
                                                            setNavSlideOut(false); // Reset for next use
                                                            setMapModal(true);
                                                        }, 300);
                                                        }}>{text("communityMaps")}</button>}

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
                                {!isApp && !inCoolMathGames && (
                                    <>
                                        <Link target="_blank" href={"https://discord.gg/ADw47GAyS5"}><button className="g2_hover_effect home__squarebtn gameBtn g2_container discord" aria-label="Discord"><FaDiscord className="home__squarebtnicon" /></button></Link>

                                        {!inCrazyGames && (
                                            <>
                                                <Link target="_blank" href={"https://www.youtube.com/@worldguessr?sub_confirmation=1"}><button className="g2_hover_effect home__squarebtn gameBtn g2_container youtube" aria-label="Youtube"><FaYoutube className="home__squarebtnicon" /></button></Link>
                                                <Link target="_blank" className="desktop" href={"https://www.coolmathgames.com/0-worldguessr"}><button className="g2_hover_effect home__squarebtn gameBtn g2_container_full" aria-label="CoolmathGames">
                                                    {/* Todo; include coolmath logo here; url is /cmlogo.png*/}

                                                    <NextImage.default src={'/cmlogo.png'} draggable={false} fill alt="Coolmath Games Logo" className="home__squarebtnicon" />

                                                    </button>
                                                </Link>

                                                <Link target="_blank" href={"https://github.com/codergautam/worldguessr"}><button className="g2_hover_effect home__squarebtn gameBtn g2_container_full" aria-label="Github"><FaGithub className="home__squarebtnicon" /></button></Link>
                                            </>
                                        )}
                                        <Link href={"/leaderboard" + (inCrazyGames ? "?crazygames" : "")}>

                                            <button className="g2_hover_effect home__squarebtn gameBtn g2_container_full " aria-label="Leaderboard"><FaRankingStar className="home__squarebtnicon" /></button></Link>
                                    </>
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
                <InfoModal shown={false} />
                <MapsModal shown={mapModal || gameOptionsModalShown} session={session} onClose={() => {
                    if(mapModalClosing) return;
                    setMapModalClosing(true);
                    setTimeout(() => {
                        setMapModal(false); setGameOptionsModalShown(false); setMapModalClosing(false)
                    }, 300);
                   }}
                mapModalClosing={mapModalClosing}
                text={text}
                    customChooseMapCallback={(gameOptionsModalShown && screen === "singleplayer") ? (map) => {
                        console.log("map", map)
                        openMap(map.countryMap || map.slug);
                        setGameOptionsModalShown(false)
                    } : null}
                    showAllCountriesOption={(gameOptionsModalShown && screen === "singleplayer")}
                    showOptions={screen === "singleplayer"}
                    gameOptions={gameOptions} setGameOptions={setGameOptions} />

                <SettingsModal inCrazyGames={inCrazyGames} options={options} setOptions={setOptions} shown={settingsModal} onClose={() => setSettingsModal(false)} />

                <AlertModal
                    isOpen={connectionErrorModalShown}
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
                />



                {screen === "singleplayer" && <div className="home__singleplayer">
                    <GameUI
                        inCoolMathGames={inCoolMathGames}
                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
                        singlePlayerRound={singlePlayerRound} setSinglePlayerRound={setSinglePlayerRound} showDiscordModal={showDiscordModal} setShowDiscordModal={setShowDiscordModal} inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult} options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} latLong={latLong} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
                </div>}

                {screen === "onboarding" && (onboarding?.round || onboarding?.completed) && <div className="home__onboarding">
                    <GameUI
                        inCoolMathGames={inCoolMathGames}

                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
                        inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult} countryGuesserCorrect={countryGuesserCorrect} setCountryGuesserCorrect={setCountryGuesserCorrect} showCountryButtons={showCountryButtons} setShowCountryButtons={setShowCountryButtons} otherOptions={otherOptions} onboarding={onboarding} countryGuesser={false} setOnboarding={setOnboarding} backBtnPressed={backBtnPressed} options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} latLong={latLong} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
                </div>}

                {screen === "onboarding" && onboarding?.completed && <div className="home__onboarding">
                    <div className="home__onboarding__completed">
                        <OnboardingText words={[
                            text("onboarding1")
                        ]} pageDone={() => {
                            try {
                                gameStorage.setItem("onboarding", 'done')
                            } catch (e) { }
                            setOnboarding((prev) => {
                                return {
                                    ...prev,
                                    finalOnboardingShown: true
                                }
                            })
                        }} shown={!onboarding?.finalOnboardingShown} />
                        <RoundOverScreen button1Text={text("home")} onboarding={onboarding} setOnboarding={setOnboarding} points={onboarding.points} time={msToTime(onboarding.timeTaken)} maxPoints={25000} history={onboarding.locations || []} options={options} button1Press={() => {
                            if (onboarding) {
                                sendEvent("tutorial_end");
                                try {
                                    gameStorage.setItem("onboarding", 'done')
                                } catch (e) { }
                            }

                            setOnboarding(null)
                            if (!window.location.search.includes("app=true") && !inCrazyGames) {
                                setShowSuggestLoginModal(true)
                            }
                            setScreen("home")
                        }} />
                    </div>
                </div>
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
                    />
                </div>}

                {multiplayerState.inGame && ["guess", "getready", "end"].includes(multiplayerState.gameData?.state) && (
                    <GameUI
                        inCoolMathGames={inCoolMathGames}

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
            window.lastAdShown = Date.now();
            window.gameOpen = Date.now();
          //   try {
          //   if(window.localStorage.getItem("lastAdShown")) {
          //     window.lastAdShown = parseInt(window.localStorage.getItem("lastAdShown"))
          // }
          //   } catch(e) {}
            window.adInterval = 1800000;


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

    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "ndud94nvsg");

  	window.aiptag = window.aiptag || {cmd: []};
	aiptag.cmd.display = aiptag.cmd.display || [];
	aiptag.cmd.player = aiptag.cmd.player || [];

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

   aiptag.cmd.player.push(function() {
	aiptag.adplayer = new aipPlayer({
		AD_WIDTH: Math.min(Math.max(window.innerWidth, 300), 1066),
		AD_HEIGHT: Math.min(Math.max(window.innerHeight, 150), 600),
		AD_DISPLAY: 'modal-center', //default, fullscreen, fill, center, modal-center
		LOADING_TEXT: 'loading advertisement',
		PREROLL_ELEM: function(){ return document.getElementById('videoad'); },
		AIP_COMPLETE: function (state) {
  document.querySelector('.videoAdParent').classList.add('hidden');

    console.log("Ad complete", state)
			// The callback will be executed once the video ad is completed.
      window.lastAdShown = Date.now();
      try {
      window.localStorage.setItem("lastAdShown", window.lastAdShown)
    } catch(e) {}


			if (typeof aiptag.adplayer.adCompleteCallback === 'function') {
				aiptag.adplayer.adCompleteCallback(state);
			}
		}
	});
});

window.show_videoad = function(callback) {
// if in crazygame (window.inCrazyGames) dont show ads
if(window.inCrazyGames) {
  console.log("In crazygames, not showing ads")
  callback("DISABLED");
  return;
}

          if(window.disableVideoAds) {
          console.log("Video ads disabled")
            callback("DISABLED");
            return;
          }

  if(window.lastAdShown + window.adInterval > Date.now()) {
            callback("COOLDOWN");
            return;
          }

	// Assign the callback to be executed when the ad is done
	aiptag.adplayer.adCompleteCallback = callback;

	// Check if the adslib is loaded correctly or blocked by adblockers etc.
	if (typeof aiptag.adplayer !== 'undefined') {
  console.log("Showing ad")
  // remove 'hidden' class from the parent div
  document.querySelector('.videoAdParent').classList.remove('hidden');
		aiptag.cmd.player.push(function() { aiptag.adplayer.startVideoAd(); });
	} else {
   console.log("Adlib not loaded")
		// Adlib didn't load; this could be due to an ad blocker, timeout, etc.
		// Please add your script here that starts the content, this usually is the same script as added in AIP_COMPLETE.
		aiptag.adplayer.aipConfig.AIP_COMPLETE();
	}
}

  `}
                </Script>

                <WhatsNewModal changelog={changelog} text={text} />
            </main>
        </>
    )
}