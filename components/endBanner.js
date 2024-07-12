import { useEffect } from "react";
import calcPoints from "./calcPoints";
import { signIn } from "next-auth/react";
import { useTranslation } from 'next-i18next'
import Ad from "./bannerAd";
import useWindowDimensions from "./useWindowDimensions";

export default function EndBanner({ onboarding, countryGuesser, countryGuesserCorrect, options, xpEarned, lostCountryStreak, session, guessed, latLong, pinPoint, countryStreak, fullReset, km, multiplayerState, usedHint }) {
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

         {/* {!session?.token?.secret && (
          <p>
            <a onClick={()=>signIn('google')} style={{textDecoration: 'underline', color: 'cyan', cursor: 'pointer'}}>{text("loginWithGoogle1")}</a> {text("loginWithGoogle2")}!
          </p>
        )} */}
      {xpEarned > 0 && session?.token?.secret ? <p>{text("earnedXP",{xp:xpEarned})}!</p> : ''}
          {countryStreak > 0 ? <p>{text("onCountryStreak",{streak:countryStreak})}!</p> : ''}
          {lostCountryStreak > 0 ? <p>{text("lostCountryStreak",{streak:lostCountryStreak})}!</p> : ''}
    </p>
  </div>
  { !multiplayerState && (

  <div className="endButtonContainer">
  <button className="playAgain" onClick={fullReset}>
    {onboarding&&onboarding.round === 5 ? text("viewResults") : text("nextRound")}
  </button>
  { !onboarding && (
  <button className="openInMaps" onClick={() => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${latLong.lat},${latLong.long}`);
  }}>
    {text("openInMaps")}
  </button>
  )}
</div>
  )}
<Ad screenH={height} screenW={width} types={[[320, 50],[728,90]]} centerOnOverflow={600} />
</div>
  )
}