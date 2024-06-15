import { useEffect, useState } from "react"
import BannerText from "./bannerText"
import { FaArrowLeft, FaArrowRight } from "react-icons/fa"
import enforceMinMax from "./utils/enforceMinMax"

export default function MultiplayerHome({ ws, setWs, multiplayerState, setMultiplayerState, session, handleAction }) {


  useEffect(() => {
    if (!multiplayerState.connected && !ws && !multiplayerState.connecting && !multiplayerState.shouldConnect) {
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
        <button className="gameBtn goBtn" disabled={multiplayerState?.joinOptions?.gameCode?.length !== 6} style={{width: "auto"}} onClick={() => handleAction("joinPrivateGame", multiplayerState?.joinOptions?.gameCode)}>Go</button>
        </div>
      </div>
      )}

{ multiplayerState.connected && !multiplayerState.inGame && !multiplayerState.gameQueued && !multiplayerState.enteringGameCode && multiplayerState.creatingGame && (
      <div style={{ pointerEvents: 'all', alignContent: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <h1>Create a Game</h1>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="inputContainer">

<label>Number of rounds:</label>
<div className="numberInput rounds">
<FaArrowLeft onClick={() => setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, rounds: Math.max(1, multiplayerState.createOptions.rounds - 1) }}))} />
<input type="number" className='numberIn' placeholder="Number of rounds"  max={20} onChange={(e) => enforceMinMax(e.target, ()=>setMultiplayerState(prev=>({...prev, createOptions: {...prev.createOptions, rounds: e.target.value}})))} disabled={multiplayerState?.loading} value={multiplayerState.createOptions.rounds} />
<FaArrowRight onClick={() => setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, rounds: Math.max(1, multiplayerState.createOptions.rounds + 1) }}))} />
</div>

<label>Time per round (seconds):</label>
<div className="timePerRound numberInput">
<FaArrowLeft onClick={() => setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, timePerRound: Math.max(1, multiplayerState.createOptions.timePerRound - 10) }}))} />
<input type="number" className='numberIn' placeholder="Time per round (seconds)"  max={300} onChange={(e) => enforceMinMax(e.target, ()=>setMultiplayerState(prev=>({...prev, createOptions: {...prev.createOptions, timePerRound: e.target.value}})))} disabled={multiplayerState?.loading} value={multiplayerState.createOptions.timePerRound} />
<FaArrowRight onClick={() => setMultiplayerState(prev => ({ ...prev, createOptions: {...prev.createOptions, timePerRound: Math.max(1, multiplayerState.createOptions.timePerRound + 10) }}))} />
</div>

</div>
        <button className="gameBtn goBtn" style={{width: "auto"}} onClick={() => handleAction("createPrivateGame", multiplayerState.createOptions)}>Go</button>
        </div>
      </div>
      )}
        <BannerText text={"Finding a game..."} shown={multiplayerState.gameQueued} />
        <BannerText text={multiplayerState.error} shown={multiplayerState.error} />
        <BannerText text={"Waiting..."} shown={multiplayerState.inGame && multiplayerState.gameData?.state === "waiting"} />
    </div>
  )
}