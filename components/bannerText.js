export default function BannerText({shown, text}) {
  return (
    <div style={{position: "fixed", zIndex: 1000, top: '50%', left: "50%", transform: "translate(-50%, -50%)",  opacity: shown ? 1 : 0, animation: shown ? 'fadeIn 0.5s' : 'fadeOut 0.5s', display: shown ? 'block' : 'none', pointerEvents: 'none'}}>
<h1 style={{color: 'white', fontSize: '50px', marginTop: '20px', textAlign: 'center'}}>{text || 'Loading...'}</h1>
</div>
  )
}