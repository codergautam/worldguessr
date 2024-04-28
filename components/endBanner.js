import calcPoints from "./calcPoints";

export default function EndBanner({ guessed, latLong, pinPoint, countryStreak, fullReset, km, playingMultiplayer }) {
  return (
    <div id='endBanner' style={{ display: guessed ? '' : 'none' }}>
  <div className="bannerContent">
    <h1 className='mainBannerTxt'>Your guess was {km} km away!</h1>
    <p className="motivation">
      { latLong && pinPoint && (
       `You got ${calcPoints({lat: latLong.lat, lon: latLong.long, guessLat: pinPoint.lat, guessLon: pinPoint.lng})} points!`
      )}
      <br/>
      {countryStreak > 0 ? `You're on a ${countryStreak} country streak!` : ''}
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