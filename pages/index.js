import HeadContent from "@/components/headContent";
import CesiumWrapper from "../components/cesium/CesiumWrapper";
import { Jockey_One } from 'next/font/google';
import GameBtn from "@/components/ui/gameBtn";
import { FaDiscord, FaGithub, FaGoogle, FaInfo } from "react-icons/fa";
import { FaRankingStar } from "react-icons/fa6";
import { signIn, useSession } from "next-auth/react";
import AccountBtn from "@/components/ui/accountBtn";
import 'react-responsive-modal/styles.css';
import { useEffect, useState } from "react";
import Navbar from "@/components/ui/navbar";
import GameUI from "@/components/gameUI";
import BannerText from "@/components/bannerText";
import findLatLongRandom from "@/components/findLatLong";
import Link from "next/link";
import MultiplayerHome from "@/components/multiplayerHome";
import AccountModal from "@/components/accountModal";
import SetUsernameModal from "@/components/setUsernameModal";
import ChatBox from "@/components/chatBox";
import React from "react";
import countryMaxDists from '../public/countryMaxDists.json';
import InfoModal from "@/components/infoModal";
const jockey = Jockey_One({ subsets: ['latin'], weight: "400", style: 'normal' });
const initialMultiplayerState = {
  connected: false,
  connecting: false,
  shouldConnect: false,
  gameQueued: false,
  inGame: false,
  nextGameQueued: false,
  creatingGame: false,
  enteringGameCode: false,
  createOptions: {
    rounds: 5,
    timePerRound: 30,
    location: "all",
    progress: false
  },
  joinOptions: {
    gameCode: null,
    progress: false,
    error: false
  }
}

