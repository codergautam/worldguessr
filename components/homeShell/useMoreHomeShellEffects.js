import { useEffect } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { toast } from "react-toastify";
import { fetchWithFallback } from "@/components/utils/retryFetch";
import clientConfig from "@/clientConfig";
import gameStorage from "@/components/utils/localStorage";
import { stripBase } from "@/lib/basePath";

export function useMoreHomeShellEffects(deps) {
    const {
        // state values
        options,
        session,
        initialScreen,
        awaitingCreatePartyScreen,
        screen,
        connectionErrorModalShown,
        multiplayerError,
        inCrazyGames,
        inCoolMathGames,
        inGameDistribution,
        showSuggestLoginModal,
        loading,
        showAnswer,
        countryGuessrMode,
        gameOptions,
        ws,
        multiplayerState,
        timeOffset,
        mapSwitchMaskShown,
        mapSwitchSawLoading,
        // refs
        statsRef,
        screenRef,
        prevScreenForUrlRef,
        lastSingleplayerScreen,
        countryGuessrLoadRecoveryRef,
        timeSyncRef,
        prevWsForCloseRef,
        textRef,
        // setters
        setScreen,
        setAwaitingCreatePartyScreen,
        setNavSlideOut,
        setSuggestLoginShowNeverAgain,
        setShowSuggestLoginModal,
        setInCoolMathGames,
        setSinglePlayerRound,
        setShowCountryButtons,
        setLoading,
        setAllLocsArray,
        setLatLong,
        setPendingCountryGuessrLoad,
        setTimeOffset,
        setMultiplayerState,
        setMultiplayerChatEnabled,
        setMultiplayerChatOpen,
        setMultiplayerError,
        setMapSwitchMaskShown,
        setMapSwitchSawLoading,
        setOptions,
        // handlers
        isDailyPath,
        cancelInFlightLocationLoad,
        setWorldMapOptions,
        sendTimeSync,
        handleMultiplayerAction,
    } = deps;

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

    useEffect(() => {
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
        loadOptions();
    }, [])

    useEffect(() => {
        const { ramUsage } = options;
        if (ramUsage) {
            if (!statsRef.current) {
                // Lazy-load stats.js — only debug users with the toggle on need it.
                import('stats.js').then(({ default: Stats }) => {
                    if (statsRef.current) return;
                    var stats = new Stats();
                    stats.showPanel(2); // 0: fps, 1: ms, 2: mb, 3+: custom
                    stats.dom.style.transform = "translate(10px, 150px)";
                    stats.dom.style.pointerEvents = "none";
                    document.body.appendChild(stats.dom);
                    statsRef.current = stats;
                });
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

    useEffect(() => {
        if (!awaitingCreatePartyScreen) return;

        if (screen !== "home" || connectionErrorModalShown || multiplayerError) {
            setAwaitingCreatePartyScreen(false);
            setNavSlideOut(false);
            return;
        }

        // If backend/game creation stalls, restore home nav so the user isn't stuck on a hidden menu.
        const restoreHomeNavTimeout = setTimeout(() => {
            setAwaitingCreatePartyScreen(false);
            setNavSlideOut(false);
        }, 12000);

        return () => clearTimeout(restoreHomeNavTimeout);
    }, [awaitingCreatePartyScreen, screen, connectionErrorModalShown, multiplayerError]);

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
        if (prevWsForCloseRef.current && !ws) {
            setMultiplayerChatEnabled(false);
            setMultiplayerChatOpen(false);
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
        if (multiplayerState?.connected && !multiplayerState?.inGame && multiplayerState?.nextGameQueued) {
            // handleMultiplayerAction("publicDuel");
            if (multiplayerState?.nextGameType === "ranked") {
                handleMultiplayerAction("publicDuel")
            } else if (multiplayerState?.nextGameType === "unranked") {
                handleMultiplayerAction("unrankedDuel")
            }
        }
    }, [multiplayerState, timeOffset])
}

export function useHomeShellGoogleLogin(deps) {
    const { setSession, setLoginQueued } = deps;
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
    return login;
}
