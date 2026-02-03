import React, { useState, useEffect, useCallback } from "react";
import MapView from "./mapView";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { Modal } from "react-responsive-modal";
// import { useMapSearch } from "../hooks/useMapSearch"; // REMOVED TO FIX DUPLICATE SEARCH CALLS - MapView handles search

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
export default function MapsModal({ gameOptions, mapModalClosing, setGameOptions, shown, onClose, session, text, customChooseMapCallback, chosenMap, showAllCountriesOption, showOptions }) {
    const [makeMap, setMakeMap] = useState(initMakeMap);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);

    // REMOVED: const { handleSearch } = useMapSearch(session, setSearchResults);
    // REMOVED: useEffect for handleSearch - MapView now handles all search logic to avoid duplicate API calls

    const handleMapClick = (map) => {
        if (customChooseMapCallback) {
            customChooseMapCallback(map);
        } else {
            window.location.href = `/map/${map.slug}${window.location.search.includes("crazygames") ? "&crazygames=true" : ""}`;
        }
    };

    if (!shown) {
        return null;
    }

    return (
        <Modal
            classNames={{ modal: "g2_modal" }}
            styles={{
                modal: styles.modalShell,
                overlay: styles.overlayDisable // Disable library's overlay scroll behavior
            }}
            open={shown}
            onClose={onClose}
            showCloseIcon={false}
            animationDuration={0}
            blockScroll={false} // Critical: prevent library from blocking body scroll
            closeOnOverlayClick={true}
        >
            <div className={`g2_nav_ui map-modal-sidebar ${mapModalClosing ? "g2_slide_out" : ""} desktop`}>
                <div className="g2_nav_hr desktop"></div>
                {/* {!makeMap.open && (
                    <>
                        <div className="mapSearch">
                            <input
                                type="text"
                                placeholder={text("searchForMaps")}
                                className="g2_input"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="g2_nav_hr"></div>
                    </>
                )} */}


                {!makeMap.open && (
                <div className="g2_nav_group map_categories">
                    <button className="g2_nav_text singleplayer comm_map_category_header"
                        onClick={() => document.getElementById("countryMaps_map_view_section")?.scrollIntoView({ behavior: 'smooth' })}
                    >{text("countryMaps")}</button>
                    <button className="g2_nav_text singleplayer comm_map_category_header"
                        onClick={() => document.getElementById("spotlight_map_view_section")?.scrollIntoView({ behavior: 'smooth' })}
                    >{text("spotlight")}</button>
                    <button className="g2_nav_text singleplayer comm_map_category_header"
                        onClick={() => document.getElementById("popular_map_view_section")?.scrollIntoView({ behavior: 'smooth' })}
                    >{text("popular")}</button>
                    <button className="g2_nav_text singleplayer comm_map_category_header"
                        onClick={() => document.getElementById("recent_map_view_section")?.scrollIntoView({ behavior: 'smooth' })}
                    >{text("recent")}</button>
                </div>
                )}
                <div className="g2_nav_hr"></div>
                {!makeMap.open && (

                <button className="g2_nav_text singleplayer red" onClick={onClose}>{text("back")}</button>
                )}
            </div>
            {/* Single scroll container: only this element scrolls on iOS */}
            <div className="g2_content map-modal-content" style={styles.scrollWrap}>
                <div style={styles.modalContent}>
                    <MapView
                    mapModalClosing={mapModalClosing}
                        showOptions={showOptions}
                        showAllCountriesOption={showAllCountriesOption}
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
    // Full-viewport modal wrapper - fixed container, no scrolling
    modalShell: {
        background: `linear-gradient(0deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 30, 15, 0.6) 100%), url("/street2.webp")`,
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
        scrollbarGutter: "stable", // Prevent layout shift from scrollbar
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
