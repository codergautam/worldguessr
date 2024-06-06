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
import Loader from "@/components/loader";
import findLatLongRandom from "@/components/findLatLong";
import Link from "next/link";
import MultiplayerHome from "@/components/multiplayerHome";
import AccountModal from "@/components/accountModal";
import SetUsernameModal from "@/components/setUsernameModal";

const jockey = Jockey_One({ subsets: ['latin'], weight: "400", style: 'normal' });

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
    {
      connected: false,
      connecting: false,
      shouldConnect: false
    }
  );

  useEffect(() => {
    if (!ws && !multiplayerState.connecting && !multiplayerState.connected && multiplayerState.shouldConnect) {
      const wsPath = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/multiplayer`
      setMultiplayerState({
        ...multiplayerState,
        connecting: true,
        shouldConnect: false
      })
      const ws = new WebSocket(wsPath);
      ws.onopen = () => {
        setWs(ws)

        fetch("/api/getJWT").then((res) => res.json()).then((data) => {
          const JWT = data.jwt;
          ws.send(JSON.stringify({ type: "verify", jwt: JWT }))
        });
      }
      ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        switch (data.type) {
          case "cnt":
            setMultiplayerState({
              ...multiplayerState,
              playerCount: data.c
            })
            break;
          case "verify":
            console.log("Verified")
            setMultiplayerState({ connected: true, connecting: false })

        }
      }
    }

    if (ws && screen === "home") {
      ws.close();
      setWs(null);
      setMultiplayerState({
        connected: false,
        connecting: false,
        shouldConnect: false
      })
    }
  }, [multiplayerState, ws, screen])


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
      {/* <SetUsernameModal shown={session && session?.token?.secret && !session.token.username} session={session} /> */}

      <style>{`
       html * {
        overflow: hidden;
       }
       `}</style>

      <main className={`home ${jockey.className}`} id="main">
        <Loader loadingText="Loading..." shown={loading} />
        <Loader loadingText="Connecting..." shown={multiplayerState.connecting} />
        <div style={{ display: 'flex', alignItems: 'center', opacity: (screen !== "singleplayer") ? 1 : 0 }} className="accountBtnContainer">
          <AccountBtn session={session} openAccountModal={() => setAccountModalOpen(true)} />
        </div>
        <CesiumWrapper className={`cesium_${screen} ${screen !== "home" && !loading ? "cesium_hidden" : ""}`} />
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
                else setScreen("multiplayer-home")
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
          <GameUI countryStreak={countryStreak} setCountryStreak={setCountryStreak} xpEarned={xpEarned} setXpEarned={setXpEarned} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} latLong={latLong} setLatLong={setLatLong} streetViewShown={streetViewShown} setStreetViewShown={setStreetViewShown} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
        </div>}

        {screen === "multiplayer-home" && <div className="home__multiplayer">
          <MultiplayerHome session={session} ws={ws} setWs={setWs} multiplayerState={multiplayerState} setMultiplayerState={setMultiplayerState} />
        </div>}
      </main>
    </>
  )
}