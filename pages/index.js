import HeadContent from "@/components/headContent";
import CesiumWrapper from "../components/cesium/CesiumWrapper";
import { Jockey_One, Roboto } from 'next/font/google';
import GameBtn from "@/components/ui/gameBtn";
import { FaDiscord, FaGithub, FaGoogle, FaInfo } from "react-icons/fa";
import { FaGear, FaRankingStar } from "react-icons/fa6";
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
import WelcomeModal from "@/components/welcomeModal";
// import text from "@/languages/lang";
import { useTranslation } from 'next-i18next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import useWindowDimensions from "@/components/useWindowDimensions";
import dynamic from "next/dynamic";
import Ad from "@/components/bannerAd";
import Script from "next/script";
import SettingsModal from "@/components/settingsModal";

// const Ad = dynamic(() => import('@/components/bannerAd'), { ssr: false });

// import Image from "next/image";
const jockey = Jockey_One({ subsets: ['latin'], weight: "400", style: 'normal' });
const roboto = Roboto({ subsets: ['cyrillic'], weight: "400", style: 'normal' });
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

export default function Home({ locale }) {
  const { width, height } = useWindowDimensions();

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
  const [settingsModal, setSettingsModal] = useState(false)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const [timeOffset, setTimeOffset] = useState(0)
  const [loginQueued, setLoginQueued] = useState(false);
  const [options, setOptions] = useState({
  });

  const loadOptions =async () => {

    // try to fetch options from localstorage
    const options = localStorage.getItem("options");
    if (options) {
      setOptions(JSON.parse(options))
    } else {
      let json;

      try {
      const res = await fetch("https://ipapi.co/json/");
       json = await res.json();
      }catch(e){}

      const countryCode = json?.country_code;
      let system = "metric";
      if(countryCode && ["US", "LR", "MM", "UK"].includes(countryCode)) system = "imperial";

      console.log("system", system)

      setOptions({
        units: system,
        mapType: "m" //m for normal
      })
    }

  }
  useEffect(()=>{loadOptions()}, [])

  useEffect(() => {
    console.log("options", options)
    if(options && options.units && options.mapType){
      console.log("options", options)
      localStorage.setItem("options", JSON.stringify(options))
    }
  }, [options])

  useEffect(() => {

    // check if paid traffic
    const urlParams = new URLSearchParams(window.location.search);

    const cpc = urlParams.get("cpc");
    if (cpc) {
      // set cpc to true so locaiton not overriden
      window.cpc = true;
      // instantly start game to minimize bounce rate
      setScreen("singleplayer")
    }



    // show welcome modal if not shown (localstorage)
    const welcomeModalShown = localStorage.getItem("welcomeModalShown");
    if (!welcomeModalShown) {
      setShowWelcomeModal(true)
      localStorage.setItem("welcomeModalShown", "true")
    }
  }, [])

  // multiplayer stuff
  const [ws, setWs] = useState(null);
  const [multiplayerState, setMultiplayerState] = useState(
    initialMultiplayerState
  );
  const [multiplayerChatOpen, setMultiplayerChatOpen] = useState(false);
  const [multiplayerChatEnabled, setMultiplayerChatEnabled] = useState(false);

  const { t: text } = useTranslation("common");

  function handleMultiplayerAction(action, ...args) {
    if (!ws || !multiplayerState.connected || multiplayerState.gameQueued || multiplayerState.connecting) return;

    if (action === "publicDuel") {
      setMultiplayerState((prev) => ({
        ...prev,
        gameQueued: "publicDuel",
        nextGameQueued: false
      }))
      ws.send(JSON.stringify({ type: "publicDuel" }))
    }

    if (action === "joinPrivateGame") {


      if (args[0]) {

        setMultiplayerState((prev) => ({
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
            guestName: prev.guestName
          }

        })
      }
    }

    if (action === "createPrivateGame") {
      if (!args[0]) {
        setMultiplayerState((prev) => {
          return {
            ...initialMultiplayerState,
            connected: true,
            creatingGame: true,
            playerCount: prev.playerCount,
            guestName: prev.guestName
          }
        })
      } else {
        setMultiplayerState((prev) => ({
          ...prev,
          createOptions: {
            ...prev.createOptions,
            progress: 0
          }
        }));
        const maxDist = args[0].location === "all" ? 20000 : countryMaxDists[args[0].location];

        (async () => {
          const locations = [];
          for (let i = 0; i < args[0].rounds; i++) {

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

    if (action === 'startGameHost' && multiplayerState?.inGame && multiplayerState?.gameData?.host && multiplayerState?.gameData?.state === "waiting") {
      ws.send(JSON.stringify({ type: "startGameHost" }))
    }


  }

  useEffect(() => {
    if (!ws && !multiplayerState.connecting && !multiplayerState.connected && multiplayerState.shouldConnect && !multiplayerState.error) {
      const wsPath = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/multiplayer`
      setMultiplayerState((prev) => ({
        ...prev,
        connecting: true,
        shouldConnect: false
      }))
      const ws = new WebSocket(wsPath);
      ws.onopen = () => {
        setWs(ws)

        fetch("/api/getJWT").then((res) => res.json()).then((data) => {
          const JWT = data.jwt;
          ws.send(JSON.stringify({ type: "verify", jwt: JWT }))
        });
      }

    }

    if (screen === "home") {
      if (ws) {
        ws.close();
        setWs(null);
      }
      setMultiplayerState(initialMultiplayerState)
    }
  }, [multiplayerState, ws, screen])

  useEffect(() => {
    if (multiplayerState?.inGame && multiplayerState?.gameData?.state === "end") {
      // save the final players
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
    if (!multiplayerState?.inGame) {
      setMultiplayerChatEnabled(false)
      setMultiplayerChatOpen(false)
    }
    if (!ws) return;


    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);

      if (data.type === "t") {
        const offset = data.t - Date.now();
        if (Math.abs(offset) > 1000 && ((Math.abs(offset) < Math.abs(timeOffset)) || !timeOffset)) {
          setTimeOffset(offset)
        }
      }

      if (data.type === "cnt") {
        setMultiplayerState((prev) => ({
          ...prev,
          playerCount: data.c
        }))
      } else if (data.type === "verify") {
        console.log("verified")
        setMultiplayerState((prev) => ({
          ...prev,
          connected: true,
          connecting: false,
          guestName: data.guestName
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
            createOptions: initialMultiplayerState.createOptions,
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

      } else if (data.type === "gameShutdown") {
        setMultiplayerState((prev) => {
          return {
            ...initialMultiplayerState,
            connected: true,
            nextGameQueued: prev.nextGameQueued,
            playerCount: prev.playerCount,
            guestName: prev.guestName
          }
        });
      } else if (data.type === "gameJoinError" && multiplayerState.enteringGameCode) {
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
      setWs(null)
      setMultiplayerState((prev) => ({
        ...initialMultiplayerState,
        error: prev.error ?? "Connection lost"
      }));
    }


    return () => {
      ws.onmessage = null;
    }
  }, [ws, multiplayerState, timeOffset]);

  useEffect(() => {
    if (multiplayerState?.connected && !multiplayerState?.inGame && multiplayerState?.nextGameQueued) {
      handleMultiplayerAction("publicDuel");
    }
  }, [multiplayerState, timeOffset])


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

    ws.send(JSON.stringify({ type: "place", latLong: pinpointLatLong, final: true }))
  }

  useEffect(() => {
    const streak = localStorage.getItem("countryStreak");
    if (streak) {
      setCountryStreak(parseInt(streak))
    }

    // preload/cache src.png and dest.png
    const img = new Image();
    img.src = "/src.png";
    const img2 = new Image();
    img2.src = "/dest.png";

  }, [])

  function reloadBtnPressed() {
    setLatLong(null)
    setLoading(true)
    setTimeout(() => {
      setLatLong(latLong)
      setLoading(false)
      setStreetViewShown(true)
    }, 100);
  }
  function backBtnPressed(queueNextGame = false) {
    if (loading) setLoading(false);
    if (multiplayerState?.inGame) {
      ws.send(JSON.stringify({
        type: 'leaveGame'
      }))

      setMultiplayerState((prev) => {
        return {
          ...prev,
          nextGameQueued: queueNextGame === true
        }
      })

    } else if ((multiplayerState?.creatingGame || multiplayerState?.enteringGameCode) && multiplayerState?.connected) {

      setMultiplayerState((prev) => {
        return {
          ...initialMultiplayerState,
          connected: true,
          playerCount: prev.playerCount,
          guestName: prev.guestName

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
    if(window.cpc) {
      const popularLocations = [
    { lat: 40.7598687, long: -73.9764681 },
    { lat: 27.1719752, long: 78.0422793 },

      ]
      setLatLong(popularLocations[Math.floor(Math.random() * popularLocations.length)])
      setTimeout(() => {
        setStreetViewShown(true)
        setTimeout(() => {
          setLoading(false)
        }, 100);
      }, 100);
      return window.cpc = false;
    }
    if (loading) return;
    console.log("loading location")
    setLoading(true)
    setShowAnswer(false)
    setPinPoint(null)
    setLatLong(null)
    setHintShown(false)
    findLatLongRandom(gameOptions).then((latLong) => {
      setLatLong(latLong)
      setTimeout(() => {
        setStreetViewShown(true)
        setTimeout(() => {
          setLoading(false)
        }, 100);
      }, 100);
    });
  }

  function onNavbarLogoPress() {
    if (screen !== "home" && !loading) {
      if (multiplayerState?.connected && !multiplayerState?.inGame) {
        return;
      }
      if (!multiplayerState?.inGame) loadLocation()
      else if (multiplayerState?.gameData?.state === "guess") {

      }
    }
  }

  const ChatboxMemo = React.useMemo(() => <ChatBox ws={ws} open={multiplayerChatOpen} onToggle={() => setMultiplayerChatOpen(!multiplayerChatOpen)} enabled={multiplayerChatEnabled} myId={multiplayerState?.gameData?.myId} inGame={multiplayerState?.inGame} />, [multiplayerChatOpen, multiplayerChatEnabled, ws, multiplayerState?.gameData?.myId, multiplayerState?.inGame])

  // Send pong every 10 seconds if websocket is connected
  useEffect(() => {
    const pongInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    }, 10000); // Send pong every 10 seconds

    return () => clearInterval(pongInterval);
  }, [ws]);

  return (
    <>
      <HeadContent text={text}/>

      <AccountModal shown={accountModalOpen} session={session} setAccountModalOpen={setAccountModalOpen} />
      <SetUsernameModal shown={session && session?.token?.secret && !session.token.username} session={session} />

      {ChatboxMemo}

      <img src={'/background.jpg'} style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        objectFit: 'cover',
        transition: 'opacity 0.5s',
        opacity: 0.4

      }} />


      <main className={`home ${jockey.className} ${roboto.className}`} id="main">

        <BannerText text={`${text("loading")}...`} shown={loading && !(multiplayerState.error || multiplayerState.connecting)} />
        <BannerText text={`${text("connecting")}...`} shown={multiplayerState.connecting && !multiplayerState.error} />

        <div style={{ display: 'flex', alignItems: 'center', opacity: ((screen !== "singleplayer") && !multiplayerState?.inGame) ? 1 : 0 }} className="accountBtnContainer">
          <AccountBtn session={session} openAccountModal={() => setAccountModalOpen(true)} />
          {/* <p style={{color: "white", zIndex: 10000}}>
          {
            JSON.stringify(session)
          }
          </p> */}
        </div>
        {process.env.NEXT_PUBLIC_CESIUM_TOKEN &&
          <CesiumWrapper className={`cesium_${screen} ${(screen === "singleplayer" || (multiplayerState?.gameData?.state && multiplayerState?.gameData?.state !== 'waiting')) && !loading ? "cesium_hidden" : ""}`} />
        }
        <Navbar loading={loading} loginQueued={loginQueued} setLoginQueued={setLoginQueued} inGame={multiplayerState?.inGame || screen === "singleplayer"} openAccountModal={() => setAccountModalOpen(true)} session={session} shown={screen !== "home"} reloadBtnPressed={reloadBtnPressed} backBtnPressed={backBtnPressed} setGameOptionsModalShown={setGameOptionsModalShown} onNavbarPress={() => onNavbarLogoPress()} gameOptions={gameOptions} screen={screen} multiplayerState={multiplayerState} />
        <div className={`home__content ${screen !== "home" ? "hidden" : ""} ${process.env.NEXT_PUBLIC_CESIUM_TOKEN ? 'cesium_shown' : ''}`}>

          <div className="home__ui">
            <h1 className="home__title">WorldGuessr</h1>
            <div className="home__btns">
              <GameBtn text={text("singleplayer")} onClick={() => {
                if (!loading) setScreen("singleplayer")
              }} />
              <GameBtn text={text("multiplayer")} style={{
                backgroundColor: loginQueued === 'multiplayer' ? "gray" : "",
                cursor: loginQueued === 'multiplayer' ? "not-allowed" : ""
              }} onClick={() => {

                // alert("Multiplayer is currently disabled for maintenance. Please check back later.");
                // return;

                if (loginQueued) return;
                if (!session?.token?.secret && session === null) {
                  setScreen("multiplayer")
                }
                else if (!session?.token?.secret) return;
                else setScreen("multiplayer")
              }} />

              <div className="home__squarebtns">
                <Link target="_blank" href={"https://github.com/codergautam/worldguessr"}><button className="home__squarebtn gameBtn"><FaGithub className="home__squarebtnicon" /></button></Link>
                <Link target="_blank" href={"https://discord.gg/ubdJHjKtrC"}><button className="home__squarebtn gameBtn"><FaDiscord className="home__squarebtnicon" /></button></Link>
                <Link href={"/leaderboard"}><button className="home__squarebtn gameBtn"><FaRankingStar className="home__squarebtnicon" /></button></Link>
                <button className="home__squarebtn gameBtn" onClick={() => setSettingsModal(true)}><FaGear className="home__squarebtnicon" /></button>
              </div>
            </div>
          </div>
          <br />
          <Ad screenH={height} screenW={width} types={[[320, 50]]} centerOnOverflow={600} />
        </div>

        <SettingsModal options={options} setOptions={setOptions} shown={settingsModal} onClose={() => setSettingsModal(false)} />
        <WelcomeModal shown={showWelcomeModal} onClose={() => setShowWelcomeModal(false)} openGame={() => setScreen("singleplayer")} />

        {screen === "singleplayer" && <div className="home__singleplayer">
          <GameUI options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} xpEarned={xpEarned} setXpEarned={setXpEarned} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} latLong={latLong} streetViewShown={streetViewShown} setStreetViewShown={setStreetViewShown} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
        </div>}

        {screen === "multiplayer" && <div className="home__multiplayer">
          <MultiplayerHome handleAction={handleMultiplayerAction} session={session} ws={ws} setWs={setWs} multiplayerState={multiplayerState} setMultiplayerState={setMultiplayerState} />
        </div>}

        {multiplayerState.inGame && ["guess", "getready", "end"].includes(multiplayerState.gameData?.state) && (
          <GameUI options={options} timeOffset={timeOffset} ws={ws} backBtnPressed={backBtnPressed} multiplayerChatOpen={multiplayerChatOpen} setMultiplayerChatOpen={setMultiplayerChatOpen} multiplayerState={multiplayerState} xpEarned={xpEarned} setXpEarned={setXpEarned} pinPoint={pinPoint} setPinPoint={setPinPoint} loading={loading} setLoading={setLoading} session={session} streetViewShown={streetViewShown} setStreetViewShown={setStreetViewShown} latLong={latLong} loadLocation={() => { }} gameOptions={{ location: "all", maxDist: 20000 }} setGameOptions={() => { }} showAnswer={(multiplayerState?.gameData?.curRound !== 1) && multiplayerState?.gameData?.state === 'getready'} setShowAnswer={guessMultiplayer} />
        )}

        <Script>
          {`
  console.log("Ads by adinplay!")
  	window.aiptag = window.aiptag || {cmd: []};
	aiptag.cmd.display = aiptag.cmd.display || [];
	aiptag.cmd.player = aiptag.cmd.player || [];

	//CMP tool settings
	aiptag.cmp = {
		show: true,
		position: "centered",  //centered, bottom
		button: true,
		buttonText: "Privacy settings",
		buttonPosition: "bottom-left" //bottom-left, bottom-right, bottom-center, top-left, top-right
	}
  `}
        </Script>
      </main>
    </>
  )
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, [
        'common',
      ])),
      // Will be passed to the page component as props
    },
  }
}