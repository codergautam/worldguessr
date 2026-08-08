import { useCallback, useEffect, useLayoutEffect, useState, useRef } from "react"
import dynamic from "next/dynamic";
import { FaMap } from "react-icons/fa";
import useWindowDimensions from "./useWindowDimensions";
import EndBanner from "./endBanner";
import calcPoints from "./calcPoints";
import findCountryLocal, { findCountryLocalSync } from "./findCountryLocal";
import { loadBorders } from "./utils/loadBorders";
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
import { playSfx, preloadSfx, stopSfx } from "./utils/audio";
import PlaywireAd from "./bannerAdPlaywire";
import CrazyGamesBanner from "./bannerAdCrazyGames";
import GameDistributionBanner from "./bannerAdGameDistribution";
import AnimatedCounter from "./AnimatedCounter";
import gameStorage from "./utils/localStorage";
import HealthBar from "./duelHealthbar";
import TeamScorebar from "./teamScorebar";
import deriveTeamEndFallback from "./utils/teamDuelEndFallback";
import getMyTeam from "./utils/getMyTeam";
import { DUEL_INTRO_EXIT_MS } from "./utils/duelIntroTiming";

const ONBOARDING_MIN_MANUAL_ADVANCE_MS = 6000;

// Shared scaffold for the duel HP bars + 5s "VS" intro — one source for the
// layout so intro tweaks can't drift between the 1v1 and team-duel blocks.
//
// Two independent layers:
//   1. Bars — centered during getready; corner + slide the frame guess starts.
//   2. VS chrome — one continuous mount for intro AND exit. Same classes the
//      whole time; only `.hb-vs-chrome--exiting` flips opacity. Never remount
//      into a different style context (that was the glow→plain-box jump).
function DuelIntroBars({ isStartingDuel, vsExiting, countdown, leftBar, rightBar }) {
  const showVsChrome = isStartingDuel || vsExiting;

  return (
    <>
      <div className={isStartingDuel ? 'hb-parent' : undefined}>
        <div className={isStartingDuel ? 'hb-bars' : undefined}>
          {/* hb-left: stable hook for home.js's reload-button collision probe */}
          <div
            style={{ zIndex: 1001, position: 'fixed', top: 0, left: 0, pointerEvents: 'none' }}
            className={['hb-left', isStartingDuel ? 'hb-start1' : 'hb-corner-enter--left'].join(' ')}
          >
            {leftBar}
          </div>

          {/* Invisible spacer so the bars keep the VS gap while the real label
              lives in the absolute chrome layer (same metrics as .hb-vs-label). */}
          {isStartingDuel && (
            <span className="hb-vs-slot" aria-hidden="true">VS</span>
          )}

          <div
            style={{ zIndex: 1001, position: 'fixed', top: 0, right: 0, pointerEvents: 'none' }}
            className={isStartingDuel ? 'hb-start2' : 'hb-corner-enter--right'}
          >
            {rightBar}
          </div>
        </div>

        {isStartingDuel && (
          <p className="hb-vs-countdown hb-vs-countdown--slot" aria-hidden="true">
            {countdown}
          </p>
        )}
      </div>

      {showVsChrome && (
        <div className={`hb-vs-chrome${vsExiting ? ' hb-vs-chrome--exiting' : ''}`}>
          <p className="hb-vs-label">VS</p>
          <p className="hb-vs-countdown">{countdown}</p>
        </div>
      )}
    </>
  );
}

const MapWidget = dynamic(() => import("../components/Map"), { ssr: false });
// import RoundOverScreen from "./roundOverScreen";
const RoundOverScreen = dynamic(() => import("./roundOverScreen"), { ssr: false });

