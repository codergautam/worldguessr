import { useMemo } from "react";
import { FaArrowLeft, FaArrowRight } from "react-icons/fa6";
import Modal from "react-responsive-modal";
import MapsModal from "./maps/mapsModal";
import { useTranslation } from "./useTranslations";
import enforceMinMax from "./utils/enforceMinMax";

export default function PartyModal({ onClose, ws, setWs, multiplayerError, multiplayerState, setMultiplayerState, session, handleAction, gameOptions, setGameOptions, shown, setSelectCountryModalShown, selectCountryModalShown }) {

    const { t: text } = useTranslation("common");


    const handleRoundTimeChange = (e) => {
        setMultiplayerState(prev => ({ ...prev, createOptions: { ...prev.createOptions, timePerRound: e.target.value } }));
    };

    const isValidRoundTime = !isNaN(multiplayerState.createOptions.timePerRound) && multiplayerState.createOptions.timePerRound >= 10 && multiplayerState.createOptions.timePerRound <= 300;

    if (selectCountryModalShown) {
        return (
            <MapsModal showAllCountriesOption={true} shown={selectCountryModalShown} onClose={() => setSelectCountryModalShown(false)} session={session} text={text} customChooseMapCallback={(map) => {
                console.log(map, gameOptions)
                setMultiplayerState(prev => ({
                    ...prev, createOptions: {
                        ...prev.createOptions, location: map.countryMap || map.slug, displayLocation: map.name,

                        nm: gameOptions?.nm,
                        npz: gameOptions?.npz,
                        showRoadName: gameOptions?.showRoadName,
                    }
                }));
                setSelectCountryModalShown(false);
            }} chosenMap={multiplayerState?.createOptions?.location} showOptions={true} gameOptions={gameOptions} setGameOptions={setGameOptions} />

        )
    }
    return (
        <>
            <Modal onClose={() => { }} styles={{
                modal: {
                    zIndex: 100,
                    background: '#222',
                    color: 'white',
                    padding: '20px',
                    borderRadius: '50px',
                    fontFamily: "'Arial', sans-serif",
                    maxWidth: '500px',
                    textAlign: 'center',
                    width: '50vw',
                    height: 'auto',
                },
                closeButton: {
                    display: 'none',
                },
            }} classNames={
                {
                    modal: 'g2_container_harsh g2_slide_in party-modal-responsive'
                }
            } open={shown} center>
                <div style={{ display: "flex", flexDirection: "column", pointerEvents: 'all', alignContent: 'center', justifyContent: 'center', textAlign: 'center', gap: "10px" }}>
                    <span className="bigSpan">{text("editOptions")}</span>
                    <div className="g2_nav_hr"></div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: "4px" }}>
                        <div className="inputContainer">

                            <label>{text("numOfRounds")}:</label>
                            <div className="numberInput rounds">
                                <FaArrowLeft onClick={() => setMultiplayerState(prev => ({ ...prev, createOptions: { ...prev.createOptions, rounds: Math.max(1, Math.min(20, Number(multiplayerState.createOptions.rounds) - 1)) } }))} />
                                <input type="number" className='numberIn' placeholder={text("numOfRounds")} max={20} min={1} onChange={(e) => enforceMinMax(e.target, () => setMultiplayerState(prev => ({ ...prev, createOptions: { ...prev.createOptions, rounds: e.target.value } })))} value={multiplayerState.createOptions.rounds} />
                                <FaArrowRight onClick={() => setMultiplayerState(prev => ({ ...prev, createOptions: { ...prev.createOptions, rounds: Math.max(1, Math.min(20, Number(multiplayerState.createOptions.rounds) + 1)) } }))} />
                                <div>
                                    <label htmlFor="disableTimer">{text('disableTimer')}</label>
                                    <input
                                        id="disableTimer"
                                        type="checkbox"
                                        checked={multiplayerState?.createOptions?.timePerRound === 60 * 60 * 24}
                                        onChange={(e) => {
                                            const isChecked = e.target.checked;
                                            setMultiplayerState(prev => ({
                                                ...prev,
                                                createOptions: {
                                                    ...prev.createOptions,
                                                    timePerRound: isChecked ? 60 * 60 * 24 : Math.max(10, Math.min(300, prev.createOptions.timePerRound))
                                                }
                                            }));
                                        }}
                                    />
                                </div>


                                {multiplayerState?.createOptions?.timePerRound !== 60 * 60 * 24 && (
                                    <>
                                        <label>{text("timePerRoundSecs")}:</label>
                                        <div className="timePerRound numberInput">
                                            <FaArrowLeft onClick={() => setMultiplayerState(prev => ({ ...prev, createOptions: { ...prev.createOptions, timePerRound: Math.max(10, Math.min(300, Number(multiplayerState.createOptions.timePerRound) - 10)) } }))} />
                                            <input type="number" className='numberIn' placeholder={text("timePerRoundSecs")} min={1} max={300}
                                                value={multiplayerState.createOptions.timePerRound}
                                                onChange={handleRoundTimeChange}
                                            />
                                            <FaArrowRight onClick={() => setMultiplayerState(prev => ({ ...prev, createOptions: { ...prev.createOptions, timePerRound: Math.max(10, Math.min(300, Number(multiplayerState.createOptions.timePerRound) + 10)) } }))} />
                                        </div>
                                        {!isValidRoundTime && <div style={{ color: 'red' }}>{text("timePerRoundError")}</div>}
                                    </>
                                )}
                                <div className="g2_nav_hr"></div>
                                <label>

                                    <div style={{ display: "flex", gap: "10px", flexDirection: 'column', alignItems: 'center', marginBottom: '5px', marginTop: '5px' }}>
                                        <div>
                                            <label htmlFor="nm">{text('nm')}</label>
                                            <input type="checkbox" checked={gameOptions.nm}
                                                id="nm"
                                                name="nm"
                                                onChange={(e) => {
                                                    setGameOptions({
                                                        ...gameOptions,
                                                        nm: e.target.checked
                                                    })
                                                }
                                                } />
                                        </div>
                                        <div>
                                            <label htmlFor="npz">{text('npz')}</label>
                                            <input id="npz"
                                                name="npz"
                                                type="checkbox" checked={gameOptions.npz} onChange={(e) => {
                                                    setGameOptions({
                                                        ...gameOptions,
                                                        npz: e.target.checked
                                                    })
                                                }
                                                } />
                                        </div>
                                        <div>
                                            <label htmlFor="showRoadName" >{text('showRoadName')}</label>
                                            <input id="showRoadName"
                                                name="showRoadName"
                                                type="checkbox" checked={gameOptions.showRoadName} onChange={(e) => {
                                                    setGameOptions({
                                                        ...gameOptions,
                                                        showRoadName: e.target.checked
                                                    })
                                                }
                                                } />
                                        </div>
                                    </div>

                                </label>

                                <div style={{ display: "flex", gap: "10px" }} className="g2_center">
                                    <label>{text("map")}: {multiplayerState?.createOptions?.displayLocation || multiplayerState?.createOptions?.location}</label>

                                    <button className="g2_green_button2 g2_button_style" onClick={() => setSelectCountryModalShown(true)} >{text("change")}</button>
                                </div>
                                <br />

                            </div>
                            <div className="g2_nav_hr"></div>
                            <button className="g2_green_button2 g2_button_style" style={{ width: "auto" }} onClick={() => {
                                setMultiplayerState(prev => ({ ...prev, createOptions: { ...prev.createOptions, nm: gameOptions.nm, npz: gameOptions.npz, showRoadName: gameOptions.showRoadName } }))
                                handleAction("setPrivateGameOptions", multiplayerState.createOptions)
                                onClose()
                            }} disabled={!isValidRoundTime}>
                                {text("save")}

                            </button>
                            {/* <button className="gameBtn goBtn" style={{width: "auto"}} onClick={() => alert("cancel")} disabled={multiplayerState?.createOptions?.progress !== false}>
        {text("cancel")}

      </button> */}
                        </div>
                    </div>
                </div>

            </Modal>

        </>
    )
}