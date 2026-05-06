import { useEffect } from "react";
import { toast } from "react-toastify";
import { fetchWithFallback } from "@/components/utils/retryFetch";
import sendEvent from "@/components/utils/sendEvent";
import gameStorage from "@/components/utils/localStorage";
import clientConfig from "@/clientConfig";
import { initialMultiplayerState } from "@/components/multiplayer/MultiplayerProvider";
import { getPlatform } from "@/components/utils/getPlatform";
import { isForbiddenIframe, inIframe } from "@/components/utils/inIframe";
import { stripBase } from "@/lib/basePath";
import { preloadPinImages } from "@/lib/markerIcons";
import countries from "@/public/countries.json";
import shuffle from "@/utils/shuffle";
import continentFromCode, { ALL_CONTINENTS } from "@/components/utils/continentFromCode";

export default function useHomeShellEffects(deps) {
    const {
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
        // ws + multiplayer
        ws,
        // handlers / external helpers
        startOnboarding,
        openMap,
        crazyMidgame,
        handleMultiplayerAction,
        isDailyPath,
        // other
        text,
        router,
    } = deps;

    // ===== ELO data initial fetch + animation cluster =====
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

    // ===== Big initialization effect (clientConfig + crazygames auth + onboarding finish) =====
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

    // ===== GameDistribution SDK initialization =====
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

    // ===== Onboarding init =====
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
            console.log("onboarding", onboarding, specifiedMapSlug)
            // make it false just for testing
            // gameStorage.setItem("onboarding", null)
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
        // setOnboardingCompleted(false)
    }, [])



    // ===== Pirated iframe / learn mode / map=slug entry =====
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

    // ===== Onboarding completion handling =====
    useEffect(() => {

        // check if learn mode
        if (window.location.search.includes("learn=true")) {
            setOnboardingCompleted(true)
        }


        if (onboardingCompleted === false) {
            if (onboardingCompleted === null) return;
            if (!loading) {

                // Start onboarding immediately so street view preloads, then show modal on top.
                // CrazyGames used to skip this branch, which started the tutorial without
                // letting players choose the onboarding mode.
                if (startOnboarding("classic")) {
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

    // ===== Language change router redirect =====
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

    // ===== Gameplay start/stop telemetry (CrazyGames + Poki) =====
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

    // ===== CrazyGames invite link / instant multiplayer =====
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

    // ===== Country streak load + preload pin images =====
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

    // ===== Expose crazyMidgame on window =====
    useEffect(() => {
        window.crazyMidgame = crazyMidgame;

    }, []);

    // ===== Country guesser country/continent option generator =====
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

    // ===== Pong heartbeat =====
    // Send pong every 10 seconds if websocket is connected
    useEffect(() => {
        const pongInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'pong' }));
            }
        }, 10000); // Send pong every 10 seconds

        return () => clearInterval(pongInterval);
    }, [ws]);

    // ===== Cheat detection =====
    useEffect(() => {
        function checkForCheats() {
            if (document.getElementById("coo1rdinates")) return true;
            if (document.getElementById("map-canvas")) return true;
            if (document.querySelector(".sgp-fab")) return true;
            if (document.getElementById("gmf-panel")) return true;
            if (document.getElementById("wg-helper-ui")) return true;
            if (document.getElementById("cgx-settings-panel")) return true;
            if (document.getElementById("cmTitle")) return true;
            try {
            if(window.localStorage.getItem("bannedv2")) return true;
            } catch(e) {
            }
            return false;
        }
        function banGame() {
            sendEvent("cheat_detected", {
                username: session?.token?.username || "Guest",
                secret: session?.token?.secret || "None"
            });
            // redirect to banned page
            window.localStorage.setItem("bannedv2", "true")


            // fetch("https://discord.com/api/webhooks/1236105403947945984/2XU0c0xOlo4yLEVfMxt97LOIxG1jiFcAhFbi7tW6E9t4Qiu9KYxPhSI3l3S303KbhUbg", {
            //     method: "POST",
            //     headers: {
            //         "Content-Type": "application/json"
            //     },
            //     body: JSON.stringify({
            //         content: `User ${session?.token?.secret} detected cheating` // todo: change useeffect to have session as a dep or else this is just undefined
            //     })
            // }).then(() => {
            //     console.log("Webhook sent")
            // window.location.href = navigate("/banned");

            // }).catch((err) => {
            //     console.error("Error sending webhook:", err)
            // window.location.href = navigate("/banned");

            // })


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
}
