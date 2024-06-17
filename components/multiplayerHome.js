import { useEffect, useState } from "react"
import BannerText from "./bannerText"
import { FaArrowLeft, FaArrowRight } from "react-icons/fa"
import enforceMinMax from "./utils/enforceMinMax"
import GameOptions from "./gameOptionsModal";
import PlayerList from "./playerList";

export default function MultiplayerHome({ ws, setWs, multiplayerState, setMultiplayerState, session, handleAction }) {


  const [selectCountryModalShown, setSelectCountryModalShown] = useState(false);

  useEffect(( ) => {

    if(multiplayerState?.joinOptions?.error) {
      setTimeout(() => {
        setMultiplayerState((prev) => ({ ...prev, joinOptions: { ...prev.joinOptions, error: null } }))
      }, 1000)
    }

  }, [multiplayerState?.joinOptions?.error]);

  useEffect(() => {
    if (!multiplayerState.connected && !ws && !multiplayerState.connecting && !multiplayerState.shouldConnect && !multiplayerState.error) {
      console.log("connecting to websocket")
      // setting shouldConnect to true will force home to initiate a connection
      setMultiplayerState((prev) => ({
        ...prev,
        shouldConnect: true,
        error: null
      }))
    }

    console.log("multiplayerState", multiplayerState)
  }, [multiplayerState, ws])
  return (
    <div className="multiplayerHome">
      { multiplayerState.connected && !multiplayerState.inGame && !multiplayerState.gameQueued && !multiplayerState.enteringGameCode && !multiplayerState.creatingGame && (
      <div style={{ pointerEvents: 'all' }}>
        <h1>Play Online</h1>
        <button className="gameBtn multiplayerOptionBtn publicGame" onClick={() => handleAction("publicDuel")}>Find a Duel</button>
        <br />
        <br />
        <h1>Play with Friends</h1>
        <button className="gameBtn multiplayerOptionBtn" onClick={() => handleAction("createPrivateGame")} style={{ marginBottom: "10px" }}>Create a Game</button>
        <button className="gameBtn multiplayerOptionBtn" onClick={() => handleAction("joinPrivateGame")}>Join a Game</button>
      </div>
      )}
       { multiplayerState.connected && !multiplayerState.inGame && !multiplayerState.gameQueued && multiplayerState.enteringGameCode && !multiplayerState.creatingGame && (
      <div style={{ pointerEvents: 'all', alignContent: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <h1>Join a Game</h1>

        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <input type="text" placeholder="Game Code" value={multiplayerState.joinOptions.gameCode} maxLength={6} onChange={(e) => setMultiplayerState((prev) => ({ ...prev, joinOptions: {...prev.joinOptions, gameCode: e.target.value.replace(/\D/g, "") }}))} className="gameCodeInput" />
        <button className="gameBtn goBtn" disabled={multiplayerState?.joinOptions?.gameCode?.length !== 6 || multiplayerState?.joinOptions?.progress} style={{width: "auto"}} onClick={() => handleAction("joinPrivateGame", multiplayerState?.joinOptions?.gameCode)}>
        Go
        </button>
        </div>

        <p style={{color: "red", visibility:  multiplayerState?.joinOptions?.error ? "visible" : "hidden"}}>{multiplayerState?.joinOptions?.error}</p>
      </div>
      )}

{ multiplayerState.connected && !multiplayerState.inGame && !multiplayerState.gameQueued && !multiplayerState.enteringGameCode && multiplayerState.creatingGame && (
      <div style={{ pointerEvents: 'all', alignContent: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <h1>Create a Game</h1>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="inputContainer">

<label>Number of rounds:</label>
<div className="numberInput rounds">
<FaArrowLeft onClick={() => !(multiplayerState?.createOptions?.progress !== false) && setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, rounds: Math.max(1, Math.min(20, Number(multiplayerState.createOptions.rounds) - 1)) }}))} />
<input type="number" disabled={multiplayerState?.createOptions?.progress !== false} className='numberIn' placeholder="Number of rounds"  max={20} onChange={(e) => enforceMinMax(e.target, ()=>setMultiplayerState(prev=>({...prev, createOptions: {...prev.createOptions, rounds: e.target.value}})))} value={multiplayerState.createOptions.rounds} />
<FaArrowRight onClick={() => !(multiplayerState?.createOptions?.progress !== false) && setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, rounds: Math.max(1, Math.min(20, Number(multiplayerState.createOptions.rounds) + 1)) }}))} />
</div>

<label>Time per round (seconds):</label>
<div className="timePerRound numberInput">
<FaArrowLeft onClick={() => !(multiplayerState?.createOptions?.progress !== false) && setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, timePerRound: Math.max(1, Math.min(300, Number(multiplayerState.createOptions.timePerRound) - 10)) }}))} />
<input type="number" className='numberIn' disabled={multiplayerState?.createOptions?.progress !== false} placeholder="Time per round (seconds)"  max={300} onChange={(e) => enforceMinMax(e.target, ()=>setMultiplayerState(prev=>({...prev, createOptions: {...prev.createOptions, timePerRound: e.target.value}})))} value={multiplayerState.createOptions.timePerRound} />
<FaArrowRight onClick={() => !(multiplayerState?.createOptions?.progress !== false) && setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, timePerRound: Math.max(1, Math.min(300, Number(multiplayerState.createOptions.timePerRound) + 10)) }}))} />
</div>

<label>Country: {multiplayerState?.createOptions?.location}</label>
<button className="goBtn" onClick={() => setSelectCountryModalShown(true)} disabled={(multiplayerState?.createOptions?.progress !== false)}>Change</button>

<br/>
<GameOptions setGameOptions={(p) => {
  setMultiplayerState(prev => ({ ...prev, createOptions: { ...prev.createOptions, location: p.location } }))
}} gameOptions={() => {
  return {
    location: multiplayerState.createOptions.location
  }
}} shown={selectCountryModalShown} onClose={() => setSelectCountryModalShown(false)} />

</div>
        <button className="gameBtn goBtn" style={{width: "auto"}} onClick={() => handleAction("createPrivateGame", multiplayerState.createOptions)} disabled={multiplayerState?.createOptions?.progress !== false}>
          { multiplayerState?.createOptions?.progress === false ? "Go" :
          multiplayerState?.createOptions?.progress === true ? "Creating..." :
           `${multiplayerState?.createOptions?.progress} / ${multiplayerState?.createOptions?.rounds}` }
          </button>
        </div>
      </div>
      )}
        <BannerText text={"Finding a game..."} shown={multiplayerState.gameQueued} />
        <BannerText text={multiplayerState.error} shown={multiplayerState.error} />
        <BannerText text={"Waiting..."} shown={multiplayerState.inGame && multiplayerState.gameData?.state === "waiting" && multiplayerState.gameData?.public} />

        { multiplayerState.inGame && multiplayerState.gameData?.state === "waiting" && !multiplayerState.gameData?.public && (
          <PlayerList multiplayerState={multiplayerState} startGameHost={() => handleAction("startGameHost")} />
        )}
    </div>
  )
}