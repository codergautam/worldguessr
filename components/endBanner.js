import { useEffect } from "react";
import calcPoints from "./calcPoints";
import { signIn } from "next-auth/react";
import { useTranslation } from 'next-i18next'
import Ad from "./bannerAd";
import useWindowDimensions from "./useWindowDimensions";

export default function EndBanner({ onboarding, countryGuesser, countryGuesserCorrect, options, xpEarned, lostCountryStreak, session, guessed, latLong, pinPoint, countryStreak, fullReset, km, multiplayerState, usedHint, toggleMap, panoShown, setExplanationModalShown }) {
  const { t: text } = useTranslation("common");
  const { height, width } = useWindowDimensions();

  return (
    <div id='endBanner' style={{ display: guessed ? '' : 'none' }}>
  <div className="bannerContent">
    { pinPoint && (km >= 0) ? (
    <span className='mainBannerTxt'>
      {/* Your guess was {km} km away! */}



      {text(`guessDistance${options.units==="imperial"?"Mi":"Km"}`, {d: options.units==="imperial" ? (km*0.621371).toFixed(1) : km})}
      </span>
    ) : (
      <span className='mainBannerTxt'>{
        countryGuesser?(
          countryGuesserCorrect?text("correctCountry"):text("incorrectCountry")
        ):text("didntGuess")
      }!</span>
    )}
    <p className="motivation">
      { latLong && pinPoint && (onboarding||multiplayerState?.inGame) &&
       `${text('gotPoints', {p:calcPoints({ lat: latLong.lat, lon: latLong.long, guessLat: pinPoint.lat, guessLon: pinPoint.lng, usedHint: false, maxDist: multiplayerState?.gameData?.maxDist ?? 20000 })})}! `
      }
      {
        countryGuesser&&onboarding&&latLong&&
        `${text('gotPoints', {p:2500})}!`
      }


      { latLong && pinPoint && !multiplayerState?.inGame && (
        km <  100 ? text("motivation1")+"!" :
        km <  300 ? text("motivation2")+"!" :
         km < 1000 ? text("motivation3")+"!" :
         km < 3000 ? text("motivation4") :
         text("motivation5")
        )}



    </p>
    <p className="motivation">
    {xpEarned > 0 && session?.token?.secret ? text("earnedXP",{xp:xpEarned}) : ''}

      </p>
      <p className="motivation">
      {countryStreak > 0 ? text("onCountryStreak",{streak:countryStreak}) : ''}
      {lostCountryStreak > 0 ? `${text("lostCountryStreak",{streak:lostCountryStreak})}!` : ''}
      </p>
  </div>
  { !multiplayerState && (

  <div className="endButtonContainer">
  <button className="playAgain" onClick={fullReset}>
    {onboarding&&onboarding.round === 5 ? text("viewResults") : text("nextRound")}
  </button>
  {/* { !onboarding && (
  <button className="openInMaps" onClick={() => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${latLong.lat},${latLong.long}`);
  }}>
    {text("openInMaps")}
  </button>
  )} */}

<button className="openInMaps" onClick={() => {
    toggleMap();
  }}>
    {panoShown ? text("showMap") : text("showPano")}
  </button>

{session?.token?.canMakeClues && (
  <button className="openInMaps" onClick={() => {
    if(!panoShown) toggleMap();
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