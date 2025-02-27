import HeadContent from "@/components/headContent";
import { FaDiscord, FaGithub } from "react-icons/fa";
import { FaArrowRotateRight, FaGear, FaRankingStar, FaYoutube } from "react-icons/fa6";
import { signOut, useSession } from "@/components/auth/auth";
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
import Ad from "@/components/bannerAd";
import Script from "next/script";
import SettingsModal from "@/components/settingsModal";
import sendEvent from "@/components/utils/sendEvent";
import initWebsocket from "@/components/utils/initWebsocket";
import 'react-toastify/dist/ReactToastify.css';

import NextImage from "next/image";
import OnboardingText from "@/components/onboardingText";
import RoundOverScreen from "@/components/roundOverScreen";
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

import fixBranding from "@/components/utils/fixBranding";
import gameStorage from "@/components/utils/localStorage";
import DiscordModal from "@/components/discordModal";
import MerchModal from "@/components/merchModal";
import clientConfig from "@/clientConfig";
import { useGoogleLogin } from "@react-oauth/google";
import LeagueModal from "./leagueModal";
import haversineDistance from "./utils/haversineDistance";
import StreetView from "./streetview/streetView";
import Stats from "stats.js";
import SvEmbedIframe from "./streetview/svHandler";

const initialMultiplayerState = {
    connected: false,
    connecting: false,
    shouldConnect: false,
    gameQueued: false,
    inGame: false,
    nextGameQueued: false,
    enteringGameCode: false,
    nextGameType: null,
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
    const [streetViewShown, setStreetViewShown] = useState(false)
    const [gameOptionsModalShown, setGameOptionsModalShown] = useState(false);
    // location aka map slug
    const [gameOptions, setGameOptions] = useState({ location: "all", maxDist: 20000, official: true, countryMap: false, communityMapName: "", extent: null, showRoadName: true }) // rate limit fix: showRoadName true
    const [showAnswer, setShowAnswer] = useState(false)
    const [pinPoint, setPinPoint] = useState(null)
    const [hintShown, setHintShown] = useState(false)
    const [xpEarned, setXpEarned] = useState(0)
    const [countryStreak, setCountryStreak] = useState(0)
    const [settingsModal, setSettingsModal] = useState(false)
    const [mapModal, setMapModal] = useState(false)
    const [friendsModal, setFriendsModal] = useState(false)
    const [merchModal, setMerchModal] = useState(false)
    const [timeOffset, setTimeOffset] = useState(0)
    const [loginQueued, setLoginQueued] = useState(false);
    const [options, setOptions] = useState({
    });
    const [multiplayerError, setMultiplayerError] = useState(null);
    const [miniMapShown, setMiniMapShown] = useState(false)
    const [accountModalPage, setAccountModalPage] = useState("profile");

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
                fetch(clientConfig().apiUrl + "/api/googleAuth", {
                    body: JSON.stringify({ code: tokenResponse.code }),
                    method: "POST",
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }).then((res) => res.json()).then((data) => {
                    if (data.secret) {

                        setSession({ token: data })
                        window.localStorage.setItem("wg_secret", data.secret)

                    } else {
                        toast.error("Login error, contact support if this persists (2)")
                    }

                }).catch((e) => {
                    console.error("google auth error", e)
                    toast.error("Login error, contact support if this persists (3)")
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
    const [leagueModal, setLeagueModal] = useState(false);

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
        if (!leagueModal && window.firstFetchElo) return;

        fetch(clientConfig().apiUrl + "/api/eloRank?username=" + session?.token?.username).then((res) => res.json()).then((data) => {
            setEloData(data)
            window.firstFetchElo = true;
        }).catch((e) => {
            window.firstFetchElo = true;
        });



    }, [session?.token?.username, leagueModal])
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
                            setSession({ token: { secret: data.secret, username: data.username } })
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

    const [inCoolMathGames, setInCoolMathGames] = useState(false);
    const [coolmathSplash, setCoolmathSplash] = useState(null);

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

        setGameOptions((prev) => ({
            ...prev,
            location: mapSlug,
            official: (country || mapSlug === 'all') ? true : false,
            countryMap: country,
            maxDist: country ? countryMaxDists[country] : 20000,
            extent: country && officialCountryMap && officialCountryMap.extent ? officialCountryMap.extent : null
        }))
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
                let json;

                try {
                    const res = await fetch("https://ipapi.co/json/");
                    json = await res.json();
                } catch (e) { }

                const countryCode = json?.country_code;
                let system = "metric";
                if (countryCode && ["US", "LR", "MM", "UK"].includes(countryCode)) system = "imperial";


                setOptions({
                    units: system,
                    ramUsage: false,
                    mapType: "m" //m for normal
                })
            }
        } catch (e) { }

    }
    useEffect(() => { loadOptions() }, [])

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
        if (!ws || !multiplayerState.connected || multiplayerState.gameQueued || multiplayerState.connecting) return;

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

                setMultiplayerState((prev) => ({
                    ...prev,
                    connecting: true,
                    shouldConnect: false
                }))
                const ws = await initWebsocket(clientConfig().websocketUrl, null, 5000, 50)
                if (ws && ws.readyState === 1) {
                    setWs(ws)
                    setMultiplayerState((prev) => ({
                        ...prev,
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
                    alert("could not connect to server")
                }

            }
        })();
    }, [multiplayerState, ws, screen])


    useEffect(() => {

        if (inCrazyGames || window.poki) {
            if (screen === "home") {
                console.log("gameplay stop")
                try {
                    window.CrazyGames.SDK.game.gameplayStop();
                } catch (e) { }
                try {
                    if (window.poki) window.PokiSDK.gameplayStop();
                } catch (e) { }
            } else {
                console.log("gameplay start")
                try {
                    window.CrazyGames.SDK.game.gameplayStart();
                } catch (e) { }
                try {
                    if (window.poki) window.PokiSDK.gameplayStart();
                } catch (e) { }
            }
        }
    }, [screen, inCrazyGames])

    useEffect(() => {
        if (multiplayerState?.connected && inCrazyGames) {

            // check if joined via invite link
            try {
                let code = window.CrazyGames.SDK.game.getInviteParam("code")
                let instantJoin = window.location.search.includes("instantJoin");



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
                        // handleMultiplayerAction("createPrivateGame")
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
                setScreen("multiplayer")
                setMultiplayerState((prev) => {

                    if (!data.duel) {
                        setMultiplayerChatEnabled(true)
                    }

                    try {
                        if (data.state === "waiting" && inCrazyGames && data.host) {
                            const link = window.CrazyGames.SDK.game.showInviteButton({ code: data.code });
                        } else {
                            window.CrazyGames.SDK.game.hideInviteButton();
                        }
                    } catch (e) { }

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

                if (data.state === "getready") {
                    setStreetViewShown(false)
                } else if (data.state === "guess") {
                    setStreetViewShown(true)
                }
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
        setStreetViewShown(false)
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
        setStreetViewShown(false)
        setShowAnswer(false)
        setPinPoint(null)
        setHintShown(false)
    }

    function loadLocation() {
        if (loading) return;

        console.log("loading location")
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
                    setLatLong(latLong)
                });
            }
            function fetchMethod() {
                //gameOptions.countryMap && gameOptions.offical
                const url = window.cConfig.apiUrl + ((gameOptions.location === "all") ? `/${window?.learnMode ? 'clue' : 'all'}Countries.json` :
                    gameOptions.countryMap && gameOptions.official ? `/countryLocations/${gameOptions.countryMap}` :
                        `/mapLocations/${gameOptions.location}`);
                console.log("fetching", url)
                fetch(url).then((res) => res.json()).then((data) => {
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

                        console.log("got locations", data.locations)

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
                    console.error(e)
                    toast(text("errorLoadingMap"), { type: 'error' })
                    defaultMethod()
                });
            }

            if (allLocsArray.length === 0) {
                fetchMethod()
            } else if (allLocsArray.length > 0) {
                const locIndex = allLocsArray.findIndex((l) => l.lat === latLong.lat && l.long === latLong.long);
                if ((locIndex === -1) || allLocsArray.length === 1) {
                    console.log("could not find location in array", locIndex, allLocsArray)
                    fetchMethod()
                } else {
                    if (gameOptions.location === "all") {
                        const loc = allLocsArray[locIndex + 1] ?? allLocsArray[0];
                        setLatLong(loc)
                    } else {
                        // prevent repeats: remove the prev location from the array
                        setAllLocsArray((prev) => {
                            const newArr = prev.filter((l) => l.lat !== latLong.lat && l.long !== latLong.long)


                            // community maps are randomized
                            const loc = newArr[Math.floor(Math.random() * newArr.length)];


                            setLatLong(loc)
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

    const ChatboxMemo = React.useMemo(() => <ChatBox miniMapShown={miniMapShown} ws={ws} open={multiplayerChatOpen} onToggle={() => setMultiplayerChatOpen(!multiplayerChatOpen)} enabled={
        session?.token?.secret && multiplayerChatEnabled && !process.env.NEXT_PUBLIC_COOLMATH
    }
        isGuest={session?.token?.secret ? false : true}
        publicGame={multiplayerState?.gameData?.public}
        myId={multiplayerState?.gameData?.myId} inGame={multiplayerState?.inGame} />, [multiplayerChatOpen, multiplayerChatEnabled, ws, multiplayerState?.gameData?.myId, multiplayerState?.inGame, multiplayerState?.gameData?.public, miniMapShown, session?.token?.secret])

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
    //   useEffect(() => {
    // //!(latLong && multiplayerState?.gameData?.state !== 'end')) || (!streetViewShown || loading || (showAnswer && !showPanoOnResult) ||  (multiplayerState?.gameData?.state === 'getready') || !latLong)
    //     // debug this condition:
    //     console.log("isHidden", !(latLong && multiplayerState?.gameData?.state !== 'end')) || (!streetViewShown || loading || (showAnswer && !showPanoOnResult) ||  (multiplayerState?.gameData?.state === 'getready') || !latLong)

    //     console.log("latLong", latLong)
    //     console.log("multiplayerState?.gameData?.state", multiplayerState?.gameData?.state)
    //     console.log("streetViewShown", streetViewShown)
    //     console.log("loading", loading)
    //     console.log("showAnswer", showAnswer)
    //     console.log("showPanoOnResult", showPanoOnResult)


    //   }, [latLong, multiplayerState?.gameData?.state, streetViewShown, loading, showAnswer, showPanoOnResult])


    return (
        <>
            <HeadContent text={text} inCoolMathGames={inCoolMathGames} inCrazyGames={inCrazyGames} />

            <AccountModal inCrazyGames={inCrazyGames} shown={accountModalOpen} session={session} setAccountModalOpen={setAccountModalOpen} eloData={eloData} accountModalPage={accountModalPage} setAccountModalPage={setAccountModalPage}
                friendModal={<FriendsModal ws={ws} shown={friendsModal} onClose={() => setFriendsModal(false)} session={session} canSendInvite={
                    // send invite if in a private multiplayer game, dont need to be host or in game waiting just need to be in a Party
                    multiplayerState?.inGame && !multiplayerState?.gameData?.public
                } sendInvite={sendInvite} />}
            />
            <SetUsernameModal shown={session && session?.token?.secret && !session.token.username} session={session} />
            <SuggestAccountModal shown={showSuggestLoginModal} setOpen={setShowSuggestLoginModal} />
            <DiscordModal shown={showDiscordModal} setOpen={setShowDiscordModal} />
            {/* <MerchModal shown={merchModal} onClose={() => setMerchModal(false)} session={session} /> */}
            {/*<LeagueModal shown={leagueModal} onClose={() => setLeagueModal(false)} session={session} eloData={eloData} />*/}
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

            {screen === "home" && !mapModal && !merchModal && !friendsModal && !accountModalOpen && !leagueModal && (
                <div className="home__footer">
                    <div className="footer_btns">
                        {!isApp && !inCoolMathGames && (
                            <>
                                <Link target="_blank" href={"https://discord.gg/ubdJHjKtrC"}><button className="g2_hover_effect home__squarebtn gameBtn g2_container discord" aria-label="Discord"><FaDiscord className="home__squarebtnicon" /></button></Link>

                                {!inCrazyGames && (
                                    <>
                                        <Link target="_blank" href={"https://www.youtube.com/@worldguessr?sub_confirmation=1"}><button className="g2_hover_effect home__squarebtn gameBtn g2_container youtube" aria-label="Youtube"><FaYoutube className="home__squarebtnicon" /></button></Link>
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
            )}

            <div style={{
                top: 0,
                left: 0,
                position: 'fixed',
                width: '100vw',
                height: '100vh',
                transition: 'opacity 0.5s',
                opacity: 0.5,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                pointerEvents: 'none',
            }}>
                <NextImage.default src={'./street2.jpg'}
                    draggable={false}
                    fill alt="Game Background" style={{
                        objectFit: "cover", userSelect: 'none',
                        backgroundSize: "cover",
                        backgroundPosition: "center"
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
                    showRoadLabels={screen === "onboarding" ? false : gameOptions?.showRoadName}
                    loading={loading}
                    setLoading={setLoading}
                    hidden={((!latLong || !latLong.lat || !latLong.long) || loading) || (
                        screen === "home" || (screen === "multiplayer" && (multiplayerState?.gameData?.state === "waiting" || multiplayerState?.enteringGameCode))
                    )}
                    onLoad={() => {
                        console.log("loaded")
                        setTimeout(() => {
                            setLoading(false)
                        }, 500)

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

                    inCoolMathGames={inCoolMathGames} maintenance={maintenance} inCrazyGames={inCrazyGames} loading={loading} onFriendsPress={() => { setAccountModalOpen(true); setAccountModalPage("friends"); }} loginQueued={loginQueued} setLoginQueued={setLoginQueued} inGame={multiplayerState?.inGame || screen === "singleplayer"} openAccountModal={() => { setAccountModalOpen(true); setAccountModalPage("profile"); }} session={session} reloadBtnPressed={reloadBtnPressed} backBtnPressed={backBtnPressed} setGameOptionsModalShown={setGameOptionsModalShown} onNavbarPress={() => onNavbarLogoPress()} gameOptions={gameOptions} screen={screen} multiplayerState={multiplayerState} shown={!multiplayerState?.gameData?.duel} />

                {/* reload button for public game */}
                {multiplayerState?.gameData?.duel && multiplayerState?.gameData?.state === "guess" && (
                    <div className="gameBtnContainer" style={{ position: 'fixed', top: '60px', left: '10px', zIndex: 1000000 }}>

                        <button className="gameBtn navBtn backBtn reloadBtn" onClick={() => reloadBtnPressed()}><FaArrowRotateRight /></button>
                    </div>
                )}

                {/* ELO/League button */}
                {screen === "home" && !mapModal && session && session?.token?.secret && (
                    <button className="gameBtn leagueBtn" onClick={() => { setAccountModalOpen(true); setAccountModalPage("profile"); }}
                    //                        style={{ backgroundColor: eloData?.league?.color }}
                    >
                        {!eloData ? '...' : animatedEloDisplay} ELO {eloData?.league?.emoji}
                    </button>
                )}

                <div className={`home__content g2_modal ${screen !== "home" ? "hidden" : "cshown"} `}>
                    <div className="g2_nav_ui" >


                        {onboardingCompleted === null ? (
                            <>

                            </>
                        ) : (
                            <>


                                {onboardingCompleted && (
                                    <h1 className="home__title g2_nav_title wg_font">WorldGuessr</h1>
                                )}



                                {onboardingCompleted && (

                                    <>

                                        <div className="g2_nav_hr"></div>
                                        <div className="g2_nav_group">
                                            <button className="g2_nav_text singleplayer"

                                                onClick={() => {
                                                    if (!loading) {
                                                        // setScreen("singleplayer")
                                                        crazyMidgame(() => setScreen("singleplayer"))
                                                    }
                                                }}>
                                                {text("singleplayer")}
                                            </button>
                                            {/* <span className="bigSpan">{text("playOnline")}</span> */}


                                            {session?.token?.secret && (
                                                <button className="g2_nav_text " onClick={() => handleMultiplayerAction("publicDuel")}
                                                    disabled={!multiplayerState.connected || maintenance}>{text("rankedDuel")}</button>
                                            )}
                                            <button className="g2_nav_text " onClick={() => handleMultiplayerAction("unrankedDuel")}
                                                disabled={!multiplayerState.connected || maintenance}>

                                                {
                                                    session?.token?.secret ? text("unrankedDuel") :
                                                        text("findDuel")

                                                }</button>
                                        </div>
                                        <div className="g2_nav_hr"></div>

                                        <div className="g2_nav_group">
                                            <button className="g2_nav_text" disabled={!multiplayerState.connected || maintenance} onClick={() => handleMultiplayerAction("createPrivateGame")}>{text("createGame")}</button>
                                            <button className="g2_nav_text" disabled={!multiplayerState.connected || maintenance} onClick={() => handleMultiplayerAction("joinPrivateGame")}>{text("joinGame")}</button>
                                        </div>

                                        <div className="g2_nav_hr"></div>

                                        <div className="g2_nav_group">
                                            {!process.env.NEXT_PUBLIC_COOLMATH &&
                                                <button className="g2_nav_text" aria-label="Community Maps" onClick={() => setMapModal(true)}>{text("communityMaps")}</button>}
                                        </div>

                                    </>
                                )}

                                <div style={{ marginTop: "20px" }}>
                                    <center>
                                        {false && !loading && screen === "home" && !inCrazyGames && !inCoolMathGames && (!session?.token?.supporter) && (
                                            <Ad inCrazyGames={inCrazyGames} screenH={height} types={[[320, 50], [728, 90], [970, 90], [970, 250]]} screenW={width} />
                                        )}
                                    </center>
                                </div>

                            </>
                        )}
                        <br />

                    </div>
                    <div className="g2_content"></div>
                </div>

                <InfoModal shown={false} />
                <MapsModal shown={mapModal || gameOptionsModalShown} session={session} onClose={() => { setMapModal(false); setGameOptionsModalShown(false) }} text={text}
                    customChooseMapCallback={(gameOptionsModalShown && screen === "singleplayer") ? (map) => {
                        console.log("map", map)
                        openMap(map.countryMap || map.slug);
                        setGameOptionsModalShown(false)
                    } : null}
                    showAllCountriesOption={(gameOptionsModalShown && screen === "singleplayer")}
                    showOptions={screen === "singleplayer"}
                    gameOptions={gameOptions} setGameOptions={setGameOptions} />

                <SettingsModal inCrazyGames={inCrazyGames} options={options} setOptions={setOptions} shown={settingsModal} onClose={() => setSettingsModal(false)} />



                {screen === "singleplayer" && <div className="home__singleplayer">
                    <GameUI
                        inCoolMathGames={inCoolMathGames}
                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
                        singlePlayerRound={singlePlayerRound} setSinglePlayerRound={setSinglePlayerRound} showDiscordModal={showDiscordModal} setShowDiscordModal={setShowDiscordModal} inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult} options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} xpEarned={xpEarned} setXpEarned={setXpEarned} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} latLong={latLong} streetViewShown={streetViewShown} setStreetViewShown={setStreetViewShown} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
                </div>}

                {screen === "onboarding" && onboarding?.round && <div className="home__onboarding">
                    <GameUI
                        inCoolMathGames={inCoolMathGames}

                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
                        inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult} countryGuesserCorrect={countryGuesserCorrect} setCountryGuesserCorrect={setCountryGuesserCorrect} showCountryButtons={showCountryButtons} setShowCountryButtons={setShowCountryButtons} otherOptions={otherOptions} onboarding={onboarding} countryGuesser={false} setOnboarding={setOnboarding} options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} xpEarned={xpEarned} setXpEarned={setXpEarned} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} latLong={latLong} streetViewShown={streetViewShown} setStreetViewShown={setStreetViewShown} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
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
                        <RoundOverScreen button1Text={text("home")} onboarding={onboarding} setOnboarding={setOnboarding} points={onboarding.points} time={msToTime(onboarding.timeTaken)} maxPoints={25000} button1Press={() => {
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


                <RoundOverScreen hidden={!(multiplayerState?.inGame && multiplayerState?.gameData?.state === 'end' && multiplayerState?.gameData?.duelEnd)} duel={true} data={multiplayerState?.gameData?.duelEnd} button1Text={text("playAgain")}

                    button1Press={() => {
                        backBtnPressed(true, "ranked")
                    }}

                    button2Text={text("home")}
                    button2Press={() => {
                        backBtnPressed()
                    }}
                />


                {screen === "multiplayer" && <div className="home__multiplayer">
                    <MultiplayerHome partyModalShown={partyModalShown} setPartyModalShown={setPartyModalShown} multiplayerError={multiplayerError} handleAction={handleMultiplayerAction} session={session} ws={ws} setWs={setWs} multiplayerState={multiplayerState} setMultiplayerState={setMultiplayerState} />
                </div>}

                {multiplayerState.inGame && ["guess", "getready", "end"].includes(multiplayerState.gameData?.state) && (
                    <GameUI
                        inCoolMathGames={inCoolMathGames}

                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
                        inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult} options={options} timeOffset={timeOffset} ws={ws} backBtnPressed={backBtnPressed} multiplayerChatOpen={multiplayerChatOpen} setMultiplayerChatOpen={setMultiplayerChatOpen} multiplayerState={multiplayerState} xpEarned={xpEarned} setXpEarned={setXpEarned} pinPoint={pinPoint} setPinPoint={setPinPoint} loading={loading} setLoading={setLoading} session={session} streetViewShown={streetViewShown} setStreetViewShown={setStreetViewShown} latLong={latLong} loadLocation={() => { }} gameOptions={{
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
            </main>
        </>
    )
}

