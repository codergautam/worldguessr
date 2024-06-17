import { useEffect } from "react";
import calcPoints from "./calcPoints";
import { signIn } from "next-auth/react";

export default function EndBanner({ xpEarned, lostCountryStreak, session, guessed, latLong, pinPoint, countryStreak, fullReset, km, multiplayerState, usedHint }) {
  return (
    <div id='endBanner' style={{ display: guessed ? '' : 'none' }}>
  <div className="bannerContent">
    { pinPoint && km ? (
    <h1 className='mainBannerTxt'>Your guess was {km} km away!</h1>
    ) : (
      <h1 className='mainBannerTxt'>You didn't guess!</h1>
    )}
    <p className="motivation">
      { latLong && pinPoint && multiplayerState?.inGame &&
       `You got ${calcPoints({ lat: latLong.lat, lon: latLong.long, guessLat: pinPoint.lat, guessLon: pinPoint.lng, usedHint: false, maxDist: multiplayerState?.gameData?.maxDist ?? 20000 })} points!`
      }


      { latLong && pinPoint && !multiplayerState?.inGame && (
        km <  300 ? 'Wow! You were really close!' : km < 1000 ? 'Great guess!' : km < 3000 ? 'Not bad' : 'Better luck next time!'
        )}
         {!session?.token?.secret && (
          <p>
            <a onClick={()=>signIn('google')} style={{textDecoration: 'underline', color: 'cyan', cursor: 'pointer'}}>Login with Google</a> to earn XP and track your stats!
          </p>
        )}
      <br/>
      {xpEarned > 0 && session?.token?.secret ? `You earned ${xpEarned} XP!` : ''}
      <br/>
      {countryStreak > 0 ? `You're on a ${countryStreak} country streak!` : ''}
      {lostCountryStreak > 0 ? `You lost your ${lostCountryStreak} country streak!` : ''}
    </p>
  </div>
  { !multiplayerState && (

  <div className="endButtonContainer">
  <button className="playAgain" onClick={fullReset}>
    Play Again
  </button>
  <button className="openInMaps" onClick={() => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${latLong.lat},${latLong.long}`);
  }}>
    Open in Google Maps
  </button>
</div>
  )}
</div>
  )
}