import { useEffect, useState } from "react"
import BannerText from "./bannerText"
import { FaArrowLeft, FaArrowRight } from "react-icons/fa"

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
        <input type="text" placeholder="Game Code" value={multiplayerState.gameCode} onChange={(e) => setMultiplayerState((prev) => ({ ...prev, gameCode: e.target.value }))} className="gameCodeInput" />
        <button className="gameBtn goBtn" style={{width: "auto"}} onClick={() => handleAction("joinPrivateGame")}>Go</button>
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
<FaArrowLeft/>
<input type="number" className='numberIn' placeholder="Number of rounds"  max={20}/>
<FaArrowRight  />
</div>

<label>Time per round (seconds):</label>
<div className="timePerRound numberInput">
<FaArrowLeft  />
<input type="number" className='numberIn' placeholder="Time per round (seconds)"  max={300} />
<FaArrowRight  />
</div>
</div>
        <button className="gameBtn goBtn" style={{width: "auto"}} onClick={() => handleAction("joinPrivateGame")}>Go</button>
        </div>
      </div>
      )}
        <BannerText text={"Finding a game..."} shown={multiplayerState.gameQueued} />
        <BannerText text={multiplayerState.error} shown={multiplayerState.error} />
        <BannerText text={"Waiting..."} shown={multiplayerState.inGame && multiplayerState.gameData?.state === "waiting"} />
    </div>
  )
}