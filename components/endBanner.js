import { useEffect } from "react";
import calcPoints from "./calcPoints";

export default function EndBanner({ xpEarned, lostCountryStreak, session, guessed, latLong, pinPoint, countryStreak, fullReset, km, playingMultiplayer, usedHint }) {
  return (
    <div id='endBanner' style={{ display: guessed ? '' : 'none' }}>
  <div className="bannerContent">
    <h1 className='mainBannerTxt'>Your guess was {km} km away!</h1>
    <p className="motivation">
      { latLong && pinPoint && playingMultiplayer && (
       `You got ${calcPoints({lat: latLong.lat, lon: latLong.long, guessLat: pinPoint.lat, guessLon: pinPoint.lng, usedHint})} points!`
      )}
      { latLong && pinPoint && !playingMultiplayer && (
        km <  300 ? 'Wow! You were really close!' : km < 1000 ? 'Great guess!' : km < 3000 ? 'Not bad' : 'Better luck next time!'
        )}
      <br/>
      {xpEarned > 0 && session?.token?.secret ? `You earned ${xpEarned} XP!` : ''}
      <br/>
      {countryStreak > 0 ? `You're on a ${countryStreak} country streak!` : ''}
      {lostCountryStreak > 0 ? `You lost your ${lostCountryStreak} country streak!` : ''}
    </p>
  </div>
  { !playingMultiplayer && (

  <div className="buttonContainer">
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