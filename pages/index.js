import HeadContent from "@/components/headContent";
import CesiumWrapper from "../components/cesium/CesiumWrapper";
import { Jockey_One, Roboto } from 'next/font/google';
import GameBtn from "@/components/ui/gameBtn";
import { FaDiscord, FaGithub, FaGoogle, FaInfo } from "react-icons/fa";
import { FaBook, FaGear, FaMap, FaNewspaper, FaRankingStar } from "react-icons/fa6";
import { signIn, signOut, useSession } from "next-auth/react";
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
// import text from "@/languages/lang";
import { useTranslation } from 'next-i18next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import useWindowDimensions from "@/components/useWindowDimensions";
import dynamic from "next/dynamic";
import Ad from "@/components/bannerAd";
import Script from "next/script";
import SettingsModal from "@/components/settingsModal";
import sendEvent from "@/components/utils/sendEvent";
import initWebsocket from "@/components/utils/initWebsocket";
import 'react-toastify/dist/ReactToastify.css';
// const Ad = dynamic(() => import('@/components/bannerAd'), { ssr: false });

import NextImage from "next/image";
import OnboardingText from "@/components/onboardingText";
import RoundOverScreen from "@/components/roundOverScreen";
import msToTime from "@/components/msToTime";
import SuggestAccountModal from "@/components/suggestAccountModal";
import WsIcon from "@/components/wsIcon";
import FriendsModal from "@/components/friendModal";
import { toast, ToastContainer } from "react-toastify";
import InfoModal from "@/components/infoModal";
import { inIframe } from "@/components/utils/inIframe";
import moment from 'moment-timezone';

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
  const [friendsModal, setFriendsModal] = useState(false)
  const [timeOffset, setTimeOffset] = useState(0)
  const [loginQueued, setLoginQueued] = useState(false);
  const [options, setOptions] = useState({
  });
  const [isApp, setIsApp] = useState(false);

  useEffect(() => {
    if(window.location.search.includes("app=true")) {
      setIsApp(true);
    }
  }, []);

  const [onboarding, setOnboarding] = useState(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(null);
  const [otherOptions, setOtherOptions] = useState([]); // for country guesser
  const [showCountryButtons, setShowCountryButtons] = useState(true);
  const [countryGuesserCorrect, setCountryGuesserCorrect] = useState(false);
  const [showSuggestLoginModal, setShowSuggestLoginModal] = useState(false);
  const [allLocsArray, setAllLocsArray] = useState([]);

  useEffect(() => {
    if(onboarding?.round >1) {
      loadLocation()
    }
  }, [onboarding?.round])

  useEffect(() => {
    if(onboarding?.completed) {
      setOnboardingCompleted(true)
    }
  }, [onboarding?.completed])
  useEffect(() => {
    const onboarding = window.localStorage.getItem("onboarding");
    if(onboarding && onboarding === "done") setOnboardingCompleted(true)
      else setOnboardingCompleted(false)
  }, [])

  useEffect(() => {
    if(onboardingCompleted === false) {
      if(onboardingCompleted===null)return;
      if (!loading) {
        function start() {
        setScreen("onboarding")

        let onboardingLocations = [
          { lat: 40.7598687, long: -73.9764681, country: "US", otherOptions: ["GB", "JP"] },
        { lat: 27.1719752, long: 78.0422793, country: "IN", otherOptions: ["ZA", "FR"] },
        { lat: 51.5080896, long: -0.087694, country: "GB", otherOptions: ["US", "DE"] },
          { lat: -1.2758794, long: 36.8231793, country: "KE", otherOptions: ["IN", "US"] },
          { lat: 35.7010698, long: 139.7061219, country: "JP", otherOptions: ["KR", "RU"] },
          { lat: 37.5383413, long: 127.1002877, country: "KR", otherOptions: ["JP", "CA"] },
          { lat: 19.3228523, long: -99.0982377, country: "MX", otherOptions: ["BR", "US"] },
          { lat: 55.7495807, long: 37.616477, country: "RU", otherOptions: ["CN", "PL"] },
        ]

        // pick 5 random locations no repeats
        const locations = [];
        while (locations.length < 5) {
          const loc = onboardingLocations[Math.floor(Math.random() * onboardingLocations.length)]
          if (!locations.find((l) => l.country === loc.country)) {
            locations.push(loc)
          }
        }

        setOnboarding({
          round: 1,
          locations: locations,
          startTime: Date.now(),
        })
        sendEvent("tutorial_begin")
        setShowCountryButtons(false)
      }

      // const isPPC = window.location.search.includes("cpc=true");
        if(inIframe() && window.adBreak) {
          console.log("trying to show preroll")
          window.onboardPrerollEnd = false;
          setLoading(true)
          window.adBreak({
            type: "preroll",
            adBreakDone: function(e) {
              if(window.onboardPrerollEnd) return;
              setLoading(false)
              window.onboardPrerollEnd = true;
              sendEvent("interstitial", { type: "preroll", ...e })
              start()
            }
          })

          setTimeout(() => {
            if(!window.onboardPrerollEnd) {
              window.onboardPrerollEnd = true;
              console.log("preroll timeout")
              setLoading(false)
              start()
            }
          }, 3000)
        } else {
        start()
        }
      }
    }
  }, [onboardingCompleted])

  useEffect(() => {
    if(session && session.token && session.token.username) {
      setOnboardingCompleted(true)
      window.localStorage.setItem("onboarding", "done")
    }
  }, [session])

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

  // multiplayer stuff
  const [ws, setWs] = useState(null);
  const [multiplayerState, setMultiplayerState] = useState(
    initialMultiplayerState
  );
  const [multiplayerChatOpen, setMultiplayerChatOpen] = useState(false);
  const [multiplayerChatEnabled, setMultiplayerChatEnabled] = useState(false);

  const { t: text } = useTranslation("common");

  useEffect(( ) => {

    if(multiplayerState?.joinOptions?.error) {
      setTimeout(() => {
        setMultiplayerState((prev) => ({ ...prev, joinOptions: { ...prev.joinOptions, error: null } }))
      }, 1000)
    }

  }, [multiplayerState?.joinOptions?.error]);

  function handleMultiplayerAction(action, ...args) {
    if (!ws || !multiplayerState.connected || multiplayerState.gameQueued || multiplayerState.connecting) return;

    if (action === "publicDuel") {
      setScreen("multiplayer")
      setMultiplayerState((prev) => ({
        ...prev,
        gameQueued: "publicDuel",
        nextGameQueued: false
      }))
      sendEvent("multiplayer_request_duel")
      ws.send(JSON.stringify({ type: "publicDuel" }))
    }

    if (action === "joinPrivateGame") {

      if (args[0]) {
        setScreen("multiplayer")

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
      sendEvent("multiplayer_join_private_game", { gameCode: args[0] })

      } else {
        setScreen("multiplayer")
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
      setScreen("multiplayer")

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

        const maxDist = args[0].location === "all" ? 20000 : countryMaxDists[args[0].location];
        // setMultiplayerState((prev) => ({
        //   ...prev,
        //   createOptions: {
        //     ...prev.createOptions,
        //     progress: 0
        //   }
        // }));
        // (async () => {
          // const locations = [];
          // for (let i = 0; i < args[0].rounds; i++) {

          //   const loc = await findLatLongRandom({ location: multiplayerState.createOptions.location });
          //   locations.push(loc)
          //   setMultiplayerState((prev) => ({
          //     ...prev,
          //     createOptions: {
          //       ...prev.createOptions,
          //       progress: i + 1
          //     }
          //   }))
          // }

          setMultiplayerState((prev) => ({
            ...prev,
            createOptions: {
              ...prev.createOptions,
              progress: true
            }
          }));

          // send ws
          // ws.send(JSON.stringify({ type: "createPrivateGame", rounds: args[0].rounds, timePerRound: args[0].timePerRound, locations, maxDist }))
          ws.send(JSON.stringify({ type: "createPrivateGame", rounds: args[0].rounds, timePerRound: args[0].timePerRound, location: args[0].location, maxDist }))
          sendEvent("multiplayer_create_private_game", { rounds: args[0].rounds, timePerRound: args[0].timePerRound, location: args[0].location, maxDist })
        // })()
      }
    }

    if (action === 'startGameHost' && multiplayerState?.inGame && multiplayerState?.gameData?.host && multiplayerState?.gameData?.state === "waiting") {
      ws.send(JSON.stringify({ type: "startGameHost" }))
      sendEvent("multiplayer_start_game_host")
    }

    if(action === 'screen') {
        ws.send(JSON.stringify({ type: "screen", screen: args[0] }))
    }


  }

  useEffect(() => {
    (async() => {


    if (!ws && !multiplayerState.connecting && !multiplayerState.connected && !window?.dontReconnect) {
      const wsPath = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/wg`
      setMultiplayerState((prev) => ({
        ...prev,
        connecting: true,
        shouldConnect: false
      }))
      const ws = await initWebsocket(wsPath, null, 5000, 20)
      if(ws && ws.readyState === 1) {
      setWs(ws)
      setMultiplayerState((prev)=>({
        ...prev,
        error: false
      }))


        fetch("/api/getJWT").then((res) => res.json()).then((data) => {
          const JWT = data.jwt;
          const tz = moment.tz.guess();
          console.log("tz", tz)

          ws.send(JSON.stringify({ type: "verify", jwt: JWT, tz}))
        });
      } else {
        alert("could not connect to server")
      }

    }
  })();
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
        if(data.message === "uac")
          {
            window.dontReconnect = true;
          }
          if(data.failedToLogin) {
            window.dontReconnect = true;
            // logout
            signOut()

          }
         ws.close();

        toast(data.message==='uac'?text('userAlreadyConnected'):data.message, { type: 'error' });

      } else if (data.type === "game") {
        setScreen("multiplayer")
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
        setScreen("home")
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
      } else if(data.type === 'generating') {
        // location generation before round
        setMultiplayerState((prev) => {
          return {
            ...prev,
            gameData: {
              ...prev.gameData,
              generated: data.generated
            }
          }
        })
      } else if(data.type === "friendReq") {
        const from = data.name;
        const id = data.id;
        const toAccept = (closeToast) => {
          ws.send(JSON.stringify({ type: 'acceptFriend', id }))
          closeToast()
        }
        const toDecline = (closeToast) => {
          ws.send(JSON.stringify({ type: 'declineFriend', id }))
          closeToast()
        }
        const toastComponent = function({closeToast}){
          return (
          <div>
            <span>{text("youGotFriendReq", { from })}</span>

            <button onClick={() => toAccept(closeToast)} className={"accept-button"}>✔</button>
            &nbsp;
            <button onClick={() => toDecline(closeToast)} className={"decline-button"}>✖</button>
          </div>
          )
        }

        toast(toastComponent, { type: 'info', theme: "dark" })


      } else if(data.type === 'toast') {
        toast(text(data.key, data), { type: data.toastType ?? 'info', theme: "dark", closeOnClick: data.closeOnClick ?? false, autoClose: data.autoClose ?? 5000 })
      } else if(data.type === 'invite') {
        // code, invitedByName, invitedById
        const { code, invitedByName, invitedById } = data;

        const toAccept = (closeToast) => {
          ws.send(JSON.stringify({ type: 'acceptInvite', code, invitedById }))
          closeToast()
        }
        const toDecline = (closeToast) => {
          closeToast()
        }
        const toastComponent = function({closeToast}){
          return (
          <div>
            <span>{text("youGotInvite", { from: invitedByName })}</span>

            <button onClick={() => toAccept(closeToast)} className={"accept-button"}>{text("join")}</button>
            &nbsp;
            <button onClick={() => toDecline(closeToast)} className={"decline-button"}>{text("decline")}</button>
          </div>
          )
        }

        toast(toastComponent, { type: 'info', theme: "dark", autoClose: 10000 })
      } else if(data.type === 'streak') {
        const streak = data.streak;

        if(streak === 0) {
          toast(text("streakLost"), { type: 'info', theme: "dark", autoClose: 5000, closeOnClick: true })
        } else if(streak === 1) {
          toast(text("streakStarted"), { type: 'info', theme: "dark", autoClose: 5000, closeOnClick: true })
        } else {
          toast(text("streakGained", { streak }), { type: 'info', theme: "dark", autoClose: 5000, closeOnClick: true })
        }
      }
    }

    // ws on disconnect
    ws.onclose = () => {
      setWs(null)
      sendEvent("multiplayer_disconnect")

      setMultiplayerState((prev) => ({
        ...initialMultiplayerState,
        error: prev.error ?? text("connectionLost")
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

  useEffect(() => {
    if (multiplayerState?.connected) {
      handleMultiplayerAction("screen", screen);
    }
  }, [screen]);


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

  function sendInvite(id) {
    if(!ws || !multiplayerState?.connected) return;
    ws.send(JSON.stringify({ type: 'inviteFriend', friendId: id }))
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
      setScreen("home")

    } else if ((multiplayerState?.creatingGame || multiplayerState?.enteringGameCode) && multiplayerState?.connected) {

      setMultiplayerState((prev) => {
        return {
          ...initialMultiplayerState,
          connected: true,
          playerCount: prev.playerCount,
          guestName: prev.guestName

        }
      })
      setScreen("home")

    } else if(multiplayerState?.gameQueued) {
      console.log("gameQueued")
      ws.send(JSON.stringify({ type: "leaveQueue" }))

      setMultiplayerState((prev) => {
        return {
          ...prev,
          gameQueued: false
        }
      });
      setScreen("home")

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
    if (loading) return;




    // console.log("loading location")
    setLoading(true)
    setShowAnswer(false)
    setPinPoint(null)
    setLatLong(null)
    setHintShown(false)
    if(screen === "onboarding") {
      setLatLong(onboarding.locations[onboarding.round - 1]);
      let options = JSON.parse(JSON.stringify(onboarding.locations[onboarding.round - 1].otherOptions));
      options.push(onboarding.locations[onboarding.round - 1].country)
      // shuffle
      options = options.sort(() => Math.random() - 0.5)
      setOtherOptions(options)
    } else {
    function defaultMethod() {
    findLatLongRandom(gameOptions).then((latLong) => {
      setLatLong(latLong)
    });
  }
  function fetchMethod() {
    fetch("/allCountries.json").then((res) => res.json()).then((data) => {
      if(data.ready) {
        setAllLocsArray(data.locations)
        const loc = data.locations[0]
        setLatLong(loc)
      } else {
        console.log("pregen not ready :(")
        defaultMethod()
      }
    }).catch((e) => {
      defaultMethod()
    });
  }
  if(gameOptions.location==="all") {
    if(allLocsArray.length===0) {
      fetchMethod()
    } else if(allLocsArray.length>0) {
      const locIndex = allLocsArray.findIndex((l) => l.lat === latLong.lat && l.long === latLong.long);
      if((locIndex === -1) || (locIndex === allLocsArray.length-1)) {
       fetchMethod()
      } else {
        const loc = allLocsArray[locIndex+1] ?? allLocsArray[0];
        setLatLong(loc)
      }

    }
  } else defaultMethod()
}

  }

  function onNavbarLogoPress() {
    if(screen === "onboarding") return;

    if (screen !== "home" && !loading) {
      if (screen==="multiplayer" && multiplayerState?.connected && !multiplayerState?.inGame) {
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
      <SuggestAccountModal shown={showSuggestLoginModal} setOpen={setShowSuggestLoginModal} />

      {ChatboxMemo}
    <ToastContainer/>
<div style={{
        top: 0,
        left: 0,
        position: 'fixed',
        width: '100vw',
        height: '100vh',
        transition: 'opacity 0.5s',
        opacity: 0.4,
        userSelect: 'none',
      }}>
      <NextImage.default src={'/street1.jpg'}
      fill   alt="Game Background" style={{objectFit: "cover",userSelect:'none'}}
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      />
      </div>


      <main className={`home ${jockey.className} ${roboto.className}`} id="main">

        <BannerText text={`${text("loading")}...`} shown={loading} showCompass={true} />

        {process.env.NEXT_PUBLIC_CESIUM_TOKEN &&
          <CesiumWrapper className={`cesium_${screen} ${(screen === "singleplayer" || (multiplayerState?.gameData?.state && multiplayerState?.gameData?.state !== 'waiting')) && !loading ? "cesium_hidden" : ""}`} />
        }
        <Navbar loading={loading} onFriendsPress={()=>setFriendsModal(true)} loginQueued={loginQueued} setLoginQueued={setLoginQueued} inGame={multiplayerState?.inGame || screen === "singleplayer"} openAccountModal={() => setAccountModalOpen(true)} session={session} shown={true} reloadBtnPressed={reloadBtnPressed} backBtnPressed={backBtnPressed} setGameOptionsModalShown={setGameOptionsModalShown} onNavbarPress={() => onNavbarLogoPress()} gameOptions={gameOptions} screen={screen} multiplayerState={multiplayerState} />


        <div className={`home__content ${screen !== "home" ? "hidden" : ""} ${process.env.NEXT_PUBLIC_CESIUM_TOKEN ? 'cesium_shown' : ''}`}>

        { onboardingCompleted===null ? (
          <>

          </>
        ) : (
          <>

          <div className="home__ui">
            { onboardingCompleted && (
            <h1 className="home__title">WorldGuessr</h1>
            )}

            <div className="home__btns">

              { onboardingCompleted && (

              <>
      <div className="mainHomeBtns">

               {/* <GameBtn text={text("singleplayer")} onClick={() => {
                if (!loading) setScreen("singleplayer")
              }} /> */}
              <button className="homeBtn" onClick={() => {
                if (!loading) setScreen("singleplayer")
              }} >{text("singleplayer")}</button>
        {/* <span className="bigSpan">{text("playOnline")}</span> */}
        <button className="homeBtn multiplayerOptionBtn publicGame" onClick={() => handleMultiplayerAction("publicDuel")}
          disabled={!multiplayerState.connected}>{text("findDuel")}</button>
        {/* <span className="bigSpan" disabled={!multiplayerState.connected}>{text("playFriends")}</span> */}
        <div className="multiplayerPrivBtns">
        <button className="homeBtn multiplayerOptionBtn" disabled={!multiplayerState.connected} onClick={() => handleMultiplayerAction("createPrivateGame")}>{text("createGame")}</button>
        <button className="homeBtn multiplayerOptionBtn" disabled={!multiplayerState.connected} onClick={() => handleMultiplayerAction("joinPrivateGame")}>{text("joinGame")}</button>
        </div>
      </div>

              <div className="home__squarebtns">
                { !isApp && (
                  <>
                <Link target="_blank" href={"https://github.com/codergautam/worldguessr"}><button className="home__squarebtn gameBtn" aria-label="Github"><FaGithub className="home__squarebtnicon" /></button></Link>
                <Link target="_blank" href={"https://discord.gg/ubdJHjKtrC"}><button className="home__squarebtn gameBtn" aria-label="Discord"><FaDiscord className="home__squarebtnicon" /></button></Link>
                <Link href={"/leaderboard"}><button className="home__squarebtn gameBtn" aria-label="Leaderboard"><FaRankingStar className="home__squarebtnicon" /></button></Link>
                <Link target="_blank" href={"https://iogames.forum/worldguessr"}><button className="home__squarebtn gameBtn" aria-label="Forum"><FaNewspaper className="home__squarebtnicon" /></button></Link>
                </>
                )}
                <button className="home__squarebtn gameBtn" aria-label="Settings" onClick={() => setSettingsModal(true)}><FaGear className="home__squarebtnicon" /></button>
              </div>
<Ad screenH={height} screenW={width} types={[[320, 50],[728,90],[970,90]]} centerOnOverflow={600} />

              </>
            )}
            </div>
          </div>
          </>
        )}
          <br />
        </div>
        <InfoModal shown={false} />
        <SettingsModal options={options} setOptions={setOptions} shown={settingsModal} onClose={() => setSettingsModal(false)} />
        <FriendsModal ws={ws} shown={friendsModal} onClose={() => setFriendsModal(false)} session={session} canSendInvite={
          // send invite if in a private multiplayer game, dont need to be host or in game waiting just need to be in a private game
          multiplayerState?.inGame && !multiplayerState?.gameData?.public
        } sendInvite={sendInvite} />

        {screen === "singleplayer" && <div className="home__singleplayer">
          <GameUI options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} xpEarned={xpEarned} setXpEarned={setXpEarned} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} latLong={latLong} streetViewShown={streetViewShown} setStreetViewShown={setStreetViewShown} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
        </div>}

        {screen === "onboarding" && onboarding?.round && <div className="home__onboarding">
          <GameUI countryGuesserCorrect={countryGuesserCorrect} setCountryGuesserCorrect={setCountryGuesserCorrect} showCountryButtons={showCountryButtons} setShowCountryButtons={setShowCountryButtons} otherOptions={otherOptions} onboarding={onboarding} countryGuesser={onboarding.round < 3} setOnboarding={setOnboarding} options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} xpEarned={xpEarned} setXpEarned={setXpEarned} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} latLong={latLong} streetViewShown={streetViewShown} setStreetViewShown={setStreetViewShown} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
          </div>}

          {screen === "onboarding" && onboarding?.completed && <div className="home__onboarding">
            <div className="home__onboarding__completed">
              <OnboardingText words={[
                text("onboarding1")
              ]} pageDone={() => {
                window.localStorage.setItem("onboarding", 'done')
                setOnboarding((prev)=>{
                  return {
                    ...prev,
                    finalOnboardingShown: true
                  }
                })
              }} shown={!onboarding?.finalOnboardingShown} />
              <RoundOverScreen onboarding={onboarding} setOnboarding={setOnboarding} points={onboarding.points} time={msToTime(onboarding.timeTaken)} maxPoints={20000} onHomePress={() =>{
                if(onboarding) sendEvent("tutorial_end");

                setOnboarding(null)
                if(!window.location.search.includes("app=true")) {
      setShowSuggestLoginModal(true)
    }
                setScreen("home")
              }}/>
              </div>
              </div>
}

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
   window.adsbygoogle = window.adsbygoogle || [];
  window.adBreak = adConfig = function(o) {adsbygoogle.push(o);}
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