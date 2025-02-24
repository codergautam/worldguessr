import React from "react";
import MapView from "./mapView";
import { useRouter } from "next/router";
import { Modal } from "react-responsive-modal";

export default function MapsModal({ gameOptions, setGameOptions, shown, onClose, session, text, customChooseMapCallback, chosenMap, showAllCountriesOption, showOptions }) {
    if (!shown) {
        return null;
    }

    const handleMapClick = (map) => {
        if (customChooseMapCallback) {
            customChooseMapCallback(map);
        } else {
            window.location.href = `/map?s=${map.slug}${window.location.search.includes("crazygames") ? "&crazygames=true" : ""}`;
        }
    };

    return (
        <Modal classNames={{ modal: "g2_modal" }} styles={{ modal: styles.overlay }} open={shown} onClose={onClose} showCloseIcon={false}>
            <div className="g2_nav_ui">
                <h1 className="g2_nav_title">{text("communityMaps")}</h1>
                <div className="g2_nav_hr"></div>
                <div className="g2_nav_group">
                    <button className="g2_nav_text singleplayer"
                        onClick={() => document.getElementById("countryMaps_map_view_section").scrollIntoView({ behavior: 'smooth' })}
                    >{text("countryMaps")}</button>
                    <button className="g2_nav_text singleplayer"
                        onClick={() => document.getElementById("spotlight_map_view_section").scrollIntoView({ behavior: 'smooth' })  }
                    >{text("spotlight")}</button>
                    <button className="g2_nav_text singleplayer"
                        onClick={() => document.getElementById("popular_map_view_section").scrollIntoView({ behavior: 'smooth' })}
                    >{text("popular")}</button>
                    <button className="g2_nav_text singleplayer"
                        onClick={() => document.getElementById("recent_map_view_section").scrollIntoView({ behavior: 'smooth' })}
                    >{text("recent")}</button>
                </div>
                <div className="g2_nav_hr"></div>
                <button className="g2_nav_text singleplayer red" onClick={onClose}>{text("back")}</button>
            </div>
            <div className="g2_content" style={styles.modal}>
                <div style={styles.modalContent}>
                    <MapView
                        showOptions={showOptions}
                        showAllCountriesOption={showAllCountriesOption}
                        chosenMap={chosenMap}
                        close={onClose}
                        session={session}
                        text={text}
                        onMapClick={handleMapClick}
                        gameOptions={gameOptions}
                        setGameOptions={setGameOptions}
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
        background: `linear-gradient(0deg, rgba(0, 0, 0, 1.0) 0%, rgba(0, 30, 15, 0.4) 100%), url("/street2.jpg")`,
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
        width: "100%",
        height: "100%",
        overflowY: "auto",
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
        paddingTop: "50px"
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
