import NextImage from "next/image"
export default function BannerText({shown, text, showCompass}) {
  return (
    <div style={{position: "fixed", zIndex: 1000, top: '50%', left: "50%", transform: "translate(-50%, -50%)",  opacity: shown ? 1 : 0, animation: shown ? 'fadeIn 0.5s' : 'fadeOut 0.5s', display: shown ? 'flex' : 'none', pointerEvents: 'none'}}>
<span style={{color: 'white', fontSize: '50px', marginTop: '20px', textAlign: 'center'}}>{text || 'Loading...'}


</span>
<NextImage.default alt="Loading compass" src={'/loader.gif'} width={100} height={100} />
</div>
  )
}