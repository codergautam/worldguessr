import React from "react";
import MapView from "./mapView";
import { useRouter } from "next/router";

export default function MapsModal({ inLegacy, gameOptions, setGameOptions, shown, onClose, session, text, customChooseMapCallback, chosenMap, showAllCountriesOption, singleplayer }) {
    if (!shown) {
        return null;
    }

    const handleMapClick = (map) => {
        if (customChooseMapCallback) {
            customChooseMapCallback(map);
        } else {
            window.location.href = `/map/${map.slug}`;
        }
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <div style={styles.modalContent}>
                    <MapView
                        singleplayer={singleplayer}
                        showAllCountriesOption={showAllCountriesOption}
                        chosenMap={chosenMap}
                        close={onClose}
                        session={session}
                        text={text}
                        inLegacy={inLegacy||false}
                        onMapClick={handleMapClick}
                        gameOptions={gameOptions}
                        setGameOptions={setGameOptions}
                    />
                </div>
                <button style={styles.closeButton} onClick={onClose}>X</button>
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
    },
    modal: {
        backgroundColor: "#3A3B3C",
        width: "calc(100vw - 40px)",
        height: "100vh",
        overflowY: "auto",
        borderRadius: "8px",
        padding: "20px",
        position: "relative",
        pointerEvents: "all",
        zIndex: 1010,
    },
    modalContent: {
        width: "100%",
        height: "100%",
        overflowY: "auto",
        paddingBottom: "40px",

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
