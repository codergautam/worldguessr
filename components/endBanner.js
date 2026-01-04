import { useEffect, useRef } from "react";
import calcPoints from "./calcPoints";
import { useTranslation } from '@/components/useTranslations'
import triggerConfetti from "./utils/triggerConfetti";

export default function EndBanner({ countryStreaksEnabled, singlePlayerRound, onboarding, countryGuesser, countryGuesserCorrect, options, lostCountryStreak, session, guessed, latLong, pinPoint, countryStreak, fullReset, km, multiplayerState, usedHint, toggleMap, panoShown, setExplanationModalShown }) {
    const { t: text } = useTranslation("common");
    const confettiTriggered = useRef(false);

    // Calculate points for confetti check
    const points = latLong && pinPoint ? calcPoints({
        lat: latLong.lat,
        lon: latLong.long,
        guessLat: pinPoint.lat,
        guessLon: pinPoint.lng,
        usedHint: false,
        maxDist: multiplayerState?.gameData?.maxDist ?? 20000
    }) : (singlePlayerRound?.lastPoint ?? 0);

    // Trigger confetti for scores >= 4900
    useEffect(() => {
        if (guessed && points >= 4900 && !confettiTriggered.current) {
            confettiTriggered.current = true;
            triggerConfetti();
        }
        // Reset when banner hides
        if (!guessed) {
            confettiTriggered.current = false;
        }
    }, [guessed, points]);

    return (
        <div id='endBanner' style={{ display: guessed ? '' : 'none' }}>

            <button className="openInMaps topGameInfoButton" onClick={() => {
                toggleMap();
            }}>
                {panoShown ? text("showMap") : text("showPano")}
            </button>
            <div className="bannerContent">



                {pinPoint && (km >= 0) ? (
                    <span className='mainBannerTxt'>
                        {/* Your guess was {km} km away! */}



                        {text(`guessDistance${options.units === "imperial" ? "Mi" : "Km"}`, { d: options.units === "imperial" ? (km * 0.621371).toFixed(1) : km })}
                    </span>
                ) : (
                    <span className='mainBannerTxt'>{
                        countryGuesser ? (
                            countryGuesserCorrect ? text("correctCountry") : text("incorrectCountry")
                        ) : text("didntGuess")
                    }!</span>
                )}
                <p className="motivation">
                    {latLong && pinPoint && (onboarding || multiplayerState?.inGame) &&
                        `${text('gotPoints', { p: calcPoints({ lat: latLong.lat, lon: latLong.long, guessLat: pinPoint.lat, guessLon: pinPoint.lng, usedHint: false, maxDist: multiplayerState?.gameData?.maxDist ?? 20000 }) })}! `
                    }
                    {
                        countryGuesser && onboarding && latLong &&
                        `${text('gotPoints', { p: 2500 })}!`
                    }


                </p>
                {/* <p className="motivation">
                    {xpEarned > 0 && session?.token?.secret ? text("earnedXP", { xp: xpEarned }) : ''}

                </p> */}
                {countryStreaksEnabled && (
                    <p className="motivation">
                        {countryStreak > 0 ? text("onCountryStreak", { streak: countryStreak }) : ''}
                        {lostCountryStreak > 0 ? `${text("lostCountryStreak", { streak: lostCountryStreak })}!` : ''}
                    </p>
                )}
                <p className="motivation">
                    {singlePlayerRound &&

                        text("gotPoints", { p: singlePlayerRound.lastPoint })}

                </p>
            </div>
            {!multiplayerState && (

                <div className="endButtonContainer">
                    <button className="playAgain" onClick={fullReset}>
                        {(onboarding && onboarding.round === 5)
                            || (singlePlayerRound && singlePlayerRound.round === singlePlayerRound.totalRounds)
                            ? text("viewResults") : text("nextRound")}
                    </button>
                    {/* { !onboarding && (
  <button className="openInMaps" onClick={() => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${latLong.lat},${latLong.long}`);
  }}>
    {text("openInMaps")}
  </button>
  )} */}



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