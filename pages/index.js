import HeadContent from "@/components/headContent";
import CesiumWrapper from "../components/cesium/CesiumWrapper";
import { Jockey_One } from 'next/font/google';
import GameBtn from "@/components/ui/gameBtn";
import { FaDiscord, FaGithub, FaGoogle } from "react-icons/fa";
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

const jockey = Jockey_One({ subsets: ['latin'], weight: "400", style: 'normal' });

const initialMultiplayerState = {
    connected: false,
    connecting: false,
    shouldConnect: false,
    gameQueued: false,
    inGame: false,
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

  // multiplayer stuff
  const [ws, setWs] = useState(null);
  const [multiplayerState, setMultiplayerState] = useState(
    initialMultiplayerState
  );
  const [timeToNextMultiplayerEvt, setTimeToNextMultiplayerEvt] = useState(0);

  function handleMultiplayerAction(action) {
    if(!ws || !multiplayerState.connected || multiplayerState.gameQueued || multiplayerState.inGame) return;

    if(action === "publicDuel") {
    setMultiplayerState((prev) => ({
      ...prev,
      gameQueued: "publicDuel"
    }))
        ws.send(JSON.stringify({ type: "publicDuel" }))
    }

  }

  useEffect(() => {
    if (!ws && !multiplayerState.connecting && !multiplayerState.connected && multiplayerState.shouldConnect) {
      const wsPath = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/multiplayer`
console.log('connecting to websocket', wsPath)
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

    if (ws && screen === "home") {
      console.log("Closing websocket, home screen")
      ws.close();
      setWs(null);
      setMultiplayerState(initialMultiplayerState)
    }
  }, [multiplayerState, ws, screen])

  useEffect(() => {
    console.log("Multiplayer state changed", multiplayerState)
    if(!ws) return;
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);

      console.log("Received message", data)
      if(data.type === "cnt") {
        setMultiplayerState((prev) => ({
          ...prev,
          playerCount: data.c
        }))
      } else if(data.type === "verify") {
        setMultiplayerState((prev) => ({
          ...prev,
          connected: true,
          connecting: false
        }))
      } else if(data.type === "error") {
        setMultiplayerState((prev) => ({
          ...prev,
          connecting: false,
          connected: false,
          shouldConnect: false,
          error: data.message
        }))
        // disconnect
        ws.close();
      } else if(data.type === "game") {
        setMultiplayerState((prev) => ({
          ...prev,
          gameQueued: false,
          inGame: true,
          gameData: {
            ...prev.gameData,
            ...data,
            type: undefined
          }
        }))

        if(data.state === "getready") {
          setStreetViewShown(false)
        } else if(data.state === "guess") {
          setStreetViewShown(true)
        }
      } else if(data.type === "player") {
        if(data.action === "remove") {
          setMultiplayerState((prev) => ({
            ...prev,
            gameData: {
              ...prev.gameData,
              players: prev.gameData.players.filter((p) => p.id !== data.id)
            }
          }))
        } else if(data.action === "add") {
          setMultiplayerState((prev) => ({
            ...prev,
            gameData: {
              ...prev.gameData,
              players: [...prev.gameData.players, data.player]
            }
          }))
        }
      }
    }

    return () => {
      ws.onmessage = null;
    }
  }, [ws, multiplayerState]);

  useEffect(() => {

    const interval = setInterval(() => {
    if(multiplayerState.inGame && multiplayerState?.gameData?.nextEvtTime) {
      setTimeToNextMultiplayerEvt(Math.max(0,Math.floor((multiplayerState.gameData.nextEvtTime - Date.now()) / 100)/10))
    }
    }, 100)

    return () => {
      clearInterval(interval)
    }
  }, [multiplayerState])


  useEffect(() => {
    const streak = localStorage.getItem("countryStreak");
    if (streak) {
      setCountryStreak(parseInt(streak))
    }
  }, [])

  function backBtnPressed() {
    if (loading) setLoading(false)
    setScreen("home");
    clearLocation();
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
      loadLocation()
    }
  }

  return (
    <>
      <HeadContent />

      <AccountModal shown={accountModalOpen} session={session} setAccountModalOpen={setAccountModalOpen} />
      <SetUsernameModal shown={session && session?.token?.secret && !session.token.username} session={session} />

      <style>{`
       html * {
        overflow: hidden;
       }
       `}</style>

      <main className={`home ${jockey.className}`} id="main">
        <BannerText text="Loading..." shown={loading} />
        <BannerText text="Connecting..." shown={multiplayerState.connecting} />

        <div style={{ display: 'flex', alignItems: 'center', opacity: (screen !== "singleplayer") ? 1 : 0 }} className="accountBtnContainer">
          <AccountBtn session={session} openAccountModal={() => setAccountModalOpen(true)} />
        </div>
        <CesiumWrapper className={`cesium_${screen} ${(screen === "singleplayer"||(multiplayerState?.gameData?.state&&multiplayerState?.gameData?.state !== 'waiting')) && !loading ? "cesium_hidden" : ""}`} />
        <Navbar openAccountModal={() => setAccountModalOpen(true)} session={session} shown={screen !== "home"} backBtnPressed={backBtnPressed} setGameOptionsModalShown={setGameOptionsModalShown} onNavbarPress={() => onNavbarLogoPress()} gameOptions={gameOptions} screen={screen} multiplayerState={multiplayerState} />
        <div className={`home__content ${screen !== "home" ? "hidden" : ""}`}>

          <div className="home__ui">
            <h1 className="home__title">WorldGuessr</h1>
            <div className="home__btns">
              <GameBtn text="Singleplayer" onClick={() => {
                if (!loading) setScreen("singleplayer")
              }} />
              <GameBtn text="Multiplayer" onClick={() => {
                if (!session?.token?.secret) signIn("google");
                else setScreen("multiplayer")
              }} />
              <GameBtn text="How to Play" />

              <div className="home__squarebtns">
                <Link target="_blank" href={"https://github.com/codergautam/worldguessr"}><button className="home__squarebtn gameBtn"><FaGithub className="home__squarebtnicon" /></button></Link>
                <Link target="_blank" href={"https://discord.gg/ubdJHjKtrC"}><button className="home__squarebtn gameBtn"><FaDiscord className="home__squarebtnicon" /></button></Link>
                <Link href={"/leaderboard"}><button className="home__squarebtn gameBtn"><FaRankingStar className="home__squarebtnicon" /></button></Link>
              </div>
            </div>
          </div>
        </div>

        {screen === "singleplayer" && <div className="home__singleplayer">
          <GameUI countryStreak={countryStreak} setCountryStreak={setCountryStreak} xpEarned={xpEarned} setXpEarned={setXpEarned} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} latLong={latLong} streetViewShown={streetViewShown} setStreetViewShown={setStreetViewShown} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
        </div>}

        {screen === "multiplayer" && <div className="home__multiplayer">
          <MultiplayerHome handleAction={handleMultiplayerAction} session={session} ws={ws} setWs={setWs} multiplayerState={multiplayerState} setMultiplayerState={setMultiplayerState} />
        </div>}

        { multiplayerState.inGame && ["guess", "getready"].includes(multiplayerState.gameData?.state) && (
            <GameUI multiplayerState={multiplayerState} xpEarned={xpEarned} setXpEarned={setXpEarned} pinPoint={pinPoint} setPinPoint={setPinPoint} loading={loading} setLoading={setLoading} session={session} streetViewShown={streetViewShown} setStreetViewShown={setStreetViewShown} timeToNextMultiplayerEvt={timeToNextMultiplayerEvt} latLong={multiplayerState?.gameData?.locations ? multiplayerState.gameData.locations[multiplayerState.gameData.curRound-1] : null} loadLocation={() =>{}} gameOptions={{ location: "all", maxDist: 20000 }} setGameOptions={() => {}} />
        )}
      </main>
    </>
  )
}