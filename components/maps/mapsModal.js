import React, { useState, useEffect, useCallback, useRef } from "react";
import MapView from "./mapView";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { Modal } from "react-responsive-modal";
import { asset, localePath } from '@/lib/basePath';
// import { useMapSearch } from "../hooks/useMapSearch"; // REMOVED TO FIX DUPLICATE SEARCH CALLS - MapView handles search

const MAP_MODAL_ANIM_MS = 400;

const initMakeMap = {
    open: false,
    progress: false,
    name: "",
    description_short: "",
    description_long: "",
    data: "",
    edit: false,
    mapId: "",
};
export default function MapsModal({ gameOptions, mapModalClosing, setGameOptions, shown, onClose, onExitComplete, session, text, customChooseMapCallback, chosenMap, showAllCountriesOption, showOptions, showTimerOption, hideCountryGuessrModes }) {
    const [makeMap, setMakeMap] = useState(initMakeMap);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const exitOnceRef = useRef(false);

    useEffect(() => {
        if (!mapModalClosing) {
            exitOnceRef.current = false;
            return;
        }
        if (!onExitComplete) return;
        const id = window.setTimeout(() => {
            if (exitOnceRef.current) return;
            exitOnceRef.current = true;
            onExitComplete();
        }, MAP_MODAL_ANIM_MS);
        return () => window.clearTimeout(id);
    }, [mapModalClosing, onExitComplete]);

    // REMOVED: const { handleSearch } = useMapSearch(session, setSearchResults);
    // REMOVED: useEffect for handleSearch - MapView now handles all search logic to avoid duplicate API calls

    const handleMapClick = (map) => {
        if (customChooseMapCallback) {
            customChooseMapCallback(map);
        } else {
            // localePath keeps the /fr, /es, etc. prefix if the user is on a
            // locale route, so we go straight to /fr/map instead of /map (which
            // would then redirect back to /fr/map and bounce the user twice).
            window.location.href = `${localePath('/map')}?s=${map.slug}${window.location.search.includes("crazygames") ? "&crazygames=true" : ""}`;
        }
    };

    if (!shown) {
        return null;
    }

    return (
        <Modal
            classNames={{
                modal: "g2_modal map-modal-full",
                modalContainer: "map-modal-full-container",
                modalAnimationIn: "mapModalShellIn",
                modalAnimationOut: "mapModalShellOut",
                overlayAnimationIn: "mapModalOverlayIn",
                overlayAnimationOut: "mapModalOverlayOut",
            }}
            styles={{
                modal: styles.modalShell,
                modalContainer: styles.modalContainer,
                overlay: styles.overlayDisable // Disable library's overlay scroll behavior
            }}
            open={shown && !mapModalClosing}
            onClose={onClose}
            showCloseIcon={false}
            animationDuration={MAP_MODAL_ANIM_MS}
            blockScroll={false} // Critical: prevent library from blocking body scroll
            closeOnOverlayClick={true}
        >
            {/* Single scroll container: only this element scrolls on iOS */}
            <div className="g2_content map-modal-content full-width" style={styles.scrollWrap}>
                <div style={styles.modalContent}>
                    <MapView
                        showOptions={showOptions}
                        showTimerOption={showTimerOption}
                        showAllCountriesOption={showAllCountriesOption}
                        hideCountryGuessrModes={hideCountryGuessrModes}
                        chosenMap={chosenMap}
                        close={onClose}
                        session={session}
                        text={text}
                        onMapClick={handleMapClick}
                        gameOptions={gameOptions}
                        setGameOptions={setGameOptions}
                        makeMap={makeMap} setMakeMap={setMakeMap} initMakeMap={initMakeMap}
                        searchTerm={searchTerm} setSearchTerm={setSearchTerm}
                        searchResults={searchResults} setSearchResults={setSearchResults}
                    />
                </div>
                {/*<button style={styles.closeButton} onClick={onClose}>X</button>*/}
            </div>
        </Modal>
    );
}

const styles = {
    modalContainer: {
        overflow: "hidden",
        overflowY: "hidden",
        textAlign: "left",
    },
    overlayDisable: {
        overflow: "hidden",
        background: "rgba(0, 0, 0, 0.45)",
    },
    // Full-viewport modal wrapper - fixed container, no scrolling
    modalShell: {
        background: `linear-gradient(0deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 30, 15, 0.6) 100%), url("${asset('/street2.webp')}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        boxShadow: "none",
        padding: 0,
        margin: 0,
        width: "100%",
        maxWidth: "100%",
        height: "100vh",
        maxHeight: "100vh",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
        overflow: "hidden",
        position: "relative",
    },
    // Sole scrollable area - critical iOS fixes
    scrollWrap: {
        height: "100%", // Use 100% instead of 100vh to avoid iOS viewport issues
        width: "100%",
        overflowY: "scroll", // Force scroll instead of auto to prevent iOS boundary confusion
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y pinch-zoom", // Allow vertical pan and pinch
        overscrollBehavior: "contain",
        scrollbarGutter: "stable both-edges", // Prevent layout shift from scrollbar
        padding: "20px",
        position: "relative",
        zIndex: 1130,
        flex: "1 1 auto",
        minHeight: 0,
        minWidth: 0,
        boxSizing: "border-box",
        // iOS-specific boundary handling
        transform: "translateZ(0)", // Force hardware acceleration
        willChange: "scroll-position", // Optimize for scroll performance
    },
    // Content inside the scroll area - ensure it can be longer than container
    modalContent: {
        width: "100%",
        overflowY: "visible",
        overflowX: "hidden",
        paddingBottom: "40px",
        minHeight: "calc(100vh + 1px)", // Ensure content is always scrollable on iOS
        zIndex: 1130,
    },
};
