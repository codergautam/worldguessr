import MapsModal from "@/components/maps/mapsModal";
import gameStorage from "@/components/utils/localStorage";

const MAP_MODAL_CLOSE_ANIMATION_MS = 400;

export default function HomeShellMapsModal({
    mapModal,
    gameOptionsModalShown,
    session,
    screen,
    gameOptions,
    setGameOptions,
    setMapModal,
    setGameOptionsModalShown,
    mapModalClosing,
    setMapModalClosing,
    setMapSwitchMaskShown,
    setMapSwitchSawLoading,
    cancelInFlightLocationLoad,
    setLoading,
    setLatLong,
    setShowAnswer,
    setShowCountryButtons,
    setScreen,
    enterCountryGuessrMode,
    openMap,
    countryGuessrMode,
    text,
}) {
    if (!(mapModal || gameOptionsModalShown)) return null;
    return <MapsModal shown={true} session={session} onClose={() => {
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
                    gameOptions={gameOptions} setGameOptions={setGameOptions} />;
}