export default function GameUI({ inCoolMathGames, inGameDistribution, miniMapShown, setMiniMapShown, singlePlayerRound, setSinglePlayerRound, showDiscordModal, setShowDiscordModal, inCrazyGames, countryGuesserCorrect, setCountryGuesserCorrect, otherOptions, onboarding, setOnboarding, countryGuesser, options, timeOffset, ws, multiplayerState, backBtnPressed, setMultiplayerState, countryStreak, setCountryStreak, loading, setLoading, session, gameOptionsModalShown, setGameOptionsModalShown, mapModal, latLong, loadLocation, gameOptions, setGameOptions, showAnswer, setShowAnswer, pinPoint, setPinPoint, hintShown, setHintShown, showCountryButtons, setShowCountryButtons, welcomeOverlayShown, countryGuessrMode, dailyMode, onRoundsComplete, mapSwitchMaskShown }) {
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

  function loadLocationFuncRaw(keepAnswer, advanceSource, forceLoad) {
    if (onboarding && advanceSource) {
      logOnboardingAdvance("loadLocationFuncRaw", { keepAnswer, advanceSource });
    }
    if(onboarding) {
      if(onboarding.completed) {
        // Reset onboarding to start over - preserve template locations
        setOnboarding({
          round: 1,
          points: 0,
          maxPoints: 0,
          mode: onboarding.mode,
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
            maxPoints: prev.maxPoints,
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
          // Completion must be idempotent: racing advance triggers (double
          // click, space + click, queued midgame-ad callbacks on CG/Poki)
          // can all land here, and the save below must run exactly once.
          if (prev.done) return prev;
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


      loadLocation({ keepAnswer, force: forceLoad })

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
      if(Date.now() - loadTime > 600000 && !process.env.NEXT_PUBLIC_COOLMATH && !process.env.NEXT_PUBLIC_GAMEDISTRIBUTION && !process.env.NEXT_PUBLIC_POKI) {
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
    if((inGameDistribution || inCrazyGames || process.env.NEXT_PUBLIC_POKI === "true") && singlePlayerRound && !singlePlayerRound.done && singlePlayerRound.round > 1 && window.crazyMidgame) {
      // Raise the loading cover BEFORE the ad: the round teardown runs under
      // the ad surface, so whatever the SDK uncovered at ad end (half-torn
      // answer scene, stale pano) flickered between backgrounds. With the
      // cover up, ad exit always reveals the stable loading screen. The
      // post-ad load must then force past loadLocation's own
      // `if (loading && !force)` guard, which this very cover would trip.
      // Final-round advances land on the summary and never touch `loading`,
      // so raising it there would strand the cover — hence the gate.
      const advancesToNextRound = singlePlayerRound.round < singlePlayerRound.totalRounds;
      if (advancesToNextRound && setLoading) setLoading(true);
      window.crazyMidgame(() => {
        afterAd()
        loadLocationFuncRaw(keepAnswer, advanceSource, advancesToNextRound)
      });
    } else {
      afterAd()
      loadLocationFuncRaw(keepAnswer, advanceSource)
    }


  }

  // Single canonical "advance to next round" path used by every trigger
  // (EndBanner button, space key, auto-advance, summary Play Again). Without
  // this, each caller had its own copy of the transition timing and only the
  // one that was edited would have the fade — pressing the other path showed
  // the raw size revert / slide-down.
  //
  // The transition is chosen by what's on screen when the trigger fires:
  //   1. Final-round "View Results" (endsGame): NO teardown — the answer
  //      scene stays mounted as the results summary's crossfade base.
  //   2. Play Again from the summary (done): the map is COVERED / hidden —
  //      yank it forceHidden in the same commit the answer state clears. A
  //      visible fade here would UNCOVER it first: the old answer map (often
  //      street-level zoom) flashes fullscreen before fading.
  //   3. Mid-game next round: fade the answer map in place
  //      (countryGuessrMapFadeOut fades, countryGuessrMapReveal pins
  //      transform so it can't slide), then reset it under cover and release
  //      only after Map verifies the final camera.
  // Paths 2 and 3 use mapResetting's completion handshake; there is no
  // elapsed-time guess for when the camera is safe to expose.
  function advanceRound(advanceSource) {
    // Multiplayer rounds are server-driven; nothing here applies. The one
    // path that reaches this in MP is the spacebar handler (showAnswer is
    // multiplayerShowAnswer during a reveal), and letting it run case 3
    // set mapResetting in a mount whose completion handshake can never fire
    // — the reveal map snapped invisible and stayed broken for the match.
    // SP-family mounts don't pass multiplayerState, so this is inert there.
    if (multiplayerState?.inGame) return;
    // A fade / hidden reset is already in flight — a re-entrant trigger
    // (space spam) would advance a second time and skip a round.
    if (mapFadingOut || mapResetting) return;
    setMapCameraCancelKey((prev) => prev + 1);
    // Game-ending advance ("View Results" / space on the final answer): the
    // results summary is about to mount ON TOP of this scene, and it takes
    // real time to paint (dynamic chunk fetch + Leaflet init + 500ms fade).
    // Don't fade anything here — keep the scene fully mounted as the
    // summary's crossfade base; tearing it down exposes the raw pano behind
    // the fading summary. MP end screens already work exactly this way
    // (their answer scene survives into state === 'end'). Teardown happens
    // on the next advance: Play Again / space-replay land in the fade path
    // below, and re-entering singleplayer remounts GameUI → loadLocation().
    const endsGame = !onboarding && singlePlayerRound && !singlePlayerRound.done
      && singlePlayerRound.round === singlePlayerRound.totalRounds;
    if (endsGame) {
      loadLocationFunc(true, advanceSource);
      return;
    }
    // Case 2: replay from the results summary — yank under cover (see above).
    if (singlePlayerRound?.done) {
      setShowAnswer(false);
      setPinPoint(null);
      // Mobile sheet closes with the round, same as MP's WS-batch close —
      // belt over the latLong-change collapse, which can't fire until the
      // new location actually lands.
      setMiniMapShown(false);
      // Country/continent guessers intentionally unmount the map while
      // guessing, so there is no live camera to wait for.
      setMapResetting(!countryGuesser);
      loadLocationFunc(true, advanceSource);
      if (countryGuesser) window._countryGuessrKeepAnswer = false;
      return;
    }

    // Case 3: mid-game — preserve the smooth answer-map crossfade. Resetting
    // immediately here exposes the preloaded iframe's black swap and makes the
    // camera reset read as a visible zoom. Only the old post-fade blind delay
    // is removed; the camera work itself stays fully hidden.
    // Same round-boundary close as case 2 / the MP batch. Harmless on
    // desktop: the layout effect re-derives the corner minimap pre-paint.
    setMiniMapShown(false);
    setFadeOutMapLocation(latLong);
    setMapFadingOut(true);
    window._countryGuessrKeepAnswer = true;
    // The map still renders as an answer through mapFadingOutForRender, but
    // raw showAnswer can clear now. On touch layouts this drops
    // .answerShownBtns on the SAME click frame, exposing the Guess button
    // immediately while the stale map remains safely covered/fading.
    setShowAnswer(false);
    loadLocationFunc(true, advanceSource);
    setTimeout(() => {
      setMapFadingOut(false);
      setFadeOutMapLocation(null);
      setPinPoint(null);
      // The fade is done (map at opacity 0) — now hold it forceHidden while
      // the event-driven camera reset lands, then reveal the verified map.
      if (countryGuesser) {
        // This mode unmounts the map in guess phase; no reset callback can
        // arrive from an unmounted map, and none is needed.
        setMapResetting(false);
        window._countryGuessrKeepAnswer = false;
      } else {
        setMapResetting(true);
      }
    }, 300);
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
  // Hidden reset ownership. ExtentFitter clears this through
  // finishHiddenMapReset only after the destination size is stable and the
  // canonical center+zoom has been applied twice.
  const [mapResetting, setMapResetting] = useState(false);
  const finishHiddenMapReset = useCallback(() => {
    setMapResetting(false);
    window._countryGuessrKeepAnswer = false;
  }, []);
  // Watchdog on the completion handshake. advanceRound's re-entry guard
  // blocks on mapResetting, and the ONLY thing clearing it is ExtentFitter
  // reaching its completion callback — which never happens if Leaflet throws
  // into the error boundary (a known intermittent crash) or a pano load
  // hangs. Before the event-driven rework a hard 350ms timer cleared this
  // unconditionally; without a fallback, one miss soft-locks every future
  // round advance. 1500ms = 4x the old budget, so it only fires when the
  // handshake is genuinely broken; firing early at worst exposes the map a
  // frame before the camera verify, which is exactly what the old timer did
  // every round. Goes through finishHiddenMapReset so the keepAnswer global
  // is cleared on this path too.
  useEffect(() => {
    if (!mapResetting) return;
    const t = setTimeout(finishHiddenMapReset, 1500);
    return () => clearTimeout(t);
  }, [mapResetting, finishHiddenMapReset]);
  const [timeToNextMultiplayerEvt, setTimeToNextMultiplayerEvt] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  const leaderboardFadeInFrameRef = useRef(null);
  const [timeToNextRound, setTimeToNextRound] = useState(0); //only for onboarding
  const [singlePlayerTimeLeft, setSinglePlayerTimeLeft] = useState(0);
  const [mapPinned, setMapPinned] = useState(false);
  const prevMultiplayerRoundStateRef = useRef({ state: null, round: null });
  // dist between guess & target
  const [km, setKm] = useState(null);
  const [explanationModalShown, setExplanationModalShown] = useState(false);

  const [explanations, setExplanations] = useState([]);
  const [showClueBanner, setShowClueBanner] = useState(false);
  const [hintsUsedThisGame, setHintsUsedThisGame] = useState(0);

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

  const isStartingDuel = !!(multiplayerState && multiplayerState.inGame && multiplayerState?.gameData?.state === 'getready' && multiplayerState?.gameData?.curRound === 1);
  // Render-time leave edge (ref still holds the previous getready). That keeps
  // the VS chrome mounted on the guess frame with --exiting already on — no
  // unmount/remount, no style context swap. Hold covers the dissolve after.
  const prevStartingDuelRef = useRef(false);
  const justLeftStartingDuel = prevStartingDuelRef.current && !isStartingDuel;
  const [vsExitHold, setVsExitHold] = useState(false);
  useLayoutEffect(() => {
    if (justLeftStartingDuel) setVsExitHold(true);
  }, [justLeftStartingDuel]);
  useEffect(() => {
    prevStartingDuelRef.current = isStartingDuel;
  }, [isStartingDuel]);
  useEffect(() => {
    if (!vsExitHold) return;
    const t = setTimeout(() => setVsExitHold(false), DUEL_INTRO_EXIT_MS);
    return () => clearTimeout(t);
  }, [vsExitHold]);
  useEffect(() => {
    if (multiplayerState?.inGame) return;
    setVsExitHold(false);
    prevStartingDuelRef.current = false;
  }, [multiplayerState?.inGame]);
  const vsExiting = justLeftStartingDuel || vsExitHold;
  const duelIntroOverlayShown = isStartingDuel || vsExiting;
  // Freeze the getready countdown for the dissolve. The live timer flips to the
  // guess-phase nextEvtTime (~60s) on the same state change, and painting that
  // into the fading VS chrome reads as a glitch.
  const introCountdownRef = useRef(0);
  if (isStartingDuel) introCountdownRef.current = timeToNextMultiplayerEvt;
  const vsChromeCountdown = introCountdownRef.current;

  useEffect(() => {
    if(showAnswer) {
      if (onboarding && !onboarding.completed && onboarding.mode !== "classic") {
        onboardingRevealStartedAt.current = Date.now();
      }
    } else {
      setGuessedCountryCode(null);
      onboardingRevealStartedAt.current = 0;
    }
  }, [showAnswer, onboarding?.round, onboarding?.completed, onboarding?.mode])



  // Multiplayer round clock. Reads its inputs through a ref rather than deps:
  // `multiplayerState` gets a fresh identity on EVERY WebSocket message, so a
  // dep on it tore down and rebuilt this interval constantly (and reset its
  // phase). The only thing that should own an interval here is "am I in a game
  // at all".
  const mpClockRef = useRef({ nextEvtTime: null, timeOffset: 0 });
  mpClockRef.current = {
    nextEvtTime: multiplayerState?.inGame ? (multiplayerState?.gameData?.nextEvtTime ?? null) : null,
    timeOffset,
  };
  const mpClockRunning = !!(multiplayerState?.inGame);
  useEffect(() => {
    if (!mpClockRunning) return;
    const interval = setInterval(() => {
      const { nextEvtTime, timeOffset: offset } = mpClockRef.current;
      if (!nextEvtTime) return;
      const next = Math.max(0, Math.floor(((nextEvtTime - Date.now()) - offset) / 100) / 10);
      // Bail out when the tenth-of-a-second hasn't moved. Each accepted tick
      // re-renders this whole component (timer, HP bars, EndBanner, ad slots,
      // the Leaflet subtree before it was memoized) — a no-op setState paying
      // that price 10x/sec is pure waste, and it stacked straight onto the
      // answer reveal, the heaviest frames of the round.
      setTimeToNextMultiplayerEvt((prev) => (prev === next ? prev : next));
    }, 100);
    return () => clearInterval(interval);
  }, [mpClockRunning])

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
        if (countryGuesser) {
          // Country/Continent Guesser: picking a country submits instantly,
          // so a timeout means no answer — resolve as a wrong guess (streak
          // reset + reveal) through the shared submit path. There is no
          // .guessBtn to click here (the minimap only mounts at reveal).
          submitCountryGuess(null);
        } else if (pinPointRef.current) {
          // Player placed a pin — submit their guess normally
          document.querySelector('.guessBtn')?.click();
        } else {
          // No pin placed — score 0 points and show answer
          setShowAnswer(true);
          // World-map streaks only (same gate as guess()); a community-map
          // timeout must not touch them. Mirror a pin-based miss: stamp the
          // "lost your N streak" line, which also CLEARS a stale loss line
          // from the previous round (lostCountryStreak would otherwise leak
          // onto this reveal's banner).
          if (gameOptions.location === 'all') {
            setLostCountryStreak(countryStreak);
            setCountryStreak(0);
          }
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
    // Re-arm the country buttons each round (guess() hides them); harmless in
    // classic rounds since CountryBtns only renders when countryGuesser is set
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
        // Space substitutes for a button press here — sound it like one
        // (the delegated click listener only hears real clicks).
        playSfx('click_2');
        advanceRound("space-singleplayer-done")
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
        // Space = Next Round / View Results press; the delegated click
        // listener can't hear keyboard advances, so sound it explicitly.
        playSfx('click_2');
        advanceRound("space-answer")
      }
    }
    // on space key press, guess
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
    }
  }, [pinPoint, showAnswer, onboarding, explanationModalShown, singlePlayerRound])

  // Onboarding keeps the guess map available while the pano is still loading:
  // a brand-new player beelining for the map shouldn't have to wait on Street
  // View (the drop-in A/B variant lands here with nothing else on screen).
  // Gated on the tile layer's first 'load' event so the early reveal shows a
  // fully painted map — un-gated it slid in mid-tile-fetch, flashing white.
  const [miniMapTilesLoaded, setMiniMapTilesLoaded] = useState(false);
  const onboardingActive = !!(onboarding && !onboarding.completed);
  const onboardingMapWhileLoading = onboardingActive && miniMapTilesLoaded;
  // Stable identity: this is the only callback prop <MapWidget> takes, and Map
  // is memoized — an inline arrow here would break the memo on every one of
  // this component's ~10 renders/sec and re-walk the whole Leaflet subtree.
  const handleTilesLoaded = useCallback(() => setMiniMapTilesLoaded(true), []);

  // useLayoutEffect, NOT useEffect. The multiplayer round-start batch sets
  // miniMapShown=false in home.js's WebSocket handler (it exists to collapse
  // the MOBILE expanded minimap before the new round paints). On desktop this
  // effect immediately wants it back to true — but as a passive effect it ran
  // AFTER paint, so there was one painted frame with `.shown` missing. That
  // frame is enough to start #miniMapArea's transition toward
  // translateY(105%) + opacity 0, which then reverses: the corner minimap
  // visibly dips and flashes on every single round reset. Running before paint
  // means the false and the true collapse into one frame and nothing animates.
  //
  // !mapResetting: hold the corner minimap until the post-fade settle
  // window ends, so it fades in once, cleanly, after the map has already
  // snapped back to the corner rect (see mapResetting).
  // !mapSwitchMaskShown: same hold for the options-modal map switch — its
  // window is owned by home's switch mask (see forceHideMiniMap below).
  //
  // Mobile owns this state through the Guess toggle. Do not force it false on
  // mapResetting: a player can press the newly-immediate Guess button during
  // the 300ms crossfade, and that request must survive until the hidden camera
  // reset releases the map. Round-change effects below already collapse it.
  const desktopMiniMapLayoutRef = useRef(false);
  useLayoutEffect(() => {
    const desktopLayout = width > 600 && !isTouchScreen;
    if (desktopLayout && (!loading || onboardingMapWhileLoading) && latLong && !mapResetting && !mapSwitchMaskShown) {
      setMiniMapShown(true)
    } else if (desktopLayout || desktopMiniMapLayoutRef.current) {
      // Desktop controls visibility automatically. Also collapse exactly once
      // when a responsive layout crosses from desktop to mobile.
      setMiniMapShown(false)
    }
    desktopMiniMapLayoutRef.current = desktopLayout;
  }, [loading, latLong, width, isTouchScreen, mapResetting, onboardingMapWhileLoading, mapSwitchMaskShown, setMiniMapShown])

  // Mobile's between-rounds close. The effect above deliberately no longer
  // touches miniMapShown on phones (so transient settle flags can't eat a
  // Guess tap made during the crossfade) — but that removed the only thing
  // closing the sheet at round transitions, and an opened sheet stayed open
  // for every following round in SP/CG/onboarding/daily (MP survives via
  // home's same-batch close). Close it exactly when the ROUND changes —
  // latLong is the one input every mode replaces exactly once per round —
  // and at no other moment, so a mid-round open is never stomped. Layout
  // effect: the false must land in the same paint as the new round, or the
  // sheet visibly starts its slide-away on frame one (the same one-frame
  // flash the desktop branch above is pre-paint for).
  const prevRoundLatLongRef = useRef(latLong);
  useLayoutEffect(() => {
    const prev = prevRoundLatLongRef.current;
    prevRoundLatLongRef.current = latLong;
    if (width > 600 && !isTouchScreen) return; // desktop: owned above
    if (!latLong || latLong === prev) return;
    setMiniMapShown(false);
  }, [latLong, width, isTouchScreen, setMiniMapShown])

  // Derive this during render, while the ref still describes the previous
  // multiplayer state. ExtentFitter's child effect runs before this component's
  // effect, so setting a flag below is one commit too late: it takes the legacy
  // hard-reset path and mounts the flat blue camera cover. Passing the
  // transition directly lets BoundsApplier skip its pre-paint snap and lets
  // ExtentFitter start the camera flight on the same commit as the CSS shrink.
  // DESKTOP ONLY (same gate as the minimap layout effect above). The visible
  // shrink-fly and its `.shown` hold are desktop furniture; on phones the
  // reveal exit is a ruled SNAP, and holding `.shown` there had a nasty side
  // effect: mobile's `.miniMap.shown` IS the expanded 70% guess sheet, so the
  // hold opened the sheet uninvited at the start of every round and then slid
  // it away. Everything downstream inherits this gate — mpRevealExitHold,
  // keepMapThroughRevealExit, and the smoothReset prop into Map.js — so
  // mobile keeps its pre-existing exit path end to end.
  const multiplayerAnswerRevealLeaving = !!(
    width > 600 && !isTouchScreen &&
    multiplayerState?.inGame &&
    prevMultiplayerRoundStateRef.current.state === "getready" &&
    prevMultiplayerRoundStateRef.current.round !== 1 &&
    multiplayerState?.gameData?.state === "guess" &&
    prevMultiplayerRoundStateRef.current.round === multiplayerState?.gameData?.curRound
  );

  // `multiplayerAnswerRevealLeaving` is true for a single render. The CSS shrink
  // + camera fly run for ~400ms after that (SMOOTH_RESET_FLY_SEC); keep the map
  // out of forceHide and keep `.shown` for that window so a still-loading
  // next-round pano cannot snap the box off-screen mid-transition
  // (forceHidden uses transition:none).
  const [mpRevealExitHold, setMpRevealExitHold] = useState(false);
  useLayoutEffect(() => {
    if (!multiplayerAnswerRevealLeaving) return;
    setMpRevealExitHold(true);
  }, [multiplayerAnswerRevealLeaving]);
  useEffect(() => {
    if (!mpRevealExitHold) return;
    const t = setTimeout(() => setMpRevealExitHold(false), 420);
    return () => clearTimeout(t);
  }, [mpRevealExitHold]);
  const keepMapThroughRevealExit =
    multiplayerAnswerRevealLeaving ||
    mpRevealExitHold;

  useEffect(() => {
    if (!multiplayerState?.inGame) {
      prevMultiplayerRoundStateRef.current = { state: null, round: null };
      setMapFadingOut(false);
      setFadeOutMapLocation(null);
      setMpRevealExitHold(false);
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

    if (startedNewGuessRound && !mapPinned) {
      setMiniMapExpanded(false);
      setMiniMapFullscreen(false);
    }

    prevMultiplayerRoundStateRef.current = { state: curState, round: curRound };
  }, [multiplayerState?.inGame, multiplayerState?.gameData?.state, multiplayerState?.gameData?.curRound, mapPinned]);

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
        {/* Outside multiplayer the press reveals instantly, so the guess
            whoosh IS the press sound — mute the generic click_2 (also covers
            the spacebar path, which .click()s this button). In multiplayer
            the reveal lags the press, so the click stays. */}
        <button className={`miniMap__btn ${!pinPoint || iAmFinal ? 'unavailable' : ''} guessBtn`} disabled={!pinPoint || iAmFinal} onClick={guess} data-no-click-sfx={!multiplayerState?.inGame || undefined}>
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

  // The guess whoosh is the ANSWER-REVEAL sound, not a button-press sound —
  // in multiplayer the reveal can lag the press (waiting on the opponent /
  // the round timer), and the whoosh must land with the reveal.
  // Singleplayer/daily/onboarding reveal = showAnswer flipping true (covers
  // the guess button, spacebar, and the timeout-without-pin path alike).
  // The reveal sound's pitch tracks guess quality: 0.85 (no guess / total
  // miss) up to 1.2 (perfect). Country/continent modes are binary by
  // nature — correct gets the top pitch, wrong (including timeout) the
  // bottom. Classic modes scale on the round's score fraction, recomputed
  // from the pin (same formula the end banner shows), so MP and SP share
  // one path; no pin at reveal = never guessed = bottom pitch.
  function guessRevealRate() {
    const binaryMode = countryGuesser || (onboarding?.mode && onboarding.mode !== "classic");
    let q = 0;
    if (binaryMode) {
      q = countryGuesserCorrect ? 1 : 0;
    } else if (pinPoint && latLong?.lat != null) {
      const maxDist = multiplayerState?.inGame
        ? (multiplayerState?.gameData?.maxDist ?? 20000)
        : (gameOptions?.maxDist ?? 20000);
      q = calcPoints({ lat: latLong.lat, lon: latLong.long, guessLat: pinPoint.lat, guessLon: pinPoint.lng, usedHint: false, maxDist }) / 5000;
    }
    return 0.85 + 0.35 * Math.min(1, Math.max(0, q));
  }

  useEffect(() => {
    if (showAnswer) playSfx('guess', { rate: guessRevealRate() });
  }, [showAnswer]);
  // Multiplayer reveal = leaving the guess state: 'getready' shows the
  // between-rounds answer, 'end' shows the final-round answer. (Round-1
  // getready is unreachable here — prev state is never 'guess' before it.)
  const mpStateForSfx = multiplayerState?.inGame ? multiplayerState?.gameData?.state : null;
  const prevMpStateForSfxRef = useRef(null);
  useEffect(() => {
    const prev = prevMpStateForSfxRef.current;
    prevMpStateForSfxRef.current = mpStateForSfx;
    if (prev === 'guess' && (mpStateForSfx === 'getready' || mpStateForSfx === 'end')) {
      // latLong/pinPoint still hold the ENDED round here — the next round's
      // location only lands after getready.
      playSfx('guess', { rate: guessRevealRate() });
    }
  }, [mpStateForSfx]);

  // Last-5-seconds ticking, both round clocks: the multiplayer clock and the
  // singleplayer/daily optional timer (timePerRound game option — its
  // interval zeroes singlePlayerTimeLeft whenever the round isn't live:
  // modals, loading, reveal — so >0 alone means "clock running").
  // Deliberately NOT gated on pinPoint/final like the red 'critical' timer
  // style — a locked-in player still wants to hear the reveal closing in
  // (user ruling: plays whether you've guessed or not). One shot per round:
  // the window flag drops when the clock resets (reveal / next round /
  // modal pause), re-arming the edge — a modal pause restarts the round
  // clock in full, so its fresh final 5s legitimately tick again.
  // The 5.0s asset is cut to the window, so no stop handling is needed.
  const tickingWindow = !!(
    (multiplayerState?.inGame
      && multiplayerState?.gameData?.state === 'guess'
      && timeToNextMultiplayerEvt > 0 && timeToNextMultiplayerEvt <= 5)
    || (!multiplayerState?.inGame
      && singlePlayerTimeLeft > 0 && singlePlayerTimeLeft <= 5)
  );
  useEffect(() => {
    if (!tickingWindow) return;
    playSfx('ticking', { pitchJitter: 0, volume: 0.6 });
    // Rounds can end before the clock does (guess submitted during the
    // window; MP advances early once everyone is final) — fade the bed out
    // instead of letting it tick over the reveal. Cleanup also covers
    // unmount (leaving the game mid-window).
    return () => stopSfx('ticking');
  }, [tickingWindow]);
  // Fetch+decode before the first crunch moment — a fetch at T-5s would eat
  // into the window on a cold cache.
  const tickingPossible = !!(multiplayerState?.inGame || (singlePlayerRound && gameOptions?.timePerRound));
  useEffect(() => {
    if (tickingPossible) preloadSfx('ticking');
  }, [tickingPossible]);

  // Borders preload for the pin→country lookups at reveal time (world-map
  // streak verdict in guess(), wrong-country headline in EndBanner). With the
  // polygons cached, guess() resolves the pin's country SYNCHRONOUSLY, so the
  // streak update commits in the same render as setShowAnswer — resolving it
  // after the reveal made the banner swap its streak message while already on
  // screen. Held off while the welcome overlay is up (modal A/B variant):
  // that pre-interaction window must stay fetch-free.
  const needsBorders = !!(
    (gameOptions?.location === 'all' && !countryGuesser && !welcomeOverlayShown) || dailyMode
  );
  useEffect(() => {
    if (needsBorders) loadBorders().catch(() => {});
  }, [needsBorders]);

  // True "minutes actually played" per visit: GA4's engagement clock pauses
  // while focus sits inside the SV iframe, so guessed-round durations are the
  // only honest play-time signal. Accumulate per guessed round, flush as ONE
  // play_time event when the tab hides — a per-round event would fire at
  // game_start's rate, the volume that got game_start excluded from the BQ
  // export.
  const playTimeAccum = useRef({ seconds: 0, rounds: 0 });
  useEffect(() => {
    const flush = () => {
      const acc = playTimeAccum.current;
      if (acc.rounds > 0) {
        sendEvent('play_time', { seconds: acc.seconds, rounds: acc.rounds });
        playTimeAccum.current = { seconds: 0, rounds: 0 };
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  function guess(correctOverride) {
    // Guard against being called before a location has been loaded. Every branch
    // below dereferences latLong.lat/long, so bail out to avoid a TypeError.
    if (!latLong || latLong.lat == null || latLong.long == null) return;
    const isCorrect = correctOverride !== undefined ? correctOverride : countryGuesserCorrect;
    // Same math as the per-round timeTaken stamps below; hoisted so the
    // play-time accumulator and onboarding_guess share one value.
    const roundSeconds = Math.round((Date.now() - roundStartTime) / 1000);
    // SP + onboarding only: multiplayer never maintains roundStartTime (its
    // rounds are server-timed), so a stale stamp would poison the totals.
    // The 1h cap drops abandoned-tab rounds for the same reason.
    if ((onboarding || singlePlayerRound) && roundSeconds > 0 && roundSeconds < 3600) {
      playTimeAccum.current.seconds += roundSeconds;
      playTimeAccum.current.rounds += 1;
    }
    if (onboarding && !onboarding.completed && onboarding.mode !== "classic") {
      onboardingRevealStartedAt.current = Date.now();
    }
    setShowAnswer(true)
    if(showCountryButtons || setShowCountryButtons)setShowCountryButtons(false);
    if(onboarding) {
      // Arm-neutral bounce signal for the onboarding A/B: a submitted guess
      // takes identical intent in both variants (session_engaged is
      // focus-biased toward the modal arm; game_start auto-fires on dropin's
      // round-1 load). Onboarding-only keeps it out of the BQ export's daily
      // event budget. No timeout path reaches guess() during onboarding, so
      // every fire is a deliberate action.
      if (!onboarding.completed) {
        sendEvent("onboarding_guess", {
          round: (onboarding.gameResults?.length ?? 0) + 1,
          mode: onboarding.mode || "classic",
          timeTaken: roundSeconds,
        });
      }
      const isClassicRound = !((onboarding?.mode && onboarding.mode !== "classic") || countryGuesser);
      const roundPoints = !isClassicRound ? (isCorrect ? 1000 : 0) : calcPoints({ lat: latLong.lat, lon: latLong.long, guessLat: pinPoint?.lat, guessLon: pinPoint?.lng, usedHint: hintShown, maxDist: 20000});
      // Per-round max, accumulated at guess time: the mode pill lets a run mix
      // pin-drop (5000/round) and country (1000/round) rounds, so a single
      // mode-derived total would lie on the results screens.
      const roundMax = isClassicRound ? 5000 : 1000;
      setOnboarding((prev) => {

        return {
          ...prev,
          nextRoundTime:0,
          points: (prev.points??0) + roundPoints,
          maxPoints: (prev.maxPoints??0) + roundMax,
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
    // Resolve the pin's country with the local borders lookup (mobile parity),
    // sync-first: when the polygons are cached (preloaded above) the streak
    // verdict lands in the same commit as setShowAnswer, so the end banner
    // shows its final streak message from the first frame instead of swapping
    // lines once an async lookup settles. The async path only covers a cold
    // cache (guessing within ~1s of the preload kicking off).
    const syncCountry = findCountryLocalSync({ lat: pinPoint.lat, lon: pinPoint.lng });
    if (syncCountry !== null) {
      afterGuess(syncCountry);
    } else {
      findCountryLocal({ lat: pinPoint.lat, lon: pinPoint.lng }).then((country) => {
        afterGuess(country)
      }).catch((e) => {
        console.error(e);
        afterGuess("Unknown")
      });
    }
    }
  }

  // One submit path for Country/Continent Guesser — the CountryBtns press and
  // the round-timer timeout share it. selected === null means the clock ran
  // out with no answer: scored as a wrong guess, generic wrong quip, and no
  // guessed-country pin on the reveal map (guessedCountryCode stays null).
  // Called from the timer interval's closure too: safe, because streaks only
  // change at a reveal and the reveal recreates the interval (showAnswer is
  // in that effect's deps), so mid-round the captured values are current.
  function submitCountryGuess(selected) {
    const isContinentMode = onboarding?.mode === "continent" || (!onboarding && countryGuesser && otherOptions?.includes?.("Africa"));
    const timedOut = selected == null;
    const isCorrect = !timedOut && (isContinentMode ? continentFromCode(latLong.country) === selected : selected === latLong.country);
    setCountryGuesserCorrect(isCorrect);
    setGuessedCountryCode(timedOut ? null : selected);
    // Determine quip tier. Timeout (no guess) → null: there's nothing to riff
    // on if the player never picked, so EndBanner shows no quip.
    if (timedOut) {
      setGuessTier(null);
    } else if (isCorrect) {
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
      selected: timedOut ? "(timeout)" : selected,
      isCorrect,
      mode: isContinentMode ? "continent" : "country",
    });
    guess(isCorrect);
  }





  // No `loading` term: every getready→guess flip sets loading=true until the
  // pano loads, and that .shown round-trip replayed the hudEnter entrance —
  // the timer played its intro twice every round. The round clock IS running
  // while the pano loads, so staying visible is also the truthful display
  // (the onboarding timer below has always ignored loading the same way).
  const multiplayerTimerShown = !((showAnswer||!multiplayerState||(multiplayerState?.gameData?.state === 'getready' && multiplayerState?.gameData?.curRound === 1)||multiplayerState?.gameData?.state === 'end'));
  // Stays up through the answer reveal (z-1001 clears the fullscreen answer
  // map, and the points counter ticking up on reveal is half the fun) — only
  // the completion screens retire it.
  const onboardingTimerShown = !!onboarding && !onboarding.completed;
  // The multiplayer reveal-exit no longer fades, so there is no fade to bridge:
  // `.answerShown` is meant to drop on the very frame the state flips to
  // 'guess', which is what starts the container shrinking. (This used to hold
  // `showAnswerOnMap` true for one extra frame so the 300ms opacity animation
  // had something to run on. Keeping it now would just delay the shrink by a
  // frame and re-introduce a step in what should be one continuous motion.)
  const mapFadingOutForRender = mapFadingOut;
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
  // NO !singlePlayerRound?.done term here: the game-ending advance keeps the
  // fullscreen answer map as the summary's crossfade base, and dropping
  // `.shown` at done made classic's answerShown map (no transform pin, unlike
  // the CG reveal class) slide down behind the fading summary — the "sliver
  // of streetview" bug. showAnswer staying true at done is what keeps the
  // no-summary arm (!showAnswerOnMap && !loading) from firing there.
  //
  // multiplayerAnswerRevealLeaving / mpRevealExitHold: home's getready→guess batch sets
  // miniMapShown=false (mobile expanded-map cleanup). Without bridging here,
  // the leave frame would drop `.shown` and the box would start sliding off-
  // screen instead of shrinking fullscreen→corner. The desktop useLayoutEffect
  // restores miniMapShown before paint, but this keeps the CSS class correct
  // on the same render that flips answerShown off — and for the ~400ms shrink
  // window after, while a still-loading pano would otherwise forceHide it.
  const shouldShowMiniMap = !welcomeOverlayShown &&
    (miniMapShown || showAnswerOnMap || keepMapThroughRevealExit) &&
    (!onboarding?.completed &&
      (showAnswerOnMap || (!showAnswerOnMap && (!loading || onboardingMapWhileLoading || keepMapThroughRevealExit)) || mapFadingOutForRender)) &&
    !(onboarding && !showAnswer && !mapFadingOutForRender && onboarding.mode !== 'classic');
  const forceHideMiniMap = !!(
    // Not during keepMapThroughRevealExit: forceHidden snaps opacity/transform
    // with transition:none, which would abort the fullscreen→corner shrink mid-flight
    // whenever the next-round pano isn't preloaded yet (loading=true on the same batch).
    (multiplayerState?.inGame && multiplayerState?.gameData?.state === 'guess' && loading && !showAnswerOnMap && !keepMapThroughRevealExit)
    || mapResetting
    // Map switch from the options modal: home clears latLong in one batch and
    // reloads in the next, which cycled miniMapShown false→true THROUGH ITS
    // SLIDE TRANSITION — and the minimap (z-1000) dances above the switch
    // mask (z-101), in full view. Hold it hidden for the mask window instead;
    // it comes back with one clean entrance when the new map is ready.
    || mapSwitchMaskShown
  );
  const mapLocationForRender = mapFadingOutForRender && fadeOutMapLocation ? fadeOutMapLocation : latLong;
  // The open-minimap answer reveal on phones is a deliberate SNAP (user
  // ruling: no slide). What makes the snap clean is Map.js: on the reveal
  // flip, RevealController's mobile layout effect resizes Leaflet
  // synchronously pre-paint with a bottom-anchored recentre, so the first
  // painted fullscreen frame shows the guess content exactly where it was —
  // no stale-projection jump, no post-paint recentre hop.
  // (!loading || onboardingActive): with the onboarding map visible during the
  // pano load, the camera fit must run EARLY — while tiles are still loading
  // and the map is not yet revealed. Holding it until !loading made
  // ExtentFitter fire its reset cover the instant Street View finished,
  // flashing white over an already-visible map.
  // mapResetting is visually forceHidden but intentionally camera-ready:
  // ExtentFitter must measure the REAL destination box and finish its reset
  // under that cover. Conflating "not painted" with "not ready to reset" is
  // what forced the old blind 350ms wait.
  //
  // keepMapThroughRevealExit is the multiplayer visible-fly path.
  const mapReadyForCameraReset = !welcomeOverlayShown &&
    !!mapLocationForRender &&
    (
      mapResetting ||
      (!forceHideMiniMap && (!loading || onboardingActive || keepMapThroughRevealExit))
    );
  const mapCameraResetKey = multiplayerState?.inGame
    ? `mp:${multiplayerState?.gameData?.code || ''}:${multiplayerState?.gameData?.curRound || ''}:${multiplayerState?.gameData?.state || ''}`
    : onboarding
      ? `onboarding:${onboarding?.mode || 'classic'}:${onboarding?.round || ''}`
      : singlePlayerRound
        ? `single:${gameOptions?.location || 'all'}:${singlePlayerRound?.round || ''}:${singlePlayerRound?.done ? 'done' : 'playing'}`
        : `free:${gameOptions?.location || 'all'}:${latLong?.lat ?? ''}:${latLong?.long ?? ''}`;
  return (
    <div className="gameUI">

{/* Main-site in-game banner — Playwire (head2 728x90 via the size map),
    same gates/lifecycle as the old Nitro slot: mounts with gameUI, unmounts
    with it, spaAds re-inits per mount (bannerAdPlaywire.js).
    Unlike the Nitro era, ONBOARDING shows it too (user call, Aug 3): the
    !onboarding gate is gone; !onboarding?.completed still hides it on the
    tutorial's completion screen, like !singlePlayerRound?.done does for SP
    round-over. moreDown already handles the onboarding timer. */}
{ !inCrazyGames && !inCoolMathGames && !inGameDistribution && !process.env.NEXT_PUBLIC_POKI && (!session?.token?.supporter) && !singlePlayerRound?.done && !onboarding?.completed && (
    <div className={`topAdFixed ${(multiplayerTimerShown || onboardingTimerShown || singlePlayerRound)?'moreDown':''}`}>
      <PlaywireAd
        selectorId="pw-game-ad"
        showAdvertisementText={false} screenH={height} types={[[728,90]]} screenW={Math.max(400, width-450)} vertThresh={0.3} />
    </div>
)}

{ inCrazyGames && !singlePlayerRound?.done && !onboarding?.mode && !onboarding?.completed && !(width < 700 && height < 350) && (
    <div className={`topAdFixed ${(multiplayerTimerShown || onboardingTimerShown || singlePlayerRound)?'':''}`}>
      <CrazyGamesBanner
        id="cg-banner-gameui"
        screenH={height} types={[[320,50],[468,60],[728,90]]} screenW={Math.max(400, width-350)} vertThresh={0.3} />
    </div>
)}

{/* No CMG in-game banner: the old slot ran Nitro units behind the remote
    cmgopt.txt flag — removed with the Playwire swap (Aug 2), dark until the
    CMG/Playwire decision. */}

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
    <DuelIntroBars isStartingDuel={isStartingDuel} vsExiting={vsExiting} countdown={vsChromeCountdown}
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
    // League-colored "(elo)" suffix, same as the 1v1 bars. Guests have no elo
    // (null/undefined) so the suffix simply doesn't render for them.
    elo: typeof p.elo === 'number' ? p.elo : null,
  });
  const myNames = players.filter(p => p.team === myTeam)
    .sort((a, b) => (b.id === myId) - (a.id === myId))
    .map(nameEntry);
  const enemyNames = players.filter(p => p.team === enemyTeam).map(nameEntry);
  return (
    <DuelIntroBars isStartingDuel={isStartingDuel} vsExiting={vsExiting} countdown={vsChromeCountdown}
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
{multiplayerState?.gameData?.duel && multiplayerState?.gameData?.public && duelIntroOverlayShown && (
  <div className={`duel-warning-container${vsExiting ? ' duel-warning-container--exiting' : ''}`}>
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


      {(!countryGuesser || (countryGuesser && showAnswerOnMap)) && multiplayerMapStateAllowsRender && ((multiplayerState?.inGame && multiplayerState?.gameData?.curRound === 1) ? (multiplayerState?.gameData?.state === "guess" || multiplayerRoundOverShowingAnswer) : true ) && (
        <>


      <div id="miniMapArea" onMouseEnter={() => {
        if(!loading || onboardingMapWhileLoading) setMiniMapExpanded(true)
      }} onMouseLeave={() => {
        if(mapPinned || showAnswerOnMap) return;
        setMiniMapExpanded(false)
      }} className={`miniMap ${miniMapExpanded && !showAnswerOnMap ? 'mapExpanded' : ''} ${shouldShowMiniMap ? 'shown' : ''} ${showAnswerOnMap ? 'answerShown' : 'answerNotShown'} ${keepMapThroughRevealExit ? 'revealExiting' : ''} ${(showAnswerOnMap && countryGuesser) || mapFadingOutForRender ? 'countryGuessrMapReveal' : ''} ${mapFadingOutForRender ? 'countryGuessrMapFadeOut' : ''} ${miniMapFullscreen&&miniMapExpanded ? 'fullscreen' : ''} ${forceHideMiniMap ? 'forceHidden' : ''}`}>

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
        <MapWidget shown={mapReadyForCameraReset} onTilesLoaded={handleTilesLoaded} options={options} ws={ws} gameOptions={gameOptions} answerShown={showAnswerOnMap} session={session} showHint={hintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} location={mapLocationForRender} setKm={setKm} multiplayerState={multiplayerState} countryGuessPin={guessedCountryCode && !countryGuesserCorrect && countryCoordinates[guessedCountryCode] ? countryCoordinates[guessedCountryCode] : null} stopCameraAnimations={mapFadingOutForRender || forceHideMiniMap} smoothReset={multiplayerAnswerRevealLeaving} onResetComplete={mapResetting ? finishHiddenMapReset : undefined} resetKey={mapCameraResetKey} cameraCancelKey={mapCameraCancelKey} />


        <div className={`miniMap__btns ${showAnswerOnMap ? 'answerShownBtns' : ''}`}>
          {renderGuessHintBtns()}
        </div>
      </div>

      {/* Map-guess modes only. Country/continent guesser answers via
          CountryBtns and this row was never visible there — but it used to be
          MOUNTED during the CG reveal (hidden by .answerShownBtns, keyed on
          raw showAnswer). Once the parent block's gate moved to showAnswerOnMap
          (needed so the CG fade survives showAnswer clearing on the click
          frame), the hide class dropped at t=0 while the block stayed up, and
          the Guess FAB flashed bottom-right for the whole fade window at every
          CG round advance. Unmounting it in CG matches every prior version's
          VISIBLE behavior. */}
      {!countryGuesser && (
      <div className={`mobile_minimap__btns ${miniMapShown ? 'miniMapShown' : ''} ${(showAnswer||singlePlayerRound?.done||onboarding?.completed) ? 'answerShownBtns' : ''} ${(mapFadingOut || mapResetting) ? 'mobileGuessFabIdle' : ''}`}>
        {miniMapShown && renderGuessHintBtns()}
        {!welcomeOverlayShown && (
          <button
            className={`gameBtn g2_mobile_guess ${miniMapShown ? 'mobileMiniMapExpandedToggle' : ''}`}
            disabled={loading && !onboardingMapWhileLoading}
            aria-busy={loading && !onboardingMapWhileLoading}
            onClick={() => {
              setMiniMapShown(!miniMapShown)
            }}
          >
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
      )}
      </>
      )}

      { countryGuesser && otherOptions?.length > 0 && (
        <CountryBtns countries={otherOptions} shown={!loading && showCountryButtons && !showAnswer && !!latLong?.country} mode={onboarding?.mode || countryGuessrMode?.subMode || "country"} compact={!onboarding}

         onCountryPress={submitCountryGuess}/>
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
        {/* Host stall-relief: with the timer disabled, idle players hold the
            round open forever — one tap collapses it to ~1s (server re-checks
            host + private). Gated on the same >120s condition that hides the
            countdown, so it vanishes once any collapse is already in flight. */}
        {!multiplayerState?.gameData?.public
          && multiplayerState?.gameData?.host
          && multiplayerState?.gameData?.state === 'guess'
          && multiplayerState?.gameData?.timePerRound === 86400000
          && timeToNextMultiplayerEvt > 120 && (
          <button
            className="timer__force-end"
            onClick={() => { try { ws.send(JSON.stringify({ type: 'forceEndRound' })); } catch (e) {} }}
          >{text("endRound")}</button>
        )}
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


        {/* Singleplayer game over screen. Must render AFTER #miniMapArea:
            both sit at z-index 1000, so DOM order decides the winner — the
            final answer scene deliberately stays mounted beneath as the
            summary's crossfade base (see advanceRound), and the summary has
            to paint over it, same as the MP mounts below. */}
        {singlePlayerRound?.done && !dailyMode && (
          <RoundOverScreen
            points={singlePlayerRound.locations.reduce((acc, cur) => acc + cur.points, 0)}
            maxPoints={countryGuesser ? singlePlayerRound.totalRounds * 1000 : singlePlayerRound.totalRounds * 5000}
            history={singlePlayerRound.locations}
            button1Text={"🎮 " + text("playAgain")}
            button1Press={() => {
              window.crazyMidgame(() => advanceRound("summary-play-again"))
            }}
            session={session}
          />
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
  {/* !done: .endCards is z-index 1001 — once the results summary (1000) is
      up over the kept answer scene, the clue banner must not float on it */}
  { showAnswer && showClueBanner && !singlePlayerRound?.done && (
<ClueBanner session={session} explanations={explanations} close={() => {setShowClueBanner(false)}} />
  )}
<EndBanner
countryStreaksEnabled={gameOptions?.location === "all"}
isWorldMap={gameOptions?.location === "all"}
dailyMode={dailyMode}
singlePlayerRound={singlePlayerRound} onboarding={onboarding} countryGuesser={countryGuesser} countryGuesserCorrect={countryGuesserCorrect} guessedCountryCode={guessedCountryCode} guessTier={guessTier} options={options} isContinentMode={onboarding?.mode === "continent" || (!onboarding && countryGuesser && otherOptions?.includes?.("Africa"))} countryStreak={countryGuesser ? (otherOptions?.includes?.("Africa") || onboarding?.mode === "continent" ? continentGuessrStreak : countryGuessrStreak) : countryStreak} lostCountryStreak={countryGuesser ? (otherOptions?.includes?.("Africa") || onboarding?.mode === "continent" ? lostContinentGuessrStreak : lostCountryGuessrStreak) : lostCountryStreak} usedHint={hintShown} session={session}  guessed={showAnswer || mapFadingOut} latLong={mapLocationForRender} pinPoint={pinPoint} fullReset={(advanceRequest)=>{
  advanceRound(advanceRequest?.source || "endBanner");
  }} km={km} setExplanationModalShown={setExplanationModalShown} multiplayerState={multiplayerState} mapFadingOut={mapFadingOut} />

    {/* Critical timer screen warning effect */}
    {((timeToNextMultiplayerEvt <= 5 && timeToNextMultiplayerEvt > 0 && multiplayerTimerShown && !showAnswer && !pinPoint && multiplayerState?.inGame && multiplayerState?.gameData?.state === 'guess') ||
      (timeToNextRound <= 5 && timeToNextRound > 0 && onboardingTimerShown && !showAnswer && !pinPoint && onboarding)) && (
      <div className="screen-critical-warning" />
    )}
  </div>

    </div>
  )
}
