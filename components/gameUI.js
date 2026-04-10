import { useEffect, useState, useRef } from "react"
import dynamic from "next/dynamic";
import { FaMap } from "react-icons/fa";
import useWindowDimensions from "./useWindowDimensions";
import EndBanner from "./endBanner";
import calcPoints from "./calcPoints";
import findCountry from "./findCountry";
import BannerText from "./bannerText";
import PlayerList from "./playerList";
import { FaExpand, FaMinimize, FaThumbtack, FaArrowDown } from "react-icons/fa6";
import { useTranslation } from '@/components/useTranslations'
import CountryBtns from "./countryButtons";
import continentFromCode from "./utils/continentFromCode";
import ClueBanner from "./clueBanner";
import ExplanationModal from "./explanationModal";
import { toast } from "react-toastify";
import sendEvent from "./utils/sendEvent";
import Ad from "./bannerAdNitro";
// import Ad from "./bannerAdAdinplay";
import CrazyGamesBanner from "./bannerAdCrazyGames";
import GameDistributionBanner from "./bannerAdGameDistribution";
import AnimatedCounter from "./AnimatedCounter";
import gameStorage from "./utils/localStorage";
import HealthBar from "./duelHealthbar";

const MapWidget = dynamic(() => import("../components/Map"), { ssr: false });
// import RoundOverScreen from "./roundOverScreen";
const RoundOverScreen = dynamic(() => import("./roundOverScreen"), { ssr: false });

