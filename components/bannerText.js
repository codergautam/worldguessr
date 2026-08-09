import NextImage from "next/image"
import { asset } from '@/lib/basePath'

export default function BannerText({shown, text, hideCompass, subText, position}) {
  return (
    <div
      className={`banner-text ${shown ? 'shown' : 'hidden'}`}
      style={{
        position: position || 'fixed',
        zIndex: 1000,
        top: '50%',
        left: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: 'none',
        // display:flex was MISSING here for years, which made flexDirection
        // inert: the div was display:block and any second child <span> laid out
        // inline, on one line. Every surviving caller now passes only `text`,
        // so this has no visible effect today — but it closes the footgun, and
        // it makes the component behave the way its own styles already claimed.
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'column'
      }}
    >
      <div style={{ display: "flex"}}>
        <span style={{color: 'white', fontSize: '50px', marginTop: '20px', textAlign: 'center'}}>
          {text || 'Loading...'}
        </span>
        { !hideCompass && (
          <NextImage.default alt="Loading compass" src={asset('/loader.webp')} width={100} height={100} />
        )}
      </div>
      {subText && (
        <span style={{color: 'white', fontSize: '30px', marginTop: '20px', textAlign: 'center'}}>
          {subText}
        </span>
      )}
    </div>
  )
}