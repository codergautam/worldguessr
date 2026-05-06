import { initialMultiplayerState } from "@/components/multiplayer/MultiplayerProvider";
import sendEvent from "@/components/utils/sendEvent";
import gameStorage from "@/components/utils/localStorage";
import { navigate } from "@/lib/basePath";

export default function useMultiplayerHandlers(deps) {
    const {
        // state values
        ws,
        multiplayerState,
        inCrazyGames,
        loading,
        multiplayerError,
        screen,
        // helpers
        text,
        // refs
        pinPointRef,
        // setters
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
        // cross-bundle handlers (from useLocationHandlers)
        clearLocation,
        loadLocation,
    } = deps;

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
                    adError: () => adFinished(),
                    adStarted: () => console.log("Start midgame ad"),
                };
                window.CrazyGames.SDK.ad.requestAd("midgame", callbacks);
            } catch (e) {
                console.log("error requesting midgame ad", e)
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
                    console.log("End midgame ad");
                    cleanup();
                    adFinished();
                }
                function onStart() {
                    console.log("Start midgame ad");
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
                    console.log("CMG ad timeout, forcing resume");
                    cleanup();
                    adFinished();
                }, 15000);
            } catch (e) {
                console.log("error requesting midgame ad", e)
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
                        console.log("GD ad timeout, forcing resume");
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
                console.log("error requesting GD midgame ad", e);
                adFinished();
            }
        } else {
            adFinished()
        }
    }

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
                setMultiplayerChatEnabled(false)
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
                // crazyMidgame(afterBack);
                afterBack();
            } else {
                afterBack();
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

    return {
        handleMultiplayerAction,
        guessMultiplayer,
        sendInvite,
        reloadBtnPressed,
        crazyMidgame,
        backBtnPressed,
        onNavbarLogoPress,
    };
}
