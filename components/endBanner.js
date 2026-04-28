import { useEffect, useRef, useState } from "react";
import calcPoints from "./calcPoints";
import { useTranslation } from '@/components/useTranslations'
import triggerConfetti from "./utils/triggerConfetti";
import nameFromCode from "./utils/nameFromCode";
import continentFromCode from "./utils/continentFromCode";
import { continentKey } from "./utils/continentLocale";
import findCountryLocal from "./findCountryLocal";
const QUIP_KEYS = {
  correct: Array.from({length: 24}, (_, i) => `quipCorrect${i+1}`),
  wrongSameContinent: Array.from({length: 20}, (_, i) => `quipWrongSame${i+1}`),
  wrongDiffContinent: Array.from({length: 24}, (_, i) => `quipWrongDiff${i+1}`),
};

const CORRECT_ENCOURAGEMENTS = [
    "correctEncouragement1",
    "correctEncouragement2",
    "correctEncouragement3",
    "correctEncouragement4",
    "correctEncouragement5",
];

const ONBOARDING_FACTS = [
    "onboardingFact1",
    "onboardingFact2",
    "onboardingFact3",
];

export default function EndBanner({ countryStreaksEnabled, singlePlayerRound, onboarding, countryGuesser, countryGuesserCorrect, guessTier, isContinentMode, isWorldMap, dailyMode, options, lostCountryStreak, session, guessed, latLong, pinPoint, countryStreak, fullReset, km, multiplayerState, usedHint, toggleMap, panoShown, setExplanationModalShown }) {
    const { t: text, lang } = useTranslation("common");
    const confettiTriggered = useRef(false);
    const autoAdvanceTimer = useRef(null);
    const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState(null);
    const [hiding, setHiding] = useState(false);

    // Reset hiding when new round starts
    useEffect(() => {
        if (guessed) setHiding(false);
    }, [guessed]);

    const points = (!multiplayerState?.inGame && singlePlayerRound?.lastPoint != null)
        ? singlePlayerRound.lastPoint
        : (latLong && pinPoint ? calcPoints({
            lat: latLong.lat, lon: latLong.long,
            guessLat: pinPoint.lat, guessLon: pinPoint.lng,
            usedHint: false, maxDist: multiplayerState?.gameData?.maxDist ?? 20000
        }) : 0);

    useEffect(() => {
        let timer;
        if (guessed && points >= 4850 && !panoShown && !confettiTriggered.current) {
            confettiTriggered.current = true;
            timer = setTimeout(() => triggerConfetti(), 500);
        }
        if (!guessed) confettiTriggered.current = false;
        return () => clearTimeout(timer);
    }, [guessed, points, panoShown]);

    // Auto-advance for onboarding (consider shorter on last round to keep flow snappy)
    const isOnboardingLastRound = onboarding && onboarding.round === (onboarding.locations?.length || 3);
    useEffect(() => {
        if (guessed && onboarding && !onboarding.completed) {
            const duration = isOnboardingLastRound ? 7 : 7;
            setAutoAdvanceCountdown(duration);
            let count = duration;
            const interval = setInterval(() => {
                count--;
                setAutoAdvanceCountdown(count);
                if (count <= 0) { clearInterval(interval); setHiding(true); fullReset(); }
            }, 1000);
            autoAdvanceTimer.current = interval;
            return () => clearInterval(interval);
        } else {
            setAutoAdvanceCountdown(null);
        }
    }, [guessed, onboarding?.round]);

    const isLastRound = (onboarding && onboarding.round === (onboarding.locations?.length || 3))
        || (singlePlayerRound && singlePlayerRound.round === singlePlayerRound.totalRounds);

    // Stable encouragement (picked once per guess, never repeats consecutively)
    const encouragementRef = useRef(null);
    const lastEncouragementRef = useRef(null);
    if (guessed && countryGuesser && countryGuesserCorrect && !encouragementRef.current) {
        let pick;
        do {
            pick = CORRECT_ENCOURAGEMENTS[Math.floor(Math.random() * CORRECT_ENCOURAGEMENTS.length)];
        } while (pick === lastEncouragementRef.current && CORRECT_ENCOURAGEMENTS.length > 1);
        encouragementRef.current = pick;
        lastEncouragementRef.current = pick;
    }
    if (!guessed) encouragementRef.current = null;
    const encouragement = encouragementRef.current ? text(encouragementRef.current) : null;

    // Funny quip for singleplayer (not onboarding), tiered by how wrong the guess was
    const quipRef = useRef(null);
    const lastQuipRef = useRef(null);
    if (guessed && countryGuesser && !onboarding && singlePlayerRound && guessTier && !quipRef.current) {
        const pool = QUIP_KEYS[guessTier];
        if (pool && pool.length > 0) {
            let pick;
            do {
                pick = pool[Math.floor(Math.random() * pool.length)];
            } while (pick === lastQuipRef.current && pool.length > 1);
            quipRef.current = pick;
            lastQuipRef.current = pick;
        }
    }
    if (!guessed) quipRef.current = null;

    const locationFact = onboarding && guessed && onboarding.round
        ? text(ONBOARDING_FACTS[onboarding.round - 1] || "")
        : null;

    const isCountryGuessrRound = countryGuesser && !pinPoint;
    const isClassicRound = !countryGuesser;
    const showStreaks = (countryStreaksEnabled || countryGuesser) && (countryStreak > 0 || lostCountryStreak > 0);

    // Points to display
    const displayPoints = countryGuesser
        ? (singlePlayerRound?.lastPoint ?? (countryGuesserCorrect ? 1000 : 0))
        : (singlePlayerRound?.lastPoint ?? points);

    // On the world map, promote the country reveal when the guess landed in the
    // wrong country — that's the interesting signal, distance/points are secondary.
    let wrongCountryName = null;
    if (isClassicRound && (isWorldMap || dailyMode) && pinPoint && latLong?.country) {
        const guessCountry = findCountryLocal({ lat: pinPoint.lat, lon: pinPoint.lng });
        if (guessCountry && guessCountry !== "Unknown" && guessCountry !== latLong.country) {
            wrongCountryName = nameFromCode(latLong.country, lang);
        }
    }

    const distanceText = (pinPoint && km >= 0)
        ? text(`guessDistance${options.units === "imperial" ? "Mi" : "Km"}`, { d: options.units === "imperial" ? (km * 0.621371).toFixed(1) : km })
        : null;

    return (
        <div id='endBanner' className={isCountryGuessrRound && guessed ? 'countryGuessrDelayed' : ''} style={{ display: guessed && !hiding ? '' : 'none' }}>

            <button className="openInMaps topGameInfoButton" onClick={toggleMap}>
                {panoShown ? text("showMap") : text("showPano")}
            </button>

            <div className="bannerContent">
                {/* Main result line */}
                {isClassicRound && wrongCountryName ? (
                    <>
                        <span className='mainBannerTxt'>
                            {text("incorrectCountryWas", { country: wrongCountryName })}
                        </span>
                        {distanceText && (
                            <span className='smallmainBannerTxt'>{distanceText}</span>
                        )}
                    </>
                ) : isClassicRound && pinPoint && (km >= 0) ? (
                    <span className='mainBannerTxt'>{distanceText}</span>
                ) : isClassicRound && !pinPoint ? (
                    <span className='mainBannerTxt'>{text("didntGuess")}</span>
                ) : countryGuesser ? (
                    <span className='mainBannerTxt'>{
                        countryGuesserCorrect
                            ? text("correctCountryNice")
                            : isContinentMode
                                ? text("incorrectContinentWas", { continent: text(continentKey(continentFromCode(latLong?.country))) })
                                : text("incorrectCountryWas", { country: nameFromCode(latLong?.country, lang) })
                    }</span>
                ) : null}

                {/* Points (classic only) */}
                {!countryGuesser && (
                    <p className="motivation bannerPoints">
                        {text("gotPoints", { p: displayPoints })}
                    </p>
                )}

                {/* Streak badge */}
                {showStreaks && (
                    <p className="motivation">
                        {countryStreak > 0 && (
                            <span className="streakBadge">🔥 {isContinentMode ? text("onContinentStreak", { streak: countryStreak }) : text("onCountryStreak", { streak: countryStreak })}</span>
                        )}
                        {lostCountryStreak > 0 && (isContinentMode ? text("lostContinentStreak", { streak: lostCountryStreak }) : text("lostCountryStreak", { streak: lostCountryStreak }))}
                    </p>
                )}

                {/* Funny quip (singleplayer country/continent guesser only) */}
                {quipRef.current && (
                    <p className="motivation quip">{text(quipRef.current)}</p>
                )}

                {/* Location fact (onboarding only) */}
                {locationFact && (
                    <p className="motivation locationFact">{locationFact}</p>
                )}
            </div>

            {!multiplayerState && (
                <div className="endButtonContainer">
                    {onboarding && !onboarding.completed ? (
                        <button className={`playAgain${isLastRound ? ' lastRoundPulse' : ''}`} onClick={() => {
                            if (autoAdvanceTimer.current) clearInterval(autoAdvanceTimer.current);
                            setHiding(true);
                            fullReset();
                        }}>
                            {`${isLastRound ? text("viewResults") : text("nextRound")}${autoAdvanceCountdown != null ? ` (${autoAdvanceCountdown})` : ''}`}
                        </button>
                    ) : (
                        <button className="playAgain" onClick={() => { setHiding(true); fullReset(); }}>
                            {isLastRound ? text("viewResults") : text("nextRound")}
                        </button>
                    )}

                    {session?.token?.canMakeClues && (
                        <button className="openInMaps" onClick={() => {
                            if (!panoShown) toggleMap();
                            setExplanationModalShown(true);
                        }}>
                            {text("writeExplanation")}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
