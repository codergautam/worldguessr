import React, { useState, useEffect, useCallback } from "react";
import MapView from "./mapView";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { Modal } from "react-responsive-modal";

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

    const handleMapClick = (map) => {
        if (customChooseMapCallback) {
            customChooseMapCallback(map);
        } else {
            window.location.href = `/map?s=${map.slug}${window.location.search.includes("crazygames") ? "&crazygames=true" : ""}`;
        }
    };

    const debounce = (func, delay) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => func(...args), delay);
        };
    };

    const handleSearch = useCallback(
        debounce((term) => {
            if (term.length > 3 && !process.env.NEXT_PUBLIC_COOLMATH) {
                fetch(window.cConfig.apiUrl + "/api/map/searchMap", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ query: term, secret: session?.token?.secret }),
                })
                    .then((res) => res.json())
                    .then((data) => {
                        setSearchResults(data);
                    })
                    .catch(() => {
                        toast.error("Failed to search maps");
                    });
            } else {
                setSearchResults([]);
            }
        }, 300),
        []
    );

    useEffect(() => {
        handleSearch(searchTerm);
    }, [searchTerm, handleSearch]);

    if (!shown) {
        return null;
    }

    return (
        <Modal classNames={{ modal: "g2_modal" }} styles={{ modal: styles.overlay }} open={shown} onClose={onClose} showCloseIcon={false} animationDuration={0}>
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
                <div className="g2_nav_hr"></div>
                {!makeMap.open && (

                <button className="g2_nav_text singleplayer red" onClick={onClose}>{text("back")}</button>
                )}
            </div>
            <div className="g2_content map-modal-content" style={styles.modal}>
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
    overlay: {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: `linear-gradient(0deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 30, 15, 0.6) 100%), url("/street2.jpg")`,
        padding: 0,
        margin: 0,
        objectFit: "cover",
        backgroundSize: "cover",
        backgroundPosition: "center",
        zIndex: 1200,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
    },
    modal: {
        //backgroundColor: "#3A3B3C",
        //width: "100%",
        height: "100%",
        overflowY: "auto",
        padding: "20px",
        position: "relative",
        pointerEvents: "all",
        zIndex: 1130,
        width: "100%",
        WebkitOverflowScrolling: "touch",
       },
    modalContent: {
        width: "100%",
        overflowY: "auto",
        paddingBottom: "40px",
        overflowX: "hidden",
        zIndex: 1130,
        WebkitOverflowScrolling: "touch",
    },
    closeButton: {
        position: "absolute",
        top: "10px",
        right: "10px",
        background: "transparent",
        border: "none",
        fontSize: "20px",
        color: "#fff",
        cursor: "pointer",
    },
};
