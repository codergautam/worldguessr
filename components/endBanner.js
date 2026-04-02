import { useEffect, useRef, useState } from "react";
import calcPoints from "./calcPoints";
import { useTranslation } from '@/components/useTranslations'
import triggerConfetti from "./utils/triggerConfetti";
import nameFromCode from "./utils/nameFromCode";

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

export default function EndBanner({ countryStreaksEnabled, singlePlayerRound, onboarding, countryGuesser, countryGuesserCorrect, options, lostCountryStreak, session, guessed, latLong, pinPoint, countryStreak, fullReset, km, multiplayerState, usedHint, toggleMap, panoShown, setExplanationModalShown }) {
    const { t: text } = useTranslation("common");
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

    // Auto-advance for onboarding (shorter on last round to keep flow snappy)
    const isOnboardingLastRound = onboarding && onboarding.round === (onboarding.locations?.length || 3);
    useEffect(() => {
        if (guessed && onboarding && !onboarding.completed) {
            const duration = isOnboardingLastRound ? 4 : 10;
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

    return (
        <div id='endBanner' className={isCountryGuessrRound && guessed ? 'countryGuessrDelayed' : ''} style={{ display: guessed && !hiding ? '' : 'none' }}>

            <button className="openInMaps topGameInfoButton" onClick={toggleMap}>
                {panoShown ? text("showMap") : text("showPano")}
            </button>

            <div className="bannerContent">
                {/* Main result line */}
                {isClassicRound && pinPoint && (km >= 0) ? (
                    <span className='mainBannerTxt'>
                        {text(`guessDistance${options.units === "imperial" ? "Mi" : "Km"}`, { d: options.units === "imperial" ? (km * 0.621371).toFixed(1) : km })}
                    </span>
                ) : isClassicRound && !pinPoint ? (
                    <span className='mainBannerTxt'>{text("didntGuess")}</span>
                ) : countryGuesser ? (
                    <span className='mainBannerTxt'>{
                        countryGuesserCorrect
                            ? text("correctCountryNice")
                            : text("incorrectCountryWas", { country: nameFromCode(latLong?.country) })
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
                            <span className="streakBadge">🔥 {text("onCountryStreak", { streak: countryStreak })}</span>
                        )}
                        {lostCountryStreak > 0 && text("lostCountryStreak", { streak: lostCountryStreak })}
                    </p>
                )}

                {/* Encouragement tip (country guesser only) */}
                {/* {countryGuesser && encouragement && (
                    <p className="motivation encouragement">{encouragement}</p>
                )} */}

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