export default function Home() {
  const { data: session, status } = useSession();
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [screen, setScreen] = useState("home");
  const [loading, setLoading] = useState(false);
  // game state
  const [latLong, setLatLong] = useState({ lat: 0, long: 0 })
  const [streetViewShown, setStreetViewShown] = useState(false)
  const [gameOptionsModalShown, setGameOptionsModalShown] = useState(false);
  const [gameOptions, setGameOptions] = useState({ location: "all", maxDist: 20000 });
  const [showAnswer, setShowAnswer] = useState(false)
  const [pinPoint, setPinPoint] = useState(null)
  const [hintShown, setHintShown] = useState(false)
  const [xpEarned, setXpEarned] = useState(0)
  const [countryStreak, setCountryStreak] = useState(0)
  const [infoModal, setInfoModal] = useState(false)

  // multiplayer stuff
  const [ws, setWs] = useState(null);
  const [multiplayerState, setMultiplayerState] = useState(
    initialMultiplayerState
  );
  const [multiplayerChatOpen, setMultiplayerChatOpen] = useState(false);
  const [multiplayerChatEnabled, setMultiplayerChatEnabled] = useState(false);

  function handleMultiplayerAction(action, ...args) {
    console.log('hma', multiplayerState, action)
    if (!ws || !multiplayerState.connected || multiplayerState.gameQueued || multiplayerState.connecting) return;
    console.log('hma2', multiplayerState, action)

    if (action === "publicDuel") {
      setMultiplayerState((prev) => ({
        ...prev,
        gameQueued: "publicDuel",
        nextGameQueued: false
      }))
      console.log("Queueing public duel")
      ws.send(JSON.stringify({ type: "publicDuel" }))
    }

    if(action === "joinPrivateGame") {


    if(args[0]) {

      setMultiplayerState((prev)=>({
        ...prev,
        joinOptions: {
          ...prev.joinOptions,
          error: false,
          progress: true
        }
      }));
      // join private game
      ws.send(JSON.stringify({ type: "joinPrivateGame", gameCode: args[0] }))
    } else {
      setMultiplayerState((prev) => {
        return {
         ...initialMultiplayerState,
         connected: true,
         enteringGameCode: true,
         playerCount: prev.playerCount,
       }

     })
    }
    }

    if(action === "createPrivateGame") {
      if(!args[0]) {
      setMultiplayerState((prev) => {
       return {
        ...initialMultiplayerState,
        connected: true,
        creatingGame: true,
        playerCount: prev.playerCount,
      }
    })
  } else {
    setMultiplayerState((prev)=>({
      ...prev,
      createOptions: {
        ...prev.createOptions,
        progress: 0
      }
    }));
    const maxDist = args[0].location === "all" ? 20000 : countryMaxDists[args[0].location];
    console.log("maxDist", maxDist);

    (async () => {
      const locations = [];
      for(let i = 0; i < args[0].rounds; i++) {

        const loc = await findLatLongRandom({ location: multiplayerState.createOptions.location });
        locations.push(loc)
        setMultiplayerState((prev) => ({
          ...prev,
          createOptions: {
            ...prev.createOptions,
            progress: i + 1
          }
        }))
      }

      setMultiplayerState((prev) => ({
        ...prev,
        createOptions: {
          ...prev.createOptions,
          progress: true
        }
      }));

      // send ws
      ws.send(JSON.stringify({ type: "createPrivateGame", rounds: args[0].rounds, timePerRound: args[0].timePerRound, locations, maxDist }))
    })()
  }
    }

    console.log("action", multiplayerState?.inGame, multiplayerState?.gameData?.state, multiplayerState?.gameData?.host, multiplayerState?.gameData?.state === "waiting")
    if(action === 'startGameHost' && multiplayerState?.inGame && multiplayerState?.gameData?.host && multiplayerState?.gameData?.state === "waiting") {
      console.log("Starting game as host")
      ws.send(JSON.stringify({ type: "startGameHost" }))
    }


  }

  useEffect(() => {
    if (!ws && !multiplayerState.connecting && !multiplayerState.connected && multiplayerState.shouldConnect && !multiplayerState.error) {
      const wsPath = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/multiplayer`
      console.log('connecting to websocket', wsPath, multiplayerState)
      setMultiplayerState((prev) => ({
        ...prev,
        connecting: true,
        shouldConnect: false
      }))
      const ws = new WebSocket(wsPath);
      ws.onopen = () => {
        console.log("Websocket connected, fetching JWT")
        setWs(ws)

        fetch("/api/getJWT").then((res) => res.json()).then((data) => {
          console.log("Got JWT", data.jwt)
          const JWT = data.jwt;
          ws.send(JSON.stringify({ type: "verify", jwt: JWT }))
        });
      }

    }

    if (screen === "home") {
      console.log("Closing websocket, home screen")
      if (ws) {
        ws.close();
        setWs(null);
      }
      setMultiplayerState(initialMultiplayerState)
    }
  }, [multiplayerState, ws, screen])

  useEffect(() => {
    if(multiplayerState?.inGame && multiplayerState?.gameData?.state === "end") {
      // save the final players
      console.log('saving final player state')
      setMultiplayerState((prev) => ({
        ...prev,
        gameData: {
          ...prev.gameData,
          finalPlayers: prev.gameData.players
        }
      }))
    }
  }, [multiplayerState?.gameData?.state])

  useEffect(() => {
    console.log("Multiplayer state changed", multiplayerState)
    if(!multiplayerState?.inGame) {
      setMultiplayerChatEnabled(false)
      setMultiplayerChatOpen(false)
    }
    if (!ws) return;


    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);

      console.log("Received message", data)
      if (data.type === "cnt") {
        setMultiplayerState((prev) => ({
          ...prev,
          playerCount: data.c
        }))
      } else if (data.type === "verify") {
        setMultiplayerState((prev) => ({
          ...prev,
          connected: true,
          connecting: false
        }))
      } else if (data.type === "error") {
        setMultiplayerState((prev) => ({
          ...prev,
          connecting: false,
          connected: false,
          shouldConnect: false,
          error: data.message
        }))
        // disconnect
        ws.close();
      } else if (data.type === "game") {
        setMultiplayerState((prev) => {

          if (data.state === "getready") {
            setMultiplayerChatEnabled(true)
          } else if (data.state === "guess") {
            const didIguess = (data.players ?? prev.gameData?.players)?.find((p) => p.id === prev.gameData?.myId)?.final;
            if (didIguess) {
              setMultiplayerChatEnabled(true)
            } else {
              setMultiplayerChatEnabled(false)
            }
          }

          if ((!prev.gameData || (prev?.gameData?.state === "getready")) && data.state === "guess") {
            setPinPoint(null)
            if (!prev?.gameData?.locations && data.locations) {
              setLatLong(data.locations[data.curRound - 1])

            } else {
              setLatLong(prev?.gameData?.locations[data.curRound - 1])
            }
          }

          return {
            ...prev,
            gameQueued: false,
            inGame: true,
            gameData: {
              ...prev.gameData,
              ...data,
              type: undefined
            },
            enteringGameCode: false,
            creatingGame: false,
            joinOptions: initialMultiplayerState.joinOptions,
            createOptions: initialMultiplayerState.createOptions
          }
        })

        if (data.state === "getready") {
          setStreetViewShown(false)
        } else if (data.state === "guess") {
          setStreetViewShown(true)
        }
      } else if (data.type === "player") {
        if (data.action === "remove") {
          setMultiplayerState((prev) => ({
            ...prev,
            gameData: {
              ...prev.gameData,
              players: prev.gameData.players.filter((p) => p.id !== data.id)
            }
          }))
        } else if (data.action === "add") {
          setMultiplayerState((prev) => ({
            ...prev,
            gameData: {
              ...prev.gameData,
              players: [...prev.gameData.players, data.player]
            }
          }))
        }
      } else if (data.type === "place") {
        const id = data.id;
        if (id === multiplayerState.gameData.myId) {
          setMultiplayerChatEnabled(true)
        }

        const player = multiplayerState.gameData.players.find((p) => p.id === id);
        if (player) {
          player.final = data.final;
          player.latLong = data.latLong;
        }
      } else if (data.type === "gameOver") {
        setLatLong(null)

      } else if(data.type === "gameShutdown") {
        setMultiplayerState((prev) => {
          return {
            ...initialMultiplayerState,
            connected: true,
            nextGameQueued: prev.nextGameQueued
          }
        });
      } else if(data.type === "gameJoinError" && multiplayerState.enteringGameCode) {
        setMultiplayerState((prev) => {
          return {
            ...prev,
            joinOptions: {
              ...prev.joinOptions,
              error: data.error,
              progress: false
            }
          }
        })
      }
    }

    // ws on disconnect
    ws.onclose = () => {
      console.log("Websocket closed")
      setWs(null)
      setMultiplayerState((prev) => ({
        ...initialMultiplayerState,
        error: prev.error ?? "Connection lost"
      }));
    }


    return () => {
      ws.onmessage = null;
    }
  }, [ws, multiplayerState]);

  useEffect(() => {
    if(multiplayerState?.connected && !multiplayerState?.inGame && multiplayerState?.nextGameQueued) {
      handleMultiplayerAction("publicDuel");
    }
  }, [multiplayerState])


  // useEffect(() => {
  //   if (multiplayerState.inGame && multiplayerState.gameData?.state === "guess" && pinPoint) {
  //     // send guess
  //     console.log("pinpoint1", pinPoint)
  //     const pinpointLatLong = [pinPoint.lat, pinPoint.lng];
  //     ws.send(JSON.stringify({ type: "place", latLong: pinpointLatLong, final: false }))
  //   }
  // }, [multiplayerState, pinPoint])

  function guessMultiplayer(send) {
    if (!send) return;
    if (!multiplayerState.inGame || multiplayerState.gameData?.state !== "guess" || !pinPoint) return;
    const pinpointLatLong = [pinPoint.lat, pinPoint.lng];
    console.log("pinpoint2", pinPoint, pinpointLatLong)

    ws.send(JSON.stringify({ type: "place", latLong: pinpointLatLong, final: true }))
  }

  useEffect(() => {
    const streak = localStorage.getItem("countryStreak");
    if (streak) {
      setCountryStreak(parseInt(streak))
    }
  }, [])

  function backBtnPressed(queueNextGame = false) {
    if (loading) setLoading(false)
      if(multiplayerState?.inGame) {
        ws.send(JSON.stringify({
          type: 'leaveGame'
        }))

        setMultiplayerState((prev) =>{
          return {
            ...prev,
            nextGameQueued: queueNextGame === true
          }
        })

      } else if((multiplayerState?.creatingGame || multiplayerState?.enteringGameCode) && multiplayerState?.connected) {

        setMultiplayerState((prev) => {
          return {
          ...initialMultiplayerState,
          connected: true,
        playerCount: prev.playerCount

        }
      })
      } else {
    setScreen("home");
    clearLocation();
      }
  }

  function clearLocation() {
    setLatLong({ lat: 0, long: 0 })
    setStreetViewShown(false)
    setShowAnswer(false)
    setPinPoint(null)
    setHintShown(false)
  }

  function loadLocation() {
    setLoading(true)
    setShowAnswer(false)
    setPinPoint(null)
    setHintShown(false)
    findLatLongRandom(gameOptions).then((latLong) => {
      setLatLong(latLong)
      setTimeout(() => {
        setStreetViewShown(true)
        setTimeout(() => {
          setLoading(false)
        }, 100);
      }, 500);
    });
  }

  function onNavbarLogoPress() {
    if (screen !== "home" && !loading) {
      if(multiplayerState?.connected && !multiplayerState?.inGame) {
        return;
      }
      if(!multiplayerState?.inGame) loadLocation()
        else if(multiplayerState?.gameData?.state === "guess") {
          setLatLong(null)
          setLoading(true)
          setTimeout(() => {
            setLatLong(latLong)
            setLoading(false)
          }, 100);
        }
    }
  }

  const ChatboxMemo = React.useMemo(() => <ChatBox ws={ws} open={multiplayerChatOpen} onToggle={() => setMultiplayerChatOpen(!multiplayerChatOpen)} enabled={multiplayerChatEnabled} playerNames={multiplayerState?.gameData?.players.map(p => {
    return { id: p.id, username: p.username }
  })} myId={multiplayerState?.gameData?.myId} />, [multiplayerChatOpen, multiplayerChatEnabled, ws, multiplayerState?.gameData?.players.map(p => p.id).join(""), multiplayerState?.gameData?.myId])

  return (
    <>
      <HeadContent />

      <AccountModal shown={accountModalOpen} session={session} setAccountModalOpen={setAccountModalOpen} />
      <SetUsernameModal shown={session && session?.token?.secret && !session.token.username} session={session} />

  {ChatboxMemo}

      <main className={`home ${jockey.className}`} id="main">

        <BannerText text="Loading..." shown={loading && !(multiplayerState.error || multiplayerState.connecting)} />
        <BannerText text="Connecting..." shown={multiplayerState.connecting && !multiplayerState.error} />

        <div style={{ display: 'flex', alignItems: 'center', opacity: (screen !== "singleplayer") ? 1 : 0 }} className="accountBtnContainer">
          <AccountBtn session={session} openAccountModal={() => setAccountModalOpen(true)} />
        {/* <p style={{color: "white", zIndex: 10000}}>
          {
            JSON.stringify(session)
          }
          </p> */}
        </div>
        <CesiumWrapper className={`cesium_${screen} ${(screen === "singleplayer" || (multiplayerState?.gameData?.state && multiplayerState?.gameData?.state !== 'waiting')) && !loading ? "cesium_hidden" : ""}`} />
        <Navbar openAccountModal={() => setAccountModalOpen(true)} session={session} shown={screen !== "home"} backBtnPressed={backBtnPressed} setGameOptionsModalShown={setGameOptionsModalShown} onNavbarPress={() => onNavbarLogoPress()} gameOptions={gameOptions} screen={screen} multiplayerState={multiplayerState} />
        <div className={`home__content ${screen !== "home" ? "hidden" : ""}`}>

          <div className="home__ui">
            <h1 className="home__title">WorldGuessr</h1>
            <div className="home__btns">
              <GameBtn text="Singleplayer" onClick={() => {
                if (!loading) setScreen("singleplayer")
              }} />
              <GameBtn text="Multiplayer" onClick={() => {
                if (!session?.token?.secret && session === null) signIn("google");
                else if(!session?.token?.secret) return;
                else setScreen("multiplayer")
              }} />

              <div className="home__squarebtns">
                <Link target="_blank" href={"https://github.com/codergautam/worldguessr"}><button className="home__squarebtn gameBtn"><FaGithub className="home__squarebtnicon" /></button></Link>
                <Link target="_blank" href={"https://discord.gg/ubdJHjKtrC"}><button className="home__squarebtn gameBtn"><FaDiscord className="home__squarebtnicon" /></button></Link>
                <Link href={"/leaderboard"}><button className="home__squarebtn gameBtn"><FaRankingStar className="home__squarebtnicon" /></button></Link>
                <button className="home__squarebtn gameBtn" onClick={()=>setInfoModal(true)}><FaInfo className="home__squarebtnicon" /></button>
              </div>
            </div>
          </div>
        </div>

        <InfoModal shown={infoModal} onClose={()=>setInfoModal(false)} />

        {screen === "singleplayer" && <div className="home__singleplayer">
          <GameUI countryStreak={countryStreak} setCountryStreak={setCountryStreak} xpEarned={xpEarned} setXpEarned={setXpEarned} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} latLong={latLong} streetViewShown={streetViewShown} setStreetViewShown={setStreetViewShown} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
        </div>}

        {screen === "multiplayer" && <div className="home__multiplayer">
          <MultiplayerHome handleAction={handleMultiplayerAction} session={session} ws={ws} setWs={setWs} multiplayerState={multiplayerState} setMultiplayerState={setMultiplayerState} />
        </div>}

        {multiplayerState.inGame && ["guess", "getready", "end"].includes(multiplayerState.gameData?.state) && (
          <GameUI ws={ws} backBtnPressed={backBtnPressed} multiplayerChatOpen={multiplayerChatOpen} setMultiplayerChatOpen={setMultiplayerChatOpen} multiplayerState={multiplayerState} xpEarned={xpEarned} setXpEarned={setXpEarned} pinPoint={pinPoint} setPinPoint={setPinPoint} loading={loading} setLoading={setLoading} session={session} streetViewShown={streetViewShown} setStreetViewShown={setStreetViewShown} latLong={latLong} loadLocation={() => { }} gameOptions={{ location: "all", maxDist: 20000 }} setGameOptions={() => { }} showAnswer={(multiplayerState?.gameData?.curRound !== 1) && multiplayerState?.gameData?.state === 'getready'} setShowAnswer={guessMultiplayer} />
        )}
      </main>
    </>
  )
}