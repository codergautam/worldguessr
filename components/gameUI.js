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
import countryCoordinates from "../public/countryCoordinates.json";
import ClueBanner from "./clueBanner";
import ExplanationModal from "./explanationModal";
import sendEvent from "./utils/sendEvent";
import Ad from "./bannerAdNitro";
// import Ad from "./bannerAdAdinplay";
import CrazyGamesBanner from "./bannerAdCrazyGames";
import GameDistributionBanner from "./bannerAdGameDistribution";
import AnimatedCounter from "./AnimatedCounter";
import gameStorage from "./utils/localStorage";
import HealthBar from "./duelHealthbar";
import TeamScorebar from "./teamScorebar";
import deriveTeamEndFallback from "./utils/teamDuelEndFallback";
import getMyTeam from "./utils/getMyTeam";

const ONBOARDING_MIN_MANUAL_ADVANCE_MS = 6000;

// Shared scaffold for the duel HP bars + 5s "VS" intro — one source for the
// layout so intro tweaks (spacing, timing, a11y) can't drift between the 1v1
// and team-duel blocks, which previously each carried a near-identical copy.
function DuelIntroBars({ isStartingDuel, countdown, leftBar, rightBar }) {
  return (
    <div className={isStartingDuel ? 'hb-parent' : ''}>
      <div className={`${isStartingDuel ? 'hb-bars' : ''}`}>
        <div style={{ zIndex: 1001, position: "fixed", top: 0, left: 0, pointerEvents: 'none' }}
          className={isStartingDuel ? 'hb-start1' : ''}>
          {leftBar}
        </div>

        {isStartingDuel && (
          <p style={{ zIndex: 1000, pointerEvents: 'none', color: 'white', fontSize: 50, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            VS
          </p>
        )}

        <div style={{ zIndex: 1001, position: "fixed", top: 0, right: 0, pointerEvents: 'none' }}
          className={isStartingDuel ? 'hb-start2' : ''}>
          {rightBar}
        </div>
      </div>

      <p style={{ zIndex: 1000, pointerEvents: 'none', color: 'white', fontSize: 20, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', display: isStartingDuel ? '' : 'none', marginTop: "10px" }}>
        {countdown}
      </p>
    </div>
  );
}

const MapWidget = dynamic(() => import("../components/Map"), { ssr: false });
// import RoundOverScreen from "./roundOverScreen";
const RoundOverScreen = dynamic(() => import("./roundOverScreen"), { ssr: false });

export default function GameUI({ inCoolMathGames, inGameDistribution, miniMapShown, setMiniMapShown, singlePlayerRound, setSinglePlayerRound, showDiscordModal, setShowDiscordModal, inCrazyGames, showPanoOnResult, setShowPanoOnResult, countryGuesserCorrect, setCountryGuesserCorrect, otherOptions, onboarding, setOnboarding, countryGuesser, options, timeOffset, ws, multiplayerState, backBtnPressed, setMultiplayerState, countryStreak, setCountryStreak, loading, setLoading, session, gameOptionsModalShown, setGameOptionsModalShown, mapModal, latLong, loadLocation, gameOptions, setGameOptions, showAnswer, setShowAnswer, pinPoint, setPinPoint, hintShown, setHintShown, showCountryButtons, setShowCountryButtons, welcomeOverlayShown, countryGuessrMode, dailyMode, onRoundsComplete }) {
  const { t: text } = useTranslation("common");
  const onboardingRevealStartedAt = useRef(0);

  function logOnboardingAdvance(event, details = {}) {
    if (process.env.NEXT_PUBLIC_COOLMATH !== "true") return;
    console.log("[onboarding-advance]", {
      event,
      round: onboarding?.round,
      mode: onboarding?.mode,
      showAnswer,
      elapsedMs: onboardingRevealStartedAt.current ? Date.now() - onboardingRevealStartedAt.current : null,
      ...details,
    });
  }

  function loadLocationFuncRaw(keepAnswer, advanceSource) {
    if (onboarding && advanceSource) {
      logOnboardingAdvance("loadLocationFuncRaw", { keepAnswer, advanceSource });
    }
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

          // Daily mode: skip the default storeGame submission and let the parent handle results.
          if (dailyMode && onRoundsComplete) {
            try { onRoundsComplete(prev.locations); } catch (e) { console.error('onRoundsComplete error', e); }
            return completedGame;
          }

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
                  countryGuesser: !!countryGuesser,
                  countryGuessrSubMode: countryGuessrMode?.subMode || 'country',
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
        if(!mapPinned) setMiniMapExpanded(false);
        setSinglePlayerRound({
          round: 1,
          totalRounds: countryGuesser ? 10 : 5,
          locations: []
        })
      }
    }

  }

  function loadLocationFunc(keepAnswer, advanceSource) {
    if (onboarding && advanceSource) {
      logOnboardingAdvance("loadLocationFunc", { keepAnswer, advanceSource });
    }

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
        loadLocationFuncRaw(keepAnswer, advanceSource)
      });
    } else {
      afterAd()
      loadLocationFuncRaw(keepAnswer, advanceSource)
    }


  }

  // Single canonical "advance to next round" path used by every trigger
  // (EndBanner button, space key, auto-advance). Without this, each caller
  // had its own copy of the fade timing and only the one that was edited
  // would have the fade — pressing the other path showed the raw size
  // revert / slide-down.
  //
  // Country-guessr / onboarding (non-classic) want the keepAnswer flow so
  // the answer overlay can fade out without resetting state. Singleplayer
  // gets the three-phase fade → forceHidden window → slide-up choreography.
  function advanceRound(advanceSource) {
    setMapCameraCancelKey((prev) => prev + 1);
    const isCountryGuessrMode = countryGuesser || (onboarding?.mode && onboarding.mode !== "classic");
    if (isCountryGuessrMode) {
      setFadeOutMapLocation(latLong);
      setMapFadingOut(true);
      window._countryGuessrKeepAnswer = true;
      loadLocationFunc(true, advanceSource);
      setTimeout(() => {
        setMapFadingOut(false);
        setFadeOutMapLocation(null);
        setShowAnswer(false);
        setPinPoint(null);
        window._countryGuessrKeepAnswer = false;
      }, 300);
    } else {
      setShowAnswer(false);
      setPinPoint(null);
      setMapFadingOut(false);
      setFadeOutMapLocation(null);
      setMapResetting(true);
      loadLocationFunc(true, advanceSource);
      setTimeout(() => {
        setMapResetting(false);
      }, 350);
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
  const [guessedCountryCode, setGuessedCountryCode] = useState(null);
  const [mapFadingOut, setMapFadingOut] = useState(false);
  const [fadeOutMapLocation, setFadeOutMapLocation] = useState(null);
  const [mapCameraCancelKey, setMapCameraCancelKey] = useState(0);
  // Set true during the singleplayer round-end window where the map needs
  // to be force-hidden offscreen (between fade-out finishing and the slide-
  // up starting). Driven into forceHideMiniMap below.
  const [mapResetting, setMapResetting] = useState(false);
  const [timeToNextMultiplayerEvt, setTimeToNextMultiplayerEvt] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  const leaderboardFadeInFrameRef = useRef(null);
  const [timeToNextRound, setTimeToNextRound] = useState(0); //only for onboarding
  const [singlePlayerTimeLeft, setSinglePlayerTimeLeft] = useState(0);
  const [mapPinned, setMapPinned] = useState(false);
  const prevMultiplayerRoundStateRef = useRef({ state: null, round: null });
  const multiplayerMapFadeTimerRef = useRef(null);
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
    if (!inGetready || !(timeToNextMultiplayerEvt > 0 && timeToNextMultiplayerEvt < 5)) return;
    // Covers both fresh mounts and the recovery case where a rapid
    // getready→x→getready flip left the list mounted but faded out.
    if (showLeaderboard && leaderboardVisible) return;
    if (leaderboardFadeInFrameRef.current) {
      cancelAnimationFrame(leaderboardFadeInFrameRef.current);
    }
    setLeaderboardVisible(false);
    setShowLeaderboard(true);
    // Double rAF: a single frame does not guarantee the browser PAINTS the
    // opacity-0 state before the shown class lands — both commits collapse
    // into one paint and the list pops in with no fade. The second frame
    // forces a real paint of the start state so the 500ms transition runs.
    leaderboardFadeInFrameRef.current = requestAnimationFrame(() => {
      leaderboardFadeInFrameRef.current = requestAnimationFrame(() => {
        setLeaderboardVisible(true);
        leaderboardFadeInFrameRef.current = null;
      });
    });
  }, [inGetready, timeToNextMultiplayerEvt, showLeaderboard, leaderboardVisible]);

  useEffect(() => {
    if (!inGetready && showLeaderboard) {
      // State left getready — start fade-out, unmount after transition
      if (leaderboardFadeInFrameRef.current) {
        cancelAnimationFrame(leaderboardFadeInFrameRef.current);
        leaderboardFadeInFrameRef.current = null;
      }
      setLeaderboardVisible(false);
      const timer = setTimeout(() => setShowLeaderboard(false), 500);
      return () => clearTimeout(timer);
    }
  }, [inGetready, showLeaderboard]);

  useEffect(() => {
    return () => {
      if (leaderboardFadeInFrameRef.current) {
        cancelAnimationFrame(leaderboardFadeInFrameRef.current);
      }
    };
  }, []);

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
      if (onboarding && !onboarding.completed && onboarding.mode !== "classic") {
        onboardingRevealStartedAt.current = Date.now();
      }
    } else {
      setGuessedCountryCode(null);
      onboardingRevealStartedAt.current = 0;
    }
  }, [showAnswer, onboarding?.round, onboarding?.completed, onboarding?.mode])



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
            if (!latLong || latLong.lat == null || latLong.long == null) return prev;
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
        loadLocationFunc(undefined, "space-singleplayer-done")
        return;
      }
      if(pinPoint && e.key === ' ' && !showAnswer) {
        guess();
      } else if(showAnswer && e.key === ' ') {
        if (onboarding && !onboarding.completed && onboarding.mode !== "classic") {
          const elapsedMs = onboardingRevealStartedAt.current ? Date.now() - onboardingRevealStartedAt.current : 0;
          logOnboardingAdvance("blocked-space-advance", {
            key: e.key,
            code: e.code,
            repeat: e.repeat,
            targetTag: e.target?.tagName,
            activeTag: document.activeElement?.tagName,
          });
          if (elapsedMs < ONBOARDING_MIN_MANUAL_ADVANCE_MS) return;
        }
        advanceRound("space-answer")
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

  useEffect(() => {
    if (!multiplayerState?.inGame) {
      prevMultiplayerRoundStateRef.current = { state: null, round: null };
      if (multiplayerMapFadeTimerRef.current) {
        clearTimeout(multiplayerMapFadeTimerRef.current);
        multiplayerMapFadeTimerRef.current = null;
      }
      setMapFadingOut(false);
      setFadeOutMapLocation(null);
      return;
    }

    const prevState = prevMultiplayerRoundStateRef.current.state;
    const prevRound = prevMultiplayerRoundStateRef.current.round;
    const curState = multiplayerState?.gameData?.state;
    const curRound = multiplayerState?.gameData?.curRound;

    const startedNewGuessRound = curState === "guess" && (
      (prevState === "getready" && prevRound === curRound) ||
      (prevState === "guess" && prevRound !== curRound)
    );
    const leftAnswerRevealForGuess = prevState === "getready" && prevRound !== 1 && curState === "guess" && prevRound === curRound;

    if (startedNewGuessRound && !mapPinned) {
      setMiniMapExpanded(false);
      setMiniMapFullscreen(false);
    }

    if (leftAnswerRevealForGuess) {
      if (multiplayerMapFadeTimerRef.current) {
        clearTimeout(multiplayerMapFadeTimerRef.current);
      }
      setFadeOutMapLocation(latLong);
      setMapFadingOut(true);
      multiplayerMapFadeTimerRef.current = setTimeout(() => {
        setMapFadingOut(false);
        setFadeOutMapLocation(null);
        multiplayerMapFadeTimerRef.current = null;
      }, 300);
    }

    prevMultiplayerRoundStateRef.current = { state: curState, round: curRound };
  }, [multiplayerState?.inGame, multiplayerState?.gameData?.state, multiplayerState?.gameData?.curRound, mapPinned]);

  useEffect(() => {
    return () => {
      if (multiplayerMapFadeTimerRef.current) {
        clearTimeout(multiplayerMapFadeTimerRef.current);
      }
    };
  }, []);

  // Explicitly reset minimap expansion on every new round (singleplayer or onboarding).
  // Without this, singleplayer relies on a mouseleave event firing as the minimap
  // transforms off-screen during the latLong=null async-fetch window — which browsers
  // fire inconsistently once pointer-events flips to none, so miniMapExpanded can
  // leak into the next round. Onboarding works "by accident" because its latLong
  // goes old→new in one batch with no null window, keeping the mouseleave reliable.
  const prevSinglePlayerRoundRef = useRef(null);
  useEffect(() => {
    const curRound = singlePlayerRound?.round;
    const prev = prevSinglePlayerRoundRef.current;
    if (curRound != null && prev != null && curRound !== prev && !mapPinned) {
      setMiniMapExpanded(false);
      setMiniMapFullscreen(false);
    }
    prevSinglePlayerRoundRef.current = curRound;
  }, [singlePlayerRound?.round, mapPinned]);

  const prevOnboardingRoundRef = useRef(null);
  useEffect(() => {
    const curRound = onboarding?.round;
    const prev = prevOnboardingRoundRef.current;
    if (curRound != null && prev != null && curRound !== prev && !mapPinned) {
      setMiniMapExpanded(false);
      setMiniMapFullscreen(false);
    }
    prevOnboardingRoundRef.current = curRound;
  }, [onboarding?.round, mapPinned]);

  const hintLimitReached = singlePlayerRound && hintsUsedThisGame >= 2;

  function showHint() {
    if (hintLimitReached || hintShown) return;

    setHintShown(true);
    setHintsUsedThisGame((prev) => prev + 1);
  }

  // Guess + hint pair, shared by the desktop minimap and the mobile expanded
  // minimap — one source so the waiting-count logic can't drift between them.
  function renderGuessHintBtns() {
    const gd = multiplayerState?.gameData;
    const players = gd?.players;
    const myId = gd?.myId;
    const iAmFinal = !!(multiplayerState?.inGame
      && players?.find(p => p.id === myId)?.final);
    // How many players haven't locked in yet ("Waiting for N players…").
    const notFinalCount = players?.reduce((acc, cur) => cur.final ? acc - 1 : acc, players?.length ?? 0) ?? 0;

    // Team modes: split the wait by allegiance — a teammate blocking the
    // team's score is a different message than opponents taking their time.
    // Long-gone teammates don't hold the label (mirrors holdsRounds).
    const teamMode = !!(gd?.team2v2 || gd?.teamGame);
    const myTeam = teamMode ? getMyTeam(players, myId) : null;
    const mates = myTeam ? (players || []).filter(p => p.id !== myId && p.team === myTeam) : [];
    const matesWaiting = mates.filter(p => !p.final && !p.disconnected).length;
    const waitingLabel = myTeam == null
      ? (notFinalCount > 0 ? `${text("waitingForPlayers", { p: notFinalCount })}...` : `${text("waiting")}...`)
      : matesWaiting > 0
        ? `${matesWaiting === 1 ? text("waitingForTeammate") : text("waitingForTeammates", { p: matesWaiting })}...`
        : notFinalCount > 0 ? `${text("waitingForOpponents")}...` : `${text("waiting")}...`;

    return (
      <>
        <button className={`miniMap__btn ${!pinPoint || iAmFinal ? 'unavailable' : ''} guessBtn`} disabled={!pinPoint || iAmFinal} onClick={guess}>
          {iAmFinal ? waitingLabel : text("guess")}
        </button>
        {!multiplayerState?.inGame && (
          <button className={`miniMap__btn hintBtn ${hintShown ? 'hintShown' : ''}`} style={hintLimitReached ? { display: 'none' } : {}} onClick={showHint}>{text('hint')}</button>
        )}
      </>
    );
  }
  useEffect(() => {
    if (dailyMode) return;
    loadLocation()
    if(singlePlayerRound) {
      setHintsUsedThisGame(0);
      setSinglePlayerRound({
        round: 1,
        totalRounds: countryGuesser ? 10 : 5,
        locations: []
      })
    }
  }, [gameOptions?.location])
  function guess(correctOverride) {
    // Guard against being called before a location has been loaded. Every branch
    // below dereferences latLong.lat/long, so bail out to avoid a TypeError.
    if (!latLong || latLong.lat == null || latLong.long == null) return;
    const isCorrect = correctOverride !== undefined ? correctOverride : countryGuesserCorrect;
    if (onboarding && !onboarding.completed && onboarding.mode !== "classic") {
      onboardingRevealStartedAt.current = Date.now();
    }
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
      const roundXp = countryGuesser ? (gameOptions?.official && isCorrect ? 20 : 0) : (gameOptions?.official ? Math.round(roundPoints / 50) : 0);

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
  const multiplayerAnswerRevealLeaving = !!(
    multiplayerState?.inGame &&
    prevMultiplayerRoundStateRef.current.state === "getready" &&
    prevMultiplayerRoundStateRef.current.round !== 1 &&
    multiplayerState?.gameData?.state === "guess" &&
    prevMultiplayerRoundStateRef.current.round === multiplayerState?.gameData?.curRound
  );
  const mapFadingOutForRender = mapFadingOut || multiplayerAnswerRevealLeaving;
  const showAnswerOnMap = showAnswer || mapFadingOutForRender;
  const multiplayerRoundOverShowingAnswer = !!(
    multiplayerState?.inGame &&
    multiplayerState?.gameData?.state === "end" &&
    showAnswerOnMap
  );
  const multiplayerMapStateAllowsRender = !multiplayerState || (
    multiplayerState.inGame && (
      ['guess', 'getready'].includes(multiplayerState.gameData?.state) ||
      multiplayerRoundOverShowingAnswer
    )
  );
  const shouldShowMiniMap = !welcomeOverlayShown &&
    (miniMapShown || showAnswerOnMap) &&
    (!singlePlayerRound?.done && !onboarding?.completed &&
      ((!showPanoOnResult && showAnswerOnMap) || (!showAnswerOnMap && !loading) || mapFadingOutForRender)) &&
    !(onboarding && !showAnswer && !mapFadingOutForRender && onboarding.mode !== 'classic');
  const forceHideMiniMap = !!(
    (multiplayerState?.inGame && multiplayerState?.gameData?.state === 'guess' && loading && !showAnswerOnMap)
    || mapResetting
  );
  const mapLocationForRender = mapFadingOutForRender && fadeOutMapLocation ? fadeOutMapLocation : latLong;
  const mapReadyForCameraReset = !welcomeOverlayShown && !forceHideMiniMap && !loading && !!mapLocationForRender;
  const mapCameraResetKey = multiplayerState?.inGame
    ? `mp:${multiplayerState?.gameData?.code || ''}:${multiplayerState?.gameData?.curRound || ''}:${multiplayerState?.gameData?.state || ''}`
    : onboarding
      ? `onboarding:${onboarding?.mode || 'classic'}:${onboarding?.round || ''}`
      : singlePlayerRound
        ? `single:${gameOptions?.location || 'all'}:${singlePlayerRound?.round || ''}:${singlePlayerRound?.done ? 'done' : 'playing'}`
        : `free:${gameOptions?.location || 'all'}:${latLong?.lat ?? ''}:${latLong?.long ?? ''}`;
  return (
    <div className="gameUI">

{ !onboarding && !inCrazyGames && !inCoolMathGames && !inGameDistribution && (!session?.token?.supporter) && !singlePlayerRound?.done && !onboarding?.completed && (
    <div className={`topAdFixed ${(multiplayerTimerShown || onboardingTimerShown || singlePlayerRound)?'moreDown':''}`}>
      <Ad
      unit={"worldguessr_gameui_ad"}
      position="bottom-right"
    inCrazyGames={inCrazyGames} showAdvertisementText={false} screenH={height} types={[[728,90]]} centerOnOverflow={600} screenW={Math.max(400, width-450)} vertThresh={0.3} />
    </div>
)}

{ inCrazyGames && !singlePlayerRound?.done && !onboarding?.mode && !onboarding?.completed && !(width < 700 && height < 350) && (
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


{ multiplayerState?.gameData?.duel && !multiplayerState?.gameData?.team2v2 && multiplayerState?.gameData?.state !== 'end' && (() => {
  const players = multiplayerState?.gameData?.players || [];
  const myId = multiplayerState?.gameData?.myId;
  const me = players.find(p => p.id === myId);
  const opponent = players.find(p => p.id !== myId);
  return (
    <DuelIntroBars isStartingDuel={isStartingDuel} countdown={timeToNextMultiplayerEvt}
      leftBar={
        <HealthBar health={me?.score} maxHealth={5000} name={text("you")}
          isStartingDuel={isStartingDuel} elo={me?.elo} countryCode={me?.countryCode} />
      }
      rightBar={
        <HealthBar health={opponent?.score} maxHealth={5000} name={opponent?.username}
          isStartingDuel={isStartingDuel} elo={opponent?.elo} countryCode={opponent?.countryCode}
          isOpponent={true} disconnected={!!opponent?.disconnected}
          hasProfile={!!opponent?.accountId} />
      }
    />
  );
})()}

{/* 2v2 team health bars: one shared bar per team (your team vs enemy team) */}
{ multiplayerState?.gameData?.team2v2 && multiplayerState?.gameData?.state !== 'end' && (() => {
  const players = multiplayerState?.gameData?.players || [];
  const myId = multiplayerState?.gameData?.myId;
  // No silent 'a' default (it swapped Your/Enemy bars on a roster lookup
  // miss) — skip the frame instead; the next snapshot re-orients us.
  const myTeam = getMyTeam(players, myId);
  if (!myTeam) return null;
  const enemyTeam = myTeam === 'a' ? 'b' : 'a';
  const teamScores = multiplayerState?.gameData?.teamScores || { a: 5000, b: 5000 };
  // Arrays of {name, countryCode, …}, not joined strings — HealthBar stacks
  // one name per line (with flag, profile link, disconnect marker) for small
  // teams and collapses 4+ into the team label with hover/tap expansion.
  const nameEntry = (p) => ({
    name: p.id === myId ? text("you") : p.username,
    username: p.username,
    isMe: p.id === myId,
    // Guests have no /user page — accountId (absent for guests) gates the
    // profile link so their names never render as dead links.
    hasProfile: !!p.accountId,
    countryCode: p.countryCode || null,
    disconnected: !!p.disconnected,
  });
  const myNames = players.filter(p => p.team === myTeam)
    .sort((a, b) => (b.id === myId) - (a.id === myId))
    .map(nameEntry);
  const enemyNames = players.filter(p => p.team === enemyTeam).map(nameEntry);
  return (
    <DuelIntroBars isStartingDuel={isStartingDuel} countdown={timeToNextMultiplayerEvt}
      leftBar={
        <HealthBar health={teamScores[myTeam]} maxHealth={5000} name={text("yourTeam")}
          names={myNames.length ? myNames : null}
          isStartingDuel={isStartingDuel} />
      }
      rightBar={
        <HealthBar health={teamScores[enemyTeam]} maxHealth={5000} name={text("enemyTeam")}
          names={enemyNames.length ? enemyNames : null}
          isStartingDuel={isStartingDuel} isOpponent={true} />
      }
    />
  );
})()}

{/* Party team mode: cumulative team totals (NOT the 2v2 HP bars above).
    Hidden during round-1 getready so it doesn't fight the centered
    "game starting in" banner, and while the between-rounds leaderboard is
    up — its fullscreen team hero shows the SAME totals bigger (with round
    deltas), so the pinned bar would duplicate it and collide with it on
    top of the dark overlay whenever the hero lands near the top
    (safe-center overflow on tall rosters / short viewports). */}
{ multiplayerState?.inGame && multiplayerState?.gameData?.teamGame && !multiplayerState?.gameData?.team2v2
  && multiplayerState?.gameData?.state !== 'end'
  && !leaderboardVisible
  && !(multiplayerState?.gameData?.state === 'getready' && multiplayerState?.gameData?.curRound === 1) && (
  <TeamScorebar gameData={multiplayerState.gameData} />
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


{ singlePlayerRound?.done && !dailyMode && (
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


      {(!countryGuesser || (countryGuesser && showAnswer)) && multiplayerMapStateAllowsRender && ((multiplayerState?.inGame && multiplayerState?.gameData?.curRound === 1) ? (multiplayerState?.gameData?.state === "guess" || multiplayerRoundOverShowingAnswer) : true ) && (
        <>


      <div id="miniMapArea" onMouseEnter={() => {
        if(!loading) setMiniMapExpanded(true)
      }} onMouseLeave={() => {
        if(mapPinned || showAnswerOnMap) return;
        setMiniMapExpanded(false)
      }} className={`miniMap ${miniMapExpanded && !showAnswerOnMap ? 'mapExpanded' : ''} ${shouldShowMiniMap ? 'shown' : ''} ${showAnswerOnMap ? 'answerShown' : 'answerNotShown'} ${(showAnswerOnMap && countryGuesser && !showPanoOnResult) || mapFadingOutForRender ? 'countryGuessrMapReveal' : ''} ${mapFadingOutForRender ? 'countryGuessrMapFadeOut' : ''} ${miniMapFullscreen&&miniMapExpanded ? 'fullscreen' : ''} ${forceHideMiniMap ? 'forceHidden' : ''}`}>

{!showAnswerOnMap && (
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
        <MapWidget shown={mapReadyForCameraReset} options={options} ws={ws} gameOptions={gameOptions} answerShown={showAnswerOnMap} session={session} showHint={hintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} location={mapLocationForRender} setKm={setKm} multiplayerState={multiplayerState} countryGuessPin={guessedCountryCode && !countryGuesserCorrect && countryCoordinates[guessedCountryCode] ? countryCoordinates[guessedCountryCode] : null} stopCameraAnimations={mapFadingOutForRender || forceHideMiniMap} resetKey={mapCameraResetKey} cameraCancelKey={mapCameraCancelKey} />


        <div className={`miniMap__btns ${showAnswerOnMap ? 'answerShownBtns' : ''}`}>
          {renderGuessHintBtns()}
        </div>
      </div>

      <div className={`mobile_minimap__btns ${miniMapShown ? 'miniMapShown' : ''} ${(showAnswer||singlePlayerRound?.done||onboarding?.completed) ? 'answerShownBtns' : ''}`}>
        {miniMapShown && renderGuessHintBtns()}
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

      { countryGuesser && otherOptions?.length > 0 && (
        <CountryBtns countries={otherOptions} shown={!loading && showCountryButtons && !showAnswer && !!latLong?.country} mode={onboarding?.mode || countryGuessrMode?.subMode || "country"} compact={!onboarding}

         onCountryPress={(selected) => {
          const isContinentMode = onboarding?.mode === "continent" || (!onboarding && countryGuesser && otherOptions?.includes?.("Africa"));
          const isCorrect = isContinentMode ? continentFromCode(latLong.country) === selected : selected === latLong.country;
          setCountryGuesserCorrect(isCorrect);
          setGuessedCountryCode(selected);
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
          logOnboardingAdvance("country-button-guess", {
            selected,
            isCorrect,
            mode: isContinentMode ? "continent" : "country",
          });
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

      {/* Non-duel multiplayer timer — two line style. timer--with-scorebar:
          in team parties the mobile timer stacks under the top-center
          scorebar instead of colliding with it (CSS ≤830px tier). Applied
          only while the scorebar is actually rendered — during the
          between-rounds leaderboard the scorebar yields to the fullscreen
          team hero, so the timer returns to its right-anchored spot.
          Skipped in CrazyGames: its 320x50 gameui ad rides .moreDown to
          top:100 on narrow screens, which is exactly where the centered
          stacked timer would land — CG keeps the right-anchored spot. */}
      {!(multiplayerState?.gameData?.duel && multiplayerState?.gameData?.public) && (
      <span className={`timer timer--two-line ${multiplayerState?.gameData?.teamGame && !leaderboardVisible && !inCrazyGames ? 'timer--with-scorebar' : ''} ${!multiplayerTimerShown ? '' : 'shown'} ${timeToNextMultiplayerEvt <= 5 && timeToNextMultiplayerEvt > 0 && !showAnswer && !pinPoint && multiplayerState?.gameData?.state === 'guess' ? 'critical' : ''}`}>
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
        <span className="timer__round-label">{onboarding ? text("tutorialRound", {round: onboarding.round, total: onboarding.locations?.length || 3}) : text("round", {r:onboarding?.round, mr: 5})}</span>
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
            <span className={`timer timer--two-line shown ${dailyMode ? 'onTop' : ''} ${singlePlayerTimeLeft <= 5 && singlePlayerTimeLeft > 0 && gameOptions.timePerRound > 0 && !showAnswer && !pinPoint ? 'critical' : ''}`}>
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
          <PlayerList multiplayerState={multiplayerState} fadingOut={!leaderboardVisible} />
        )}


        {/* Private game over screen */}
        {multiplayerState && multiplayerState.inGame && !multiplayerState?.gameData?.duel && !multiplayerState?.gameData?.teamGame && multiplayerState?.gameData?.state === "end" && (
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

        {/* PRIVATE duel / team-party game over screen. Team parties get the
            duel presentation (Victory/Defeat headline); if the duelEnd message
            was missed (reconnect into end), derive a fallback from teamScores
            so this screen can never fail to render. PUBLIC matchmade duels
            (ranked 1v1 + 2v2) are owned by home.js's overlay, which carries
            the requeue/rematch actions — rendering both stacks two screens. */}
        {multiplayerState && multiplayerState.inGame && (multiplayerState?.gameData?.duel || multiplayerState?.gameData?.teamGame) && !multiplayerState?.gameData?.public && multiplayerState?.gameData?.state === "end" && (
          <RoundOverScreen
            history={multiplayerState?.gameData?.history || []}
            duel={true}
            data={multiplayerState?.gameData?.duelEnd ?? deriveTeamEndFallback(multiplayerState?.gameData)}
            multiplayerState={multiplayerState}
            gameId={multiplayerState?.gameData?.code}
            button1Text={multiplayerState?.gameData?.public ? text("playAgain") : null}
            button1Press={multiplayerState?.gameData?.public ? () => backBtnPressed(true, "ranked") : null}
            button2Text={(multiplayerState?.gameData?.public || multiplayerState?.gameData?.host) ? text("back") : null}
            button2Press={(multiplayerState?.gameData?.public || multiplayerState?.gameData?.host) ? () => backBtnPressed() : null}
            teamActions={multiplayerState?.gameData?.team2v2 ? {
              playAgain: () => { try { ws.send(JSON.stringify({ type: 'playAgain2v2' })); } catch (e) {} },
              back: () => { try { ws.send(JSON.stringify({ type: 'teamDuelBack' })); } catch (e) {} }
            } : null}
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
isWorldMap={gameOptions?.location === "all"}
dailyMode={dailyMode}
singlePlayerRound={singlePlayerRound} onboarding={onboarding} countryGuesser={countryGuesser} countryGuesserCorrect={countryGuesserCorrect} guessTier={guessTier} options={options} isContinentMode={onboarding?.mode === "continent" || (!onboarding && countryGuesser && otherOptions?.includes?.("Africa"))} countryStreak={countryGuesser ? (otherOptions?.includes?.("Africa") || onboarding?.mode === "continent" ? continentGuessrStreak : countryGuessrStreak) : countryStreak} lostCountryStreak={countryGuesser ? (otherOptions?.includes?.("Africa") || onboarding?.mode === "continent" ? lostContinentGuessrStreak : lostCountryGuessrStreak) : lostCountryStreak} usedHint={hintShown} session={session}  guessed={showAnswer} latLong={latLong} pinPoint={pinPoint} fullReset={(advanceRequest)=>{
  advanceRound(advanceRequest?.source || "endBanner");
  }} km={km} setExplanationModalShown={setExplanationModalShown} multiplayerState={multiplayerState} mapFadingOut={mapFadingOut} toggleMap={() => {
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
