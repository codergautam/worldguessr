import { useTranslation } from '@/components/useTranslations'

export default function SaveStreakBanner({ shown, close, playAd, countryStreak, setCountryStreak, lostCountryStreak, setLostCountryStreak }) {
  const { t: text } = useTranslation("common");

  if(!shown) return null;

  return (
    <div id='endBanner' className='clueBanner'>

  <div className="bannerContent">
    <span className='smallmainBannerTxt'>
      {text("restoreYourStreak", {streak: lostCountryStreak})}
      </span>


    <p className='motivation'>
      {text("watchAnAdToRestore")}
    </p>
  </div>

  <div class="endButtonContainer">
  <button className="openInMaps" onClick={playAd} style={{backgroundColor: 'green'}}>
    {text("watchAd")}
  </button>
  <button className="openInMaps" onClick={close}>
  {text("close")}
</button>
  </div>

  </div>

  )
}