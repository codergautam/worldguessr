import { useEffect } from "react";
import calcPoints from "./calcPoints";
import { signIn } from "next-auth/react";
import { useTranslation } from 'next-i18next'

export default function EndBanner({ xpEarned, lostCountryStreak, session, guessed, latLong, pinPoint, countryStreak, fullReset, km, multiplayerState, usedHint }) {
  const { t: text } = useTranslation("common");

  return (
    <div id='endBanner' style={{ display: guessed ? '' : 'none' }}>
  <div className="bannerContent">
    { pinPoint && km ? (
    <h1 className='mainBannerTxt'>
      {/* Your guess was {km} km away! */}

      {text("guessDistanceKm", {d: km})}
      </h1>
    ) : (
      <h1 className='mainBannerTxt'>{text("didntGuess")}!</h1>
    )}
    <p className="motivation">
      { latLong && pinPoint && multiplayerState?.inGame &&
       `${text('gotPoints', {p:calcPoints({ lat: latLong.lat, lon: latLong.long, guessLat: pinPoint.lat, guessLon: pinPoint.lng, usedHint: false, maxDist: multiplayerState?.gameData?.maxDist ?? 20000 })})}!`
      }


      { latLong && pinPoint && !multiplayerState?.inGame && (
        km <  100 ? text("motivation1")+"!" :
        km <  300 ? text("motivation2")+"!" :
         km < 1000 ? text("motivation3")+"!" :
         km < 3000 ? text("motivation4") :
         text("motivation5")
        )}

         {!session?.token?.secret && (
          <p>
            <a onClick={()=>signIn('google')} style={{textDecoration: 'underline', color: 'cyan', cursor: 'pointer'}}>{text("loginWithGoogle1")}</a> {text("loginWithGoogle2")}!
          </p>
        )}
      {xpEarned > 0 && session?.token?.secret ? <p>{text("earnedXP",{xp:xpEarned})}!</p> : ''}
          {countryStreak > 0 ? <p>{text("onCountryStreak",{streak:countryStreak})}!</p> : ''}
          {lostCountryStreak > 0 ? <p>{text("lostCountryStreak",{streak:lostCountryStreak})}!</p> : ''}
    </p>
  </div>
  { !multiplayerState && (

  <div className="endButtonContainer">
  <button className="playAgain" onClick={fullReset}>
    {text("playAgain")}
  </button>
  <button className="openInMaps" onClick={() => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${latLong.lat},${latLong.long}`);
  }}>
    {text("openInMaps")}
  </button>
</div>
  )}
</div>
  )
}