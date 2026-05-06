import { useEffect } from "react";
import { toast } from "react-toastify";
import { signOut } from "@/components/auth/auth";
import { initialMultiplayerState } from "@/components/multiplayer/MultiplayerProvider";
import gameStorage from "@/components/utils/localStorage";

export default function useWsMessageHandler(deps) {
    const {
        // subscriptions / connection
        subscribeMessages,
        ws,
        // state values read inside the effect
        multiplayerState,
        timeOffset,
        gameOptions,
        // helpers
        text,
        updateTimeOffsetFromSync,
        // refs
        timeSyncRef,
        // setters
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
    } = deps;

    useEffect(() => {
        if (!multiplayerState?.inGame && multiplayerState?.gameData?.duel) {

            setMultiplayerChatEnabled(false)
            setMultiplayerChatOpen(false)
        }

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
                        const roundLoc = (prev?.gameData?.locations ?? data.locations)?.[data.curRound - 1];
                        if (roundLoc) {
                            setLatLong(roundLoc)
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

                setMultiplayerState((prev) => {
                    if (!prev.gameData) return prev;
                    return {
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            duelEnd: data
                        }
                    };
                });
            } else if (data.type === "publicDuelRange") {
                setMultiplayerState((prev) => ({
                    ...prev,
                    publicDuelRange: data.range
                }))
            } else if (data.type === "maxDist") {
                const maxDist = data.maxDist;
                console.log("got new max dist", maxDist)
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
                const id = data.id;
                if (id === multiplayerState?.gameData?.myId) {
                    setMultiplayerChatEnabled(true)
                }

                const player = multiplayerState?.gameData?.players?.find((p) => p.id === id);
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
                setMultiplayerChatEnabled(false)

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
}
