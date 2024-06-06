import { useEffect, useState } from "react"

export default function MultiplayerHome({ ws, setWs, multiplayerState, setMultiplayerState, session }) {

  useEffect(() => {
    if(!multiplayerState.connected && !ws && !multiplayerState.connecting && !multiplayerState.shouldConnect) {
      console.log("connecting to websocket")
      // setting shouldConnect to true will force home to initiate a connection
      setMultiplayerState({
        ...multiplayerState,
        shouldConnect: true
      })
    }
  }, [multiplayerState, ws])
  return (
    <div className="multiplayerHome">

    </div>
  )
}