export default function GameUI({ inCoolMathGames, inGameDistribution, miniMapShown, setMiniMapShown, singlePlayerRound, setSinglePlayerRound, showDiscordModal, setShowDiscordModal, inCrazyGames, showPanoOnResult, setShowPanoOnResult, countryGuesserCorrect, setCountryGuesserCorrect, otherOptions, onboarding, setOnboarding, countryGuesser, options, timeOffset, ws, multiplayerState, backBtnPressed, setMultiplayerState, countryStreak, setCountryStreak, loading, setLoading, session, gameOptionsModalShown, setGameOptionsModalShown, mapModal, latLong, loadLocation, gameOptions, setGameOptions, showAnswer, setShowAnswer, pinPoint, setPinPoint, hintShown, setHintShown, showCountryButtons, setShowCountryButtons, welcomeOverlayShown }) {
  const { t: text } = useTranslation("common");
  function loadLocationFuncRaw(keepAnswer) {
    if(onboarding) {
      if(onboarding.completed) {
        // Reset onboarding to start over - preserve template locations
        setOnboarding({
          round: 1,
          points: 0,
          startTime: Date.now(),
          locations: onboarding.locations, // Keep template locations for gameplay
          gameResults: [] // Clear previous game results
        })
      } else if(onboarding.round === (onboarding.locations?.length || 3)) {
        console.log("Setting onboarding to completed", onboarding);
        setOnboarding((prev)=>{
          const completedOnboarding = {
            completed: true,
            finalOnboardingShown: true,
            round: prev.round,
            points: prev.points,
            mode: prev.mode,
            timeTaken: Date.now() - prev.startTime,
            locations: prev.gameResults || []
          };
          console.log("Completed onboarding state:", completedOnboarding);
          return completedOnboarding;
        })
        if (!keepAnswer) setShowAnswer(false)
      } else {
      setOnboarding((prev) => {
        return {
          ...prev,
          round: prev.round + 1,
          nextRoundTime: 0
        }
      })
    }
    } else if(singlePlayerRound && singlePlayerRound.round === singlePlayerRound.totalRounds && !singlePlayerRound?.done) {


      // display the results
      if (!keepAnswer) setShowAnswer(false)

        setSinglePlayerRound((prev) => {
          const completedGame = {
            ...prev,
            done: true
          };

          // Store game for all completed games (official maps give XP, community maps give 0 XP but are still saved)
          if(session?.token?.secret && prev.locations.length > 0) {
            const totalXp = prev.locations.reduce((sum, location) => sum + (location.xpEarned || 0), 0);
            fetch(window.cConfig.apiUrl+'/api/storeGame', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  secret: session.token.secret,
                  official: gameOptions.official, // Pass official status to API
                  location: gameOptions.communityMapName || gameOptions.location, // Use community map name or location
                  rounds: prev.locations.map(location => ({
                    lat: location.guessLat,
                    long: location.guessLong,
                    actualLat: location.lat,
                    actualLong: location.long,
                    panoId: location.panoId,
                    usedHint: false, // We don't track hints per round currently
                    maxDist: gameOptions.maxDist,
                    roundTime: location.timeTaken,
                    xp: location.xpEarned,
                    points: location.points
                  }))
                })
              }).then(res => res.json()).then(data => {
                if(data.error) {
                  console.error(data.error);
                  return;
                }
              }).catch(e => {
                console.error(e);
              });
          }

          return completedGame;
        })

    } else {


      loadLocation({ keepAnswer })

      if(singlePlayerRound && !singlePlayerRound?.done) {
        setSinglePlayerRound((prev) => {
          return {
            ...prev,
            round: prev.round + 1
          }
        })
      } else if(setSinglePlayerRound) {
        // reset to default
        setHintsUsedThisGame(0);
        setSinglePlayerRound({
          round: 1,
          totalRounds: 5,
          locations: []
        })
      }
    }

  }

  function loadLocationFunc(keepAnswer) {

    function afterAd() {

      if(!setShowDiscordModal || showDiscordModal) return;
      const loadTime = window.gameOpen;
      const lastDiscordShown = gameStorage.getItem("shownDiscordModal");
      if(lastDiscordShown) return console.log("Discord modal already shown");
      if(Date.now() - loadTime > 600000 && !process.env.NEXT_PUBLIC_COOLMATH && !process.env.NEXT_PUBLIC_GAMEDISTRIBUTION) {
        setShowDiscordModal(true)
        sendEvent('discord_modal_shown')
      } else console.log("Not showing discord modal, waiting for "+(600000 - (Date.now() - loadTime))+"ms")
    }
    if(process.env.NEXT_PUBLIC_COOLMATH === "true") {
      try {
        console.log("Sending start event to CoolMathGames")
      window.parent.postMessage({'cm_game_event': true, 'cm_game_evt' : 'start', 'cm_game_lvl':
         "singleplayer"}, '*');
      }catch(e) {
        console.log("Failed sending start event to CoolMathGames", e)
      }
      }
    // Show midgame ad between singleplayer rounds
    if((inGameDistribution || inCrazyGames) && singlePlayerRound && !singlePlayerRound.done && singlePlayerRound.round > 1 && window.crazyMidgame) {
      window.crazyMidgame(() => {
        afterAd()
        loadLocationFuncRaw(keepAnswer)
      });
    } else {
      afterAd()
      loadLocationFuncRaw(keepAnswer)
    }


  }


  const { width, height } = useWindowDimensions();
  // how to determine if touch screen?
  let isTouchScreen = false;
  if(window.matchMedia("(pointer: coarse)").matches) {
    isTouchScreen = true;
  }
  const [miniMapExpanded, setMiniMapExpanded] = useState(false)
  const [miniMapFullscreen, setMiniMapFullscreen] = useState(false)
  const [roundStartTime, setRoundStartTime] = useState(null);
  const [lostCountryStreak, setLostCountryStreak] = useState(0);
  const [countryGuessrStreak, setCgStreak] = useState(() => {
    try { return parseInt(gameStorage.getItem("countryGuessrStreak")) || 0; } catch(e) { return 0; }
  });
  const [lostCountryGuessrStreak, setLostCgStreak] = useState(0);
  const [continentGuessrStreak, setContStreak] = useState(() => {
    try { return parseInt(gameStorage.getItem("continentGuessrStreak")) || 0; } catch(e) { return 0; }
  });
  const [lostContinentGuessrStreak, setLostContStreak] = useState(0);
  const [guessTier, setGuessTier] = useState(null); // "correct" | "wrongSameContinent" | "wrongDiffContinent"
  const [mapFadingOut, setMapFadingOut] = useState(false);
  const [timeToNextMultiplayerEvt, setTimeToNextMultiplayerEvt] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  const [timeToNextRound, setTimeToNextRound] = useState(0); //only for onboarding
  const [singlePlayerTimeLeft, setSinglePlayerTimeLeft] = useState(0);
  const [mapPinned, setMapPinned] = useState(false);
  // dist between guess & target
  const [km, setKm] = useState(null);
  const [explanationModalShown, setExplanationModalShown] = useState(false);

  const [explanations, setExplanations] = useState([]);
  const [showClueBanner, setShowClueBanner] = useState(false);
  const [hintsUsedThisGame, setHintsUsedThisGame] = useState(0);
  const [cmgAdsEnabled, setCmgAdsEnabled] = useState(false);

  // Leaderboard: show after 5s delay in getready, fade out when state leaves getready
  const inGetready = !!(
    multiplayerState && multiplayerState.inGame && !multiplayerState?.gameData?.duel &&
    multiplayerState?.gameData?.state === 'getready' &&
    multiplayerState?.gameData?.curRound !== 1 &&
    multiplayerState?.gameData?.curRound <= multiplayerState?.gameData?.rounds
  );

  // Once shown, stay shown until getready ends (don't depend on timer for hiding)
  useEffect(() => {
    if (inGetready && timeToNextMultiplayerEvt > 0 && timeToNextMultiplayerEvt < 5 && !showLeaderboard) {
      // Delayed appearance: only show in last 5s of getready
      setShowLeaderboard(true);
      setLeaderboardVisible(true);
    }
  }, [inGetready, timeToNextMultiplayerEvt]);

  useEffect(() => {
    if (!inGetready && showLeaderboard) {
      // State left getready — start fade-out, unmount after transition
      setLeaderboardVisible(false);
      const timer = setTimeout(() => setShowLeaderboard(false), 500);
      return () => clearTimeout(timer);
    }
  }, [inGetready]);

  useEffect(() => {
    if (!inCoolMathGames) return;
    fetch('https://www.worldguessr.com/cmgopt.txt')
      .then(res => res.text())
      .then(text => setCmgAdsEnabled(text.trim() === 'true'))
      .catch(() => {});
    // setCmgAdsEnabled(true);
  }, [inCoolMathGames]);

   const isStartingDuel = (multiplayerState && multiplayerState.inGame && multiplayerState?.gameData?.state === 'getready' && multiplayerState?.gameData?.curRound === 1)

  useEffect(() => {
    if(showAnswer) {
      setShowPanoOnResult(false)
    } else {
    }
  }, [showAnswer])



  useEffect(() => {

    const interval = setInterval(() => {
    if(multiplayerState?.inGame && multiplayerState?.gameData?.nextEvtTime) {
      setTimeToNextMultiplayerEvt(Math.max(0,Math.floor(((multiplayerState.gameData.nextEvtTime - Date.now()) - timeOffset) / 100)/10))
    }
    }, 100)

    return () => {
      clearInterval(interval)
    }
  }, [multiplayerState, timeOffset])

  useEffect(() => {
    // fetch clue (if any)
    setExplanations([])

    // only if learn mode
    if(window.location.search.includes("learn=true")) {

    fetch(window.cConfig.apiUrl+'/api/clues/getClue'+(latLong ? `?lat=${latLong.lat}&lng=${latLong.long}` : '')).then(res => res.json()).then(data => {

      if(data.error) {
        console.error(data.error);
        return;
      }
      if(data.length === 0 ||  data.message) return;
      setShowClueBanner(true);
      setExplanations(data)
    });
  }

  }, [latLong]);

  useEffect(() => {
    if(onboarding?.nextRoundTime) {
      const interval = setInterval(() => {
      const val = Math.max(0,Math.floor(((onboarding.nextRoundTime - Date.now())) / 100)/10)
        setTimeToNextRound(val)

        if(val === 0) {
          setOnboarding((prev) => {
            return {
              ...prev,
              nextRoundTime: Date.now() + (window.location.search.includes("crazygames") ? 60000 : 20000),
            }
          });
        }
      }, 100)

      return () => {
        clearInterval(interval)
      }
    }
  }, [onboarding?.nextRoundTime])

  // Singleplayer countdown timer
  const singlePlayerTimerRef = useRef(null);
  const pinPointRef = useRef(pinPoint);
  pinPointRef.current = pinPoint;
  const modalWasOpenRef = useRef(false);
  const wasLoadingRef = useRef(loading);

  useEffect(() => {
    if (singlePlayerTimerRef.current) {
      clearInterval(singlePlayerTimerRef.current);
      singlePlayerTimerRef.current = null;
    }

    const modalOpen = gameOptionsModalShown || mapModal;

    if (!singlePlayerRound || singlePlayerRound.done || !gameOptions.timePerRound || showAnswer || loading || !roundStartTime || modalOpen) {
      setSinglePlayerTimeLeft(0);
      if (modalOpen) modalWasOpenRef.current = true;
      if (loading) wasLoadingRef.current = true;
      return;
    }

    // Reset timer when returning from a modal or when loading just finished
    if (modalWasOpenRef.current || wasLoadingRef.current) {
      modalWasOpenRef.current = false;
      wasLoadingRef.current = false;
      setRoundStartTime(Date.now());
      return;
    }

    const deadline = roundStartTime + gameOptions.timePerRound * 1000;
    singlePlayerTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 100) / 10);
      setSinglePlayerTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(singlePlayerTimerRef.current);
        singlePlayerTimerRef.current = null;
        if (pinPointRef.current) {
          // Player placed a pin — submit their guess normally
          document.querySelector('.guessBtn')?.click();
        } else {
          // No pin placed — score 0 points and show answer
          setShowAnswer(true);
          setCountryStreak(0);
          setSinglePlayerRound((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              locations: [...prev.locations, {
                lat: latLong.lat, long: latLong.long,
                panoId: latLong.panoId || null,
                guessLat: null, guessLong: null,
                points: 0,
                timeTaken: gameOptions.timePerRound,
                xpEarned: 0
              }],
              lastPoint: 0
            };
          });
        }
      }
    }, 100);

    return () => {
      if (singlePlayerTimerRef.current) {
        clearInterval(singlePlayerTimerRef.current);
        singlePlayerTimerRef.current = null;
      }
    };
  }, [roundStartTime, singlePlayerRound?.done, gameOptions.timePerRound, showAnswer, loading, gameOptionsModalShown, mapModal])

  useEffect(() => {
    if(multiplayerState?.inGame) return;
    if (!latLong) {
      setLoading(true)
    } else {
      setRoundStartTime(Date.now());
    }
  }, [latLong, multiplayerState])

  useEffect(() => {
    try { gameStorage.setItem("countryStreak", countryStreak); } catch(e) {}
  }, [countryStreak])

  useEffect(() => {
    try { gameStorage.setItem("countryGuessrStreak", countryGuessrStreak); } catch(e) {}
  }, [countryGuessrStreak])

  useEffect(() => {
    try { gameStorage.setItem("continentGuessrStreak", continentGuessrStreak); } catch(e) {}
  }, [continentGuessrStreak])

  useEffect(() => {
    // No typewriter text — modal handles intro, country buttons show immediately
    if(onboarding && !onboarding.completed) {
      setShowCountryButtons(true);
    }
  }, [onboarding?.round])


  useEffect(() => {
    function keydown(e) {
      // Don't trigger game actions if user is typing in an input field
      if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      if(explanationModalShown) return;
      // Don't handle space during onboarding completion - let home button handle it
      if(onboarding?.completed) return;
      if(singlePlayerRound?.done && e.key === ' ') {
        loadLocationFunc()
        return;
      }
      if(pinPoint && e.key === ' ' && !showAnswer) {
        guess();
      } else if(showAnswer && e.key === ' ') {
        loadLocationFunc()
      }
    }
    // on space key press, guess
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
    }
  }, [pinPoint, showAnswer, onboarding, explanationModalShown, singlePlayerRound])

  useEffect(() => {
    if (!loading && latLong && width > 600 && !isTouchScreen) {
      setMiniMapShown(true)
    } else {
      setMiniMapShown(false)
    }
  }, [loading, latLong, width])

  const hintLimitReached = singlePlayerRound && hintsUsedThisGame >= 2;

  function showHint() {
    if (hintLimitReached || hintShown) return;

    setHintShown(true);
    setHintsUsedThisGame((prev) => prev + 1);
  }
  useEffect(() => {
    loadLocation()
    if(singlePlayerRound) {
      setHintsUsedThisGame(0);
      setSinglePlayerRound({
        round: 1,
        totalRounds: 5,
        locations: []
      })
    }
  }, [gameOptions?.location])
  function guess(correctOverride) {
    const isCorrect = correctOverride !== undefined ? correctOverride : countryGuesserCorrect;
    setShowAnswer(true)
    if(showCountryButtons || setShowCountryButtons)setShowCountryButtons(false);
    if(onboarding) {
      const roundPoints = (onboarding?.mode && onboarding.mode !== "classic") ? (isCorrect ? 1000 : 0) : countryGuesser ? (isCorrect ? 1000 : 0) : calcPoints({ lat: latLong.lat, lon: latLong.long, guessLat: pinPoint?.lat, guessLon: pinPoint?.lng, usedHint: hintShown, maxDist: 20000});
      setOnboarding((prev) => {

        return {
          ...prev,
          nextRoundTime:0,
          points: (prev.points??0) + roundPoints,
          gameResults: [...(prev.gameResults || []), {
            lat: latLong.lat,
            long: latLong.long,
            guessLat: pinPoint?.lat || null,
            guessLong: pinPoint?.lng || null,
            points: roundPoints,
            timeTaken: Math.round((Date.now() - roundStartTime) / 1000)
          }]
        }
      })
      setTimeToNextRound(0)
    }

    if(singlePlayerRound) {
      const roundPoints = countryGuesser ? (isCorrect ? 1000 : 0) : calcPoints({ lat: latLong.lat, lon: latLong.long, guessLat: pinPoint.lat, guessLon: pinPoint.lng, usedHint: hintShown, maxDist: gameOptions.maxDist });
      const roundXp = countryGuesser ? 0 : (gameOptions?.official ? Math.round(roundPoints / 50) : 0);

      setSinglePlayerRound((prev) => {
        return {
          ...prev,
          locations: [...prev.locations, {lat: latLong.lat, long: latLong.long, panoId: latLong.panoId || null, guessLat: pinPoint?.lat || null, guessLong: pinPoint?.lng || null,
            points: roundPoints,
            timeTaken: Math.round((Date.now() - roundStartTime) / 1000),
            xpEarned: roundXp

          }],
          lastPoint: roundPoints
        }
      })
    }

    if(multiplayerState?.inGame) return;

    if(gameOptions.location === 'all' && pinPoint) {

      function afterGuess(country) {
        setLostCountryStreak(0);
        if(!(country === "Unknown" && latLong.country === "Unknown")) {
          if(country === latLong.country) {
            setCountryStreak(countryStreak + 1);
          } else if(country !== "Unknown") {
            setCountryStreak(0);
            setLostCountryStreak(countryStreak);
          }
        }
      }
    findCountry({ lat: pinPoint.lat, lon: pinPoint.lng }).then((country) => {
      afterGuess(country)

    }).catch((e) => {
      console.error(e);
      afterGuess("Unknown")
    });
    }
  }





  const multiplayerTimerShown = !((loading||showAnswer||!multiplayerState||(multiplayerState?.gameData?.state === 'getready' && multiplayerState?.gameData?.curRound === 1)||multiplayerState?.gameData?.state === 'end'));
  const onboardingTimerShown = !((showAnswer||!onboarding));
  return (
    <div className="gameUI">

{ !onboarding && !inCrazyGames && !inCoolMathGames && !inGameDistribution && (!session?.token?.supporter) && !singlePlayerRound?.done && !onboarding?.completed && (
    <div className={`topAdFixed ${(multiplayerTimerShown || onboardingTimerShown || singlePlayerRound)?'moreDown':''}`}>
      <Ad
      unit={"worldguessr_gameui_ad"}
    inCrazyGames={inCrazyGames} showAdvertisementText={false} screenH={height} types={[[728,90]]} centerOnOverflow={600} screenW={Math.max(400, width-450)} vertThresh={0.3} />
    </div>
)}

{ inCrazyGames && !singlePlayerRound?.done && !onboarding?.completed && !(width < 700 && height < 350) && (
    <div className={`topAdFixed ${(multiplayerTimerShown || onboardingTimerShown || singlePlayerRound)?'':''}`}>
      <CrazyGamesBanner
        id="cg-banner-gameui"
        screenH={height} types={[[320,50],[468,60],[728,90]]} screenW={Math.max(400, width-350)} vertThresh={0.3} />
    </div>
)}

{ inCoolMathGames && cmgAdsEnabled && !singlePlayerRound?.done && !onboarding?.completed && (
    <div className={`topAdFixed ${(multiplayerTimerShown || onboardingTimerShown || singlePlayerRound)?'moreDown':''}`}>
      <Ad
      unit={"worldguessr_cmg_gameui_ad"}
    showAdvertisementText={false} screenH={height} types={[[320,50]]} screenW={width} vertThresh={0.3} />
    </div>
)}

{ inGameDistribution && !singlePlayerRound?.done && !onboarding?.completed && !(width < 700 && height < 350) && (
    <div className={`topAdFixed ${(multiplayerTimerShown || onboardingTimerShown || singlePlayerRound)?'moreDown':''}`}>
      <GameDistributionBanner
        id="gd-banner-gameui"
        screenH={height} types={[[728,90]]} screenW={Math.max(400, width-350)} vertThresh={0.3} />
    </div>
)}


{ multiplayerState?.gameData?.duel && multiplayerState?.gameData?.state !== 'end' && (
  <div className={`hbparent ${isStartingDuel ? 'hb-parent' : ''}`}>
    <div className={`${isStartingDuel ? 'hb-bars' : ''}`}>
  <div style={{zIndex: 1001, position: "fixed", top: 0, left: 0, pointerEvents: 'none'}}
  className={(multiplayerState && isStartingDuel) ? 'hb-start1' : ''}>
<HealthBar health={
// get your points from the game state
multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.score

} maxHealth={5000} name={
// get your name from the game state
text("you")
}
isStartingDuel={isStartingDuel}
elo={multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.elo}
countryCode={multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.countryCode}
start={isStartingDuel} />
</div>


{ isStartingDuel && (
  <p style={{zIndex: 1000, pointerEvents: 'none', color: 'white', fontSize: 50, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', display: isStartingDuel ? '' : 'none' }}>
    VS
  </p>
) }

<div style={{zIndex: 1001, position: "fixed", top: 0, right: 0, pointerEvents: 'none'}}
className={isStartingDuel ? 'hb-start2' : ''}>
<HealthBar health={
// get your points from the game state
multiplayerState?.gameData?.players.find(p => p.id !== multiplayerState?.gameData?.myId)?.score

} maxHealth={5000}
isStartingDuel={isStartingDuel}
name={
// get your name from the game state
multiplayerState?.gameData?.players.find(p => p.id !== multiplayerState?.gameData?.myId)?.username
}
elo={multiplayerState?.gameData?.players.find(p => p.id !== multiplayerState?.gameData?.myId)?.elo}
countryCode={multiplayerState?.gameData?.players.find(p => p.id !== multiplayerState?.gameData?.myId)?.countryCode}
start={true || isStartingDuel} isOpponent={true} />
</div>
</div>

<p style={{zIndex: 1000, pointerEvents: 'none', color: 'white', fontSize: 20, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', display: isStartingDuel ? '' : 'none', marginTop: "10px" }}>
{timeToNextMultiplayerEvt}

</p>
</div>
)}

{/* Duel Anti-Cheat Warning */}
{multiplayerState?.gameData?.duel && multiplayerState?.gameData?.public && isStartingDuel && (
  <div className="duel-warning-container">
    <div className="duel-warning-content">
      <div className="warning-icon">⚠️</div>
      <div className="warning-text">
        <div className="warning-subtitle">{text("duelWarningText")}</div>
      </div>
    </div>
  </div>
)}

{/*


',

*/}


{ singlePlayerRound?.done && (
<RoundOverScreen points={singlePlayerRound.locations.reduce((acc, cur) => acc + cur.points, 0)

} maxPoints={countryGuesser ? singlePlayerRound.totalRounds * 1000 : singlePlayerRound.totalRounds * 5000}
history={singlePlayerRound.locations}
button1Text={"🎮 "+text("playAgain")}
button1Press={() =>{
  window.crazyMidgame(() =>

  loadLocationFunc()
  )
              }}
session={session}/>
)}


      {(!countryGuesser || (countryGuesser && showAnswer)) && (!multiplayerState || (multiplayerState.inGame && ['guess', 'getready'].includes(multiplayerState.gameData?.state))) && ((multiplayerState?.inGame && multiplayerState?.gameData?.curRound === 1) ? multiplayerState?.gameData?.state === "guess" : true ) && (
        <>


      <div id="miniMapArea" onMouseEnter={() => {
        setMiniMapExpanded(true)
      }} onMouseLeave={() => {
        if(mapPinned) return;
        // todo: if mouse down, don't collapse
        setMiniMapExpanded(false)
      }} className={`miniMap ${miniMapExpanded ? 'mapExpanded' : ''} ${!welcomeOverlayShown && (miniMapShown||showAnswer||mapFadingOut)&&(!singlePlayerRound?.done && !onboarding?.completed && ((!showPanoOnResult && showAnswer) || (!showAnswer) || mapFadingOut)) && !(onboarding && !showAnswer && !mapFadingOut && onboarding.mode !== 'classic') ? 'shown' : ''} ${showAnswer ? 'answerShown' : 'answerNotShown'} ${(showAnswer && countryGuesser && !showPanoOnResult) || mapFadingOut ? 'countryGuessrMapReveal' : ''} ${mapFadingOut ? 'countryGuessrMapFadeOut' : ''} ${miniMapFullscreen&&miniMapExpanded ? 'fullscreen' : ''}`}>

{!showAnswer && (
<div className="mapCornerBtns desktop" style={{ visibility: miniMapExpanded ? 'visible' : 'hidden' }}>
          <button className="cornerBtn" onClick={() => {
            setMiniMapFullscreen(!miniMapFullscreen)
            if(!miniMapFullscreen) {
              setMiniMapExpanded(true)
            }
          }}>{miniMapFullscreen  ? (
            <FaMinimize />
          ) : (
            <FaExpand />
          )}</button>

          &nbsp;
          <button className="cornerBtn" onClick={() => {
            setMapPinned(!mapPinned)
          }}>
            <FaThumbtack style={{ transform: mapPinned ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </button>
        </div>
)}
        <MapWidget shown={latLong && !loading} focused={miniMapExpanded} options={options} ws={ws} gameOptions={gameOptions} answerShown={showAnswer} session={session} showHint={hintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} guessed={false} guessing={false} location={latLong} setKm={setKm} multiplayerState={multiplayerState} />


        <div className={`miniMap__btns ${showAnswer ? 'answerShownBtns' : ''}`}>
          <button className={`miniMap__btn ${!pinPoint||(multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final) ? 'unavailable' : ''} guessBtn`} disabled={!pinPoint||(multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final)} onClick={guess}>
           {multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final ? multiplayerState?.gameData?.players?.reduce((acc, cur) => {if(cur.final) return acc - 1;return acc;}, multiplayerState?.gameData?.players.length) > 0 ? `${text("waitingForPlayers", {p:multiplayerState?.gameData?.players?.reduce((acc, cur) => {if(cur.final) return acc - 1;return acc;}, multiplayerState?.gameData?.players.length)})}...` : `${text("waiting")}...` : text("guess")}
            </button>

          { !multiplayerState?.inGame && (
          <button className={`miniMap__btn hintBtn ${hintShown ? 'hintShown' : ''}`} style={hintLimitReached ? {display:'none'} : {}} onClick={showHint}>{text('hint')}</button>
          )}
        </div>
      </div>

      <div className={`mobile_minimap__btns ${miniMapShown ? 'miniMapShown' : ''} ${(showAnswer||singlePlayerRound?.done||onboarding?.completed) ? 'answerShownBtns' : ''}`}>
        {miniMapShown && (
          <>
            {/* guess and hint  */}

            <button className={`miniMap__btn ${!pinPoint||(multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final) ? 'unavailable' : ''} guessBtn`} disabled={!pinPoint||(multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final)} onClick={guess}>
           {multiplayerState?.inGame && multiplayerState?.gameData?.players.find(p => p.id === multiplayerState?.gameData?.myId)?.final ? multiplayerState?.gameData?.players?.reduce((acc, cur) => {if(cur.final) return acc - 1;return acc;}, multiplayerState?.gameData?.players.length) > 0 ? `${text("waitingForPlayers", {p: multiplayerState?.gameData?.players?.reduce((acc, cur) => {if(cur.final) return acc - 1;return acc;}, multiplayerState?.gameData?.players.length)})}...` :  `${text("waiting")}...` : text("guess")}
            </button>

          { !multiplayerState?.inGame && (
          <button className={`miniMap__btn hintBtn ${hintShown ? 'hintShown' : ''}`} style={hintLimitReached ? {display:'none'} : {}} onClick={showHint}>{text('hint')}</button>
          )}
          </>
        )}
        {!loading && !welcomeOverlayShown && (
          <button className={`gameBtn g2_mobile_guess ${miniMapShown ? 'mobileMiniMapExpandedToggle' : ''}`} onClick={() => {
            setMiniMapShown(!miniMapShown)
          }}>
              {!miniMapShown ? (
                <>
            <FaMap size={miniMapShown ? 30 : 50} /> {!miniMapShown ? text("guess") : ''}
            </>
            ) : (
              <FaArrowDown size={30} />
            ) }

            </button>
        )}
      </div>
      </>
      )}

      { countryGuesser && otherOptions && (
        <CountryBtns countries={otherOptions} shown={!loading && showCountryButtons && !showAnswer} mode={onboarding?.mode || "country"} compact={!onboarding}

         onCountryPress={(selected) => {
          const isContinentMode = onboarding?.mode === "continent" || (!onboarding && countryGuesser && otherOptions?.includes?.("Africa"));
          const isCorrect = isContinentMode ? continentFromCode(latLong.country) === selected : selected === latLong.country;
          setCountryGuesserCorrect(isCorrect);
          // Determine quip tier
          if (isCorrect) {
            setGuessTier("correct");
          } else if (isContinentMode) {
            setGuessTier("wrongDiffContinent");
          } else {
            const guessedContinent = continentFromCode(selected);
            const correctContinent = continentFromCode(latLong.country);
            setGuessTier(guessedContinent === correctContinent ? "wrongSameContinent" : "wrongDiffContinent");
          }
          if (isContinentMode) {
            setLostContStreak(0);
            if (isCorrect) {
              setContStreak(prev => prev + 1);
            } else {
              setLostContStreak(continentGuessrStreak);
              setContStreak(0);
            }
          } else {
            setLostCgStreak(0);
            if (isCorrect) {
              setCgStreak(prev => prev + 1);
            } else {
              setLostCgStreak(countryGuessrStreak);
              setCgStreak(0);
            }
          }
          guess(isCorrect);
         }}/>
      )}

      {/* Duel timer — single line, old style */}
      {multiplayerState?.gameData?.duel && multiplayerState?.gameData?.public && (
      <span className={`timer duel ${!multiplayerTimerShown ? '' : 'shown'} ${timeToNextMultiplayerEvt <= 5 && timeToNextMultiplayerEvt > 0 && !showAnswer && !pinPoint && multiplayerState?.gameData?.state === 'guess' ? 'critical' : ''}`}>
        {multiplayerState?.gameData?.timePerRound === 86400000 && timeToNextMultiplayerEvt > 120
          ? text("round", {r:multiplayerState?.gameData?.curRound, mr: multiplayerState?.gameData?.rounds})
          : text("roundTimer", {r:multiplayerState?.gameData?.curRound, mr: multiplayerState?.gameData?.rounds, t: timeToNextMultiplayerEvt.toFixed(1)})}
      </span>
      )}

      {/* Non-duel multiplayer timer — two line style */}
      {!(multiplayerState?.gameData?.duel && multiplayerState?.gameData?.public) && (
      <span className={`timer timer--two-line ${!multiplayerTimerShown ? '' : 'shown'} ${timeToNextMultiplayerEvt <= 5 && timeToNextMultiplayerEvt > 0 && !showAnswer && !pinPoint && multiplayerState?.gameData?.state === 'guess' ? 'critical' : ''}`}>
        <span className="timer__round-label">{text("round", {r:multiplayerState?.gameData?.curRound, mr: multiplayerState?.gameData?.rounds})}</span>
        <span className="timer__main-row">
          {!(multiplayerState?.gameData?.timePerRound === 86400000 && timeToNextMultiplayerEvt > 120)
            ? <><span className="timer__countdown">{timeToNextMultiplayerEvt.toFixed(1)}s</span></>
            : null
          }
        </span>
      </span>
      )}

      <span className={`timer timer--two-line ${!onboardingTimerShown ? '' : 'shown'} ${timeToNextRound <= 5 && timeToNextRound > 0 && !showAnswer && !pinPoint && onboarding ? 'critical' : ''}`}>
        <span className="timer__round-label">{onboarding ? `Tutorial ${onboarding.round}/${onboarding.locations?.length || 3}` : text("round", {r:onboarding?.round, mr: 5})}</span>
        <span className="timer__main-row">
          {timeToNextRound
            ? <><span className="timer__countdown">{timeToNextRound.toFixed(1)}s</span> &middot; </>
            : null
          }
          <AnimatedCounter value={onboarding?.points || 0} showIncrement={false} /> {text("points")}
        </span>
      </span>

        {
          singlePlayerRound && !singlePlayerRound?.done && (
            <span className={`timer timer--two-line shown ${singlePlayerTimeLeft <= 5 && singlePlayerTimeLeft > 0 && gameOptions.timePerRound > 0 && !showAnswer && !pinPoint ? 'critical' : ''}`}>
              <span className="timer__round-label">{text("round", {r: singlePlayerRound.round, mr: singlePlayerRound.totalRounds})}</span>
              <span className="timer__main-row">
                {gameOptions.timePerRound > 0 && !showAnswer && singlePlayerTimeLeft > 0
                  ? <><span className="timer__countdown">{singlePlayerTimeLeft.toFixed(1)}s</span> &middot; </>
                  : null
                }
                <AnimatedCounter value={singlePlayerRound.locations.reduce((acc, cur) => acc + cur.points, 0)} showIncrement={false} /> {text("points")}
              </span>
            </span>
          )
        }

        {multiplayerState && multiplayerState.inGame && !multiplayerState?.gameData?.duel && multiplayerState?.gameData?.state === 'getready' && multiplayerState?.gameData?.curRound === 1 && (
          <BannerText text={
            text("gameStartingIn", {t:timeToNextMultiplayerEvt})
          } shown={true} />
        )}


        {showLeaderboard && (
          <PlayerList multiplayerState={multiplayerState} fadingOut={!leaderboardVisible} playAgain={() => {
            backBtnPressed(true, "unranked")
          }} backBtn={() => {
            backBtnPressed()
          }} />
        )}


        {/* Private game over screen */}
        {multiplayerState && multiplayerState.inGame && !multiplayerState?.gameData?.duel && multiplayerState?.gameData?.state === "end" && (
          <RoundOverScreen
            history={multiplayerState?.gameData?.history || []}
            duel={false}
            multiplayerState={multiplayerState}
            gameId={multiplayerState?.gameData?.code}
            points={multiplayerState?.gameData?.players?.find(p => p.id === multiplayerState?.gameData?.myId)?.score || 0}
            maxPoints={multiplayerState?.gameData?.rounds * 5000}
            button1Text={multiplayerState?.gameData?.public ? text("playAgain") : null}
            button1Press={multiplayerState?.gameData?.public ? () => backBtnPressed(true, "unranked") : null}
            button2Text={(multiplayerState?.gameData?.public || multiplayerState?.gameData?.host) ? text("back") : null}
            button2Press={(multiplayerState?.gameData?.public || multiplayerState?.gameData?.host) ? () => backBtnPressed() : null}
            session={session}
            options={options}
          />
        )}

        {/* Duel game over screen */}
        {multiplayerState && multiplayerState.inGame && multiplayerState?.gameData?.duel && multiplayerState?.gameData?.state === "end" && (
          <RoundOverScreen
            history={multiplayerState?.gameData?.history || []}
            duel={true}
            data={multiplayerState?.gameData?.duelEnd}
            multiplayerState={multiplayerState}
            gameId={multiplayerState?.gameData?.code}
            button1Text={multiplayerState?.gameData?.public ? text("playAgain") : null}
            button1Press={multiplayerState?.gameData?.public ? () => backBtnPressed(true, "ranked") : null}
            button2Text={(multiplayerState?.gameData?.public || multiplayerState?.gameData?.host) ? text("back") : null}
            button2Press={(multiplayerState?.gameData?.public || multiplayerState?.gameData?.host) ? () => backBtnPressed() : null}
            session={session}
            options={options}
          />
        )}

    <ExplanationModal lat={latLong?.lat} long={latLong?.long} shown={explanationModalShown} onClose={() => {
        setExplanationModalShown(false)
      }} session={session} />

{/* <EndBanner xpEarned={xpEarned} usedHint={showHint} session={session} lostCountryStreak={lostCountryStreak} guessed={guessed} latLong={latLong} pinPoint={pinPoint} countryStreak={countryStreak} fullReset={fullReset} km={km} playingMultiplayer={playingMultiplayer} /> */}

<div className="endCards">
  { showAnswer && showClueBanner && (
<ClueBanner session={session} explanations={explanations} close={() => {setShowClueBanner(false)}} />
  )}
<EndBanner
countryStreaksEnabled={gameOptions?.location === "all"}
singlePlayerRound={singlePlayerRound} onboarding={onboarding} countryGuesser={countryGuesser} countryGuesserCorrect={countryGuesserCorrect} guessTier={guessTier} options={options} isContinentMode={onboarding?.mode === "continent" || (!onboarding && countryGuesser && otherOptions?.includes?.("Africa"))} countryStreak={countryGuesser ? (otherOptions?.includes?.("Africa") || onboarding?.mode === "continent" ? continentGuessrStreak : countryGuessrStreak) : countryStreak} lostCountryStreak={countryGuesser ? (otherOptions?.includes?.("Africa") || onboarding?.mode === "continent" ? lostContinentGuessrStreak : lostCountryGuessrStreak) : lostCountryStreak} usedHint={hintShown} session={session}  guessed={showAnswer} latLong={latLong} pinPoint={pinPoint} fullReset={()=>{
  const isCountryGuessrMode = countryGuesser || (onboarding?.mode && onboarding.mode !== "classic");
  if (isCountryGuessrMode) {
    setMapFadingOut(true);
    window._countryGuessrKeepAnswer = true;
    loadLocationFunc(true);
    setTimeout(() => {
      setMapFadingOut(false);
      setShowAnswer(false);
      window._countryGuessrKeepAnswer = false;
    }, 300);
  } else {
    loadLocationFunc();
  }
  }} km={km} setExplanationModalShown={setExplanationModalShown} multiplayerState={multiplayerState} toggleMap={() => {
    setShowPanoOnResult(!showPanoOnResult)
  }} panoShown={showPanoOnResult} />

    {/* Critical timer screen warning effect */}
    {((timeToNextMultiplayerEvt <= 5 && timeToNextMultiplayerEvt > 0 && multiplayerTimerShown && !showAnswer && !pinPoint && multiplayerState?.inGame && multiplayerState?.gameData?.state === 'guess') ||
      (timeToNextRound <= 5 && timeToNextRound > 0 && onboardingTimerShown && !showAnswer && !pinPoint && onboarding)) && (
      <div className="screen-critical-warning" />
    )}
  </div>

    </div>
  )
}
