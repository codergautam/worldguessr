import { toast } from "react-toastify";
import sendEvent from "@/components/utils/sendEvent";
import gameStorage from "@/components/utils/localStorage";
import shuffle from "@/utils/shuffle";
import clientConfig from "@/clientConfig";
import countries from "@/public/countries.json";
import officialCountryMaps from "@/public/officialCountryMaps.json";
import countryMaxDists from "@/public/countryMaxDists.json";
import { ALL_CONTINENTS } from "@/components/utils/continentFromCode";

export default function useLocationHandlers(deps) {
    const {
        // state values
        inCrazyGames,
        gameOptions,
        loading,
        screen,
        onboarding,
        countryGuessrMode,
        allLocsArray,
        latLong,
        // helpers
        text,
        // refs
        loadLocationRequestRef,
        // setters
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
    } = deps;

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
        console.log("[PERF] ========== Starting new round ==========");
        window.roundStartTime = performance.now();
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
                console.log("[PERF] loadLocation: Calling findLatLongRandom (dynamic import)");
                const startTime = performance.now();
                // Country/continent guesser can't tolerate Unknown-country spots.
                // With findCountry's local fallback, this rejection should rarely
                // fire (only for ocean / missing-polygon edge cases).
                const requireKnownCountry = screen === "countryGuesser" || (!!onboarding && onboarding?.mode !== "classic");
                const requireKnownContinent = (screen === "countryGuesser" && countryGuessrMode.subMode === "continent") ||
                    (!!onboarding && onboarding?.mode === "continent");
                try {
                    const mod = await import("@/components/findLatLong");
                    const findLatLongRandom = mod.default;
                    console.log(`[PERF] findLatLong module loaded in ${(performance.now() - startTime).toFixed(2)}ms`);
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
                const fetchStartTime = performance.now();
                console.log("[PERF] loadLocation: Starting fetch for locations");
                const url = config.apiUrl + ((gameOptions.location === "all") ? `/${window?.learnMode ? 'clue' : 'all'}Countries.json` :
                    gameOptions.countryMap && gameOptions.official ? `/countryLocations/${gameOptions.countryMap}` :
                        `/mapLocations/${gameOptions.location}`);
                fetch(url).then((res) => {
                    return res.json();
                }).then((data) => {
                    if (!isCurrentLocationLoad()) return;
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

    return {
        startOnboarding,
        openMap,
        cancelInFlightLocationLoad,
        setWorldMapOptions,
        enterCountryGuessrMode,
        clearLocation,
        loadLocation,
    };
}
