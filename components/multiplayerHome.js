import { useEffect, useState } from "react"
import BannerText from "./bannerText"
import { FaArrowLeft, FaArrowRight } from "react-icons/fa"
import enforceMinMax from "./utils/enforceMinMax"
import PlayerList from "./playerList";
import { useTranslation } from '@/components/useTranslations'
import sendEvent from "./utils/sendEvent";
import MapsModal from "./maps/mapsModal";


export default function MultiplayerHome({ ws, setWs, multiplayerError, multiplayerState, setMultiplayerState, session, handleAction }) {
  const { t: text } = useTranslation("common");

  const [selectCountryModalShown, setSelectCountryModalShown] = useState(false);

  if(multiplayerError) {
    return (
      <div className="multiplayerHome">
        <BannerText text={text("connectionLost")} shown={true} hideCompass={true} />
      </div>
    )
  }

  return (
    <div className="multiplayerHome">
        {/* <BannerText text={multiplayerState.error} shown={multiplayerState.error} hideCompass={true} /> */}

       { multiplayerState.connected && !multiplayerState.inGame && !multiplayerState.gameQueued && multiplayerState.enteringGameCode && !multiplayerState.creatingGame && (
      <div style={{ pointerEvents: 'all', alignContent: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <span className="bigSpan">{text("joinGame")}</span>

        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <input type="text" placeholder={text("gameCode")} value={multiplayerState.joinOptions.gameCode} maxLength={6} onChange={(e) => setMultiplayerState((prev) => ({ ...prev, joinOptions: {...prev.joinOptions, gameCode: e.target.value.replace(/\D/g, "") }}))} className="gameCodeInput" />
        <button className="gameBtn goBtn" disabled={multiplayerState?.joinOptions?.gameCode?.length !== 6 || multiplayerState?.joinOptions?.progress} style={{width: "auto"}} onClick={() => handleAction("joinPrivateGame", multiplayerState?.joinOptions?.gameCode)}>
        {text("go")}
        </button>
        </div>

        <p style={{color: "red", visibility:  multiplayerState?.joinOptions?.error ? "visible" : "hidden"}}>{multiplayerState?.joinOptions?.error}</p>
      </div>
      )}

{ multiplayerState.connected && !multiplayerState.inGame && !multiplayerState.gameQueued && !multiplayerState.enteringGameCode && multiplayerState.creatingGame && (
      <div style={{ pointerEvents: 'all', alignContent: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <span className="bigSpan">{text("createGame")}</span>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="inputContainer">

<label>{text("numOfRounds")}:</label>
<div className="numberInput rounds">
<FaArrowLeft onClick={() => !(multiplayerState?.createOptions?.progress !== false) && setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, rounds: Math.max(1, Math.min(20, Number(multiplayerState.createOptions.rounds) - 1)) }}))} />
<input type="number" disabled={multiplayerState?.createOptions?.progress !== false} className='numberIn' placeholder={text("numOfRounds")}  max={20} onChange={(e) => enforceMinMax(e.target, ()=>setMultiplayerState(prev=>({...prev, createOptions: {...prev.createOptions, rounds: e.target.value}})))} value={multiplayerState.createOptions.rounds} />
<FaArrowRight onClick={() => !(multiplayerState?.createOptions?.progress !== false) && setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, rounds: Math.max(1, Math.min(20, Number(multiplayerState.createOptions.rounds) + 1)) }}))} />
</div>

<label>{text("timePerRoundSecs")}:</label>
<div className="timePerRound numberInput">
<FaArrowLeft onClick={() => !(multiplayerState?.createOptions?.progress !== false) && setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, timePerRound: Math.max(1, Math.min(300, Number(multiplayerState.createOptions.timePerRound) - 10)) }}))} />
<input type="number" className='numberIn' disabled={multiplayerState?.createOptions?.progress !== false} placeholder={text("timePerRoundSecs")} max={300} onChange={(e) => enforceMinMax(e.target, ()=>setMultiplayerState(prev=>({...prev, createOptions: {...prev.createOptions, timePerRound: e.target.value}})))} value={multiplayerState.createOptions.timePerRound} />
<FaArrowRight onClick={() => !(multiplayerState?.createOptions?.progress !== false) && setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, timePerRound: Math.max(1, Math.min(300, Number(multiplayerState.createOptions.timePerRound) + 10)) }}))} />
</div>

<label>{text("map")}: {multiplayerState?.createOptions?.displayLocation || multiplayerState?.createOptions?.location }</label>
<button className="goBtn" onClick={() => setSelectCountryModalShown(true)} disabled={(multiplayerState?.createOptions?.progress !== false)}>{text("change")}</button>

<br/>

</div>
        <button className="gameBtn goBtn" style={{width: "auto"}} onClick={() => handleAction("createPrivateGame", multiplayerState.createOptions)} disabled={multiplayerState?.createOptions?.progress !== false}>
          { multiplayerState?.createOptions?.progress === false ? text("go") :
          multiplayerState?.createOptions?.progress === true ? `${text("creating")}...` :
           `${multiplayerState?.createOptions?.progress} / ${multiplayerState?.createOptions?.rounds}` }
          </button>
        </div>
      </div>
      )}
        <BannerText text={text("findingGame")} shown={multiplayerState.gameQueued} />
        <BannerText text={`${text("waiting")}...`} shown={multiplayerState.inGame && multiplayerState.gameData?.state === "waiting" && multiplayerState.gameData?.public} />

        { multiplayerState.inGame && multiplayerState.gameData?.state === "waiting" && !multiplayerState.gameData?.public && (
          <PlayerList multiplayerState={multiplayerState} startGameHost={() => handleAction("startGameHost")} />
        )}

        <MapsModal showAllCountriesOption={true} shown={selectCountryModalShown} onClose={() => setSelectCountryModalShown(false)} session={session} text={text} customChooseMapCallback={(map) => {
          setMultiplayerState(prev => ({ ...prev, createOptions: { ...prev.createOptions, location: map.countryMap || map.slug, displayLocation: map.name } }));
          setSelectCountryModalShown(false);
        }} chosenMap={multiplayerState?.createOptions?.location} />
    </div>
  )
}