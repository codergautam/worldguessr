import { FaArrowLeft, FaArrowRight } from "react-icons/fa6";
import { useTranslation } from "./useTranslations";
import Modal from "react-responsive-modal";
import MapsModal from "./maps/mapsModal";
import enforceMinMax from "./utils/enforceMinMax"
import gameSettingsOptions from "./gameSettingsOptions";

export default function PartyModal({ onClose, ws, setWs, multiplayerError, multiplayerState, setMultiplayerState, session, handleAction, gameOptions, setGameOptions, shown, setSelectCountryModalShown, selectCountryModalShown }){

const { t: text } = useTranslation("common");

if(selectCountryModalShown) {
  return (
    <MapsModal showAllCountriesOption={true} shown={selectCountryModalShown} onClose={() => setSelectCountryModalShown(false)} session={session} text={text} customChooseMapCallback={(map) => {
      setMultiplayerState(prev => ({ ...prev, createOptions: { ...prev.createOptions, location: map.countryMap || map.slug, displayLocation: map.name,

        nm: gameOptions?.nm,
        npz: gameOptions?.npz,
        showRoadName: gameOptions?.showRoadName,
       } }));
      setSelectCountryModalShown(false);
    }} chosenMap={multiplayerState?.createOptions?.location} showOptions={true} gameOptions={gameOptions} setGameOptions={setGameOptions} />

  )
}
return (
  <>
<Modal onClose={()=>{}} styles={{
            modal: {
                zIndex: 100,
                background: '#333',
                color: 'white',
                padding: '20px',
                borderRadius: '10px',
                fontFamily: "'Arial', sans-serif",
                maxWidth: '500px',
                textAlign: 'center',
                width: '50vw',
                height: '70vh',
            },
            closeButton: {
                display: 'none',
            },
        }} classNames={
          {
            modal:''
          }
        } open={shown} center>
  <div style={{ pointerEvents: 'all', alignContent: 'center', justifyContent: 'center', textAlign: 'center' }}>
    <span className="bigSpan">{text("editOptions")}</span>

    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
    <div className="inputContainer">

<label>{text("numOfRounds")}:</label>
<div className="numberInput rounds">
<FaArrowLeft onClick={() =>  setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, rounds: Math.max(1, Math.min(20, Number(multiplayerState.createOptions.rounds) - 1)) }}))} />
<input type="number" className='numberIn' placeholder={text("numOfRounds")}  max={20} min={1} onChange={(e) => enforceMinMax(e.target, ()=>setMultiplayerState(prev=>({...prev, createOptions: {...prev.createOptions, rounds: e.target.value}})))} value={multiplayerState.createOptions.rounds} />
<FaArrowRight onClick={() =>  setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, rounds: Math.max(1, Math.min(20, Number(multiplayerState.createOptions.rounds) + 1)) }}))} />
</div>
<div>
<label for="disableTimer">{text("disableTimer")}</label>
<input type="checkbox" id="disableTimer" className="disableTimer"
checked={multiplayerState.createOptions.timePerRound === 60*60*24}
  onChange={(e) => {
    setMultiplayerState((p) => ({
      ...p,
      createOptions: {
        ...p.createOptions,
        timePerRound: e.target.checked ? 60*60*24 : 60
      }
    }))
  }}
/>
</div>

<label>{text("timePerRoundSecs")}:</label>

{/* checkbox for no timer */}

{ multiplayerState.createOptions.timePerRound !== 60*60*24 && (
<div className="timePerRound numberInput">
<FaArrowLeft onClick={() => setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, timePerRound: Math.max(10, Math.min(300, Number(multiplayerState.createOptions.timePerRound) - 10)) }}))} />
<input type="number" className='numberIn' placeholder={text("timePerRoundSecs")} max={300} min={10} onChange={(e) => enforceMinMax(e.target, ()=>setMultiplayerState(prev=>({...prev, createOptions: {...prev.createOptions, timePerRound: e.target.value}})))} value={multiplayerState.createOptions.timePerRound} />
<FaArrowRight onClick={() =>  setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, timePerRound: Math.max(10, Math.min(300, Number(multiplayerState.createOptions.timePerRound) + 10)) }}))} />
</div>
)}

<label>

        {gameSettingsOptions({setGameOptions, gameOptions})}

</label>

<label>{text("map")}: {multiplayerState?.createOptions?.displayLocation || multiplayerState?.createOptions?.location }</label>

<button className="goBtn" onClick={() => setSelectCountryModalShown(true)} >{text("change")}</button>

<br/>

</div>
    <button className="gameBtn goBtn" style={{width: "auto"}} onClick={() => {
      setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, nm: gameOptions.nm, npz: gameOptions.npz, showRoadName: gameOptions.showRoadName } }))
      handleAction("setPrivateGameOptions", multiplayerState.createOptions)
      onClose()
      }} disabled={false}>
        {text("save")}

      </button>
      {/* <button className="gameBtn goBtn" style={{width: "auto"}} onClick={() => alert("cancel")} disabled={multiplayerState?.createOptions?.progress !== false}>
        {text("cancel")}

      </button> */}
    </div>
  </div>


  </Modal>

</>
)
}
