import { useEffect, useState } from "react"
import BannerText from "./bannerText"

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
      { multiplayerState.connected && !multiplayerState.inGame && !multiplayerState.gameQueued && (
      <div style={{ pointerEvents: 'all' }}>
        <h1>Play Online</h1>
        <button className="gameBtn multiplayerOptionBtn publicGame" onClick={() => handleAction("publicDuel")}>Find a Duel</button>
        <br />
        <br />
        <h1>Play with Friends</h1>
        <button className="gameBtn multiplayerOptionBtn" style={{ marginBottom: "10px" }}>Create a Game</button>
        <button className="gameBtn multiplayerOptionBtn">Join a Game</button>
      </div>
      )}
        <BannerText text={"Finding a game..."} shown={multiplayerState.gameQueued} />
        <BannerText text={multiplayerState.error} shown={multiplayerState.error} />
        <BannerText text={"Waiting..."} shown={multiplayerState.inGame && multiplayerState.gameData?.state === "waiting"} />
    </div>
  )
}