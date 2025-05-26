import NextImage from "next/image"

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
        flexDirection: 'column'
      }}
    >
      <div style={{ display: "flex"}}>
        <span style={{color: 'white', fontSize: '50px', marginTop: '20px', textAlign: 'center'}}>
          {text || 'Loading...'}
        </span>
        { !hideCompass && (
          <NextImage.default alt="Loading compass" src={'./loader.gif'} width={100} height={100} />
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