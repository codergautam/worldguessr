import { useEffect, useState } from "react"
import BannerText from "./bannerText"
import { FaArrowLeft, FaArrowRight } from "react-icons/fa"
import PlayerList from "./playerList";
import { useTranslation } from '@/components/useTranslations'
import MapsModal from "./maps/mapsModal";
import PartyModal from "./partyModal";


export default function MultiplayerHome({ ws, setWs, multiplayerError, multiplayerState, setMultiplayerState, session, handleAction, partyModalShown, setPartyModalShown }) {

    const { t: text } = useTranslation("common");

    const [selectCountryModalShown, setSelectCountryModalShown] = useState(false);
    const [gameOptions, setGameOptions] = useState({
        showRoadName: true, // rate limit fix: showRoadName true
        nm: false,
        npz: false
    });


    useEffect(() => {
        setMultiplayerState((prev) => ({ ...prev, createOptions: { ...prev.createOptions, ...gameOptions } }));
    }, [gameOptions]);

    if (multiplayerError) {
        return (
            <div className="multiplayerHome">
                <BannerText position={"auto"} text={text("connectionLost")} shown={true} hideCompass={true} />
            </div>
        )
    }

    if (!((multiplayerState?.inGame) || (multiplayerState?.enteringGameCode) ||

        (multiplayerState?.gameQueued) || (multiplayerState?.nextGameQueued))) {
        return (
            <div className="multiplayerHome">
                <BannerText position={"auto"} text={text("connectionLost")} shown={true} hideCompass={true} />
            </div>
        )
    }

    return (
        <div className={`multiplayerHome g2_slide_in ${!["waiting", "end"].includes(multiplayerState?.gameData?.state) ? "inGame" : ""}`}>
            {/* <BannerText text={multiplayerState.error} shown={multiplayerState.error} hideCompass={true} /> */}

            {multiplayerState.connected && !multiplayerState.inGame && !multiplayerState.gameQueued && multiplayerState.enteringGameCode && (
                <div className="g2_container_light g2_container_style" style={{ pointerEvents: 'all', alignContent: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <span className="bigSpan" style={{ fontSize: "1.5em" }}>{text("joinGame")}</span>

                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                        <input style={{height: "100%"}} type="text" className="g2_input" placeholder={text("gameCode")} value={multiplayerState.joinOptions.gameCode} maxLength={6} onChange={(e) => setMultiplayerState((prev) => ({ ...prev, joinOptions: { ...prev.joinOptions, gameCode: e.target.value.replace(/\D/g, "") } }))} />
                        <button style={{ height: "100%", width: "auto" }} className="g2_green_button g2_button_style g2_shadow" disabled={multiplayerState?.joinOptions?.gameCode?.length !== 6 || multiplayerState?.joinOptions?.progress} onClick={() => handleAction("joinPrivateGame", multiplayerState?.joinOptions?.gameCode)}>
                            {text("go")}
                        </button>
                    </div>

                    <p style={{ color: "red", visibility: multiplayerState?.joinOptions?.error ? "visible" : "hidden" }}>{multiplayerState?.joinOptions?.error}</p>
                </div>
            )}


            <BannerText text={text("findingGame")} shown={multiplayerState.gameQueued} position={"auto"} subText={
                multiplayerState?.publicDuelRange ? `${text("eloRange")}: ${multiplayerState?.publicDuelRange[0]} - ${multiplayerState?.publicDuelRange[1]}` : undefined
            } />

            <BannerText  position={"auto"} text={`${text("waiting")}...`} shown={multiplayerState.inGame && multiplayerState.gameData?.state === "waiting" && multiplayerState.gameData?.public} />

            {multiplayerState.inGame && multiplayerState.gameData?.state === "waiting" && !multiplayerState.gameData?.public && (
                <PlayerList multiplayerState={multiplayerState} startGameHost={() => handleAction("startGameHost")} onEditClick={() => setPartyModalShown(true)} />
            )}

            <PartyModal selectCountryModalShown={selectCountryModalShown} setSelectCountryModalShown={setSelectCountryModalShown} ws={ws} setWs={setWs} multiplayerError={multiplayerError} multiplayerState={multiplayerState} setMultiplayerState={setMultiplayerState} session={session} handleAction={handleAction} gameOptions={gameOptions} setGameOptions={setGameOptions} onClose={() => setPartyModalShown(false)} shown={partyModalShown} />


        </div>
    )
}