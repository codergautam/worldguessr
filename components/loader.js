export default function Loader({latLong, loading, loadingText}) {
  return (
    <div style={{position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: (!latLong || loading) ? '1' : '0', transition: 'all 250ms ease'}}>
<img  src="/load.gif" alt="loading"/>
<h1 style={{color: 'white', fontSize: '24px', marginTop: '20px', textAlign: 'center'}}>{loadingText || 'Loading...'}</h1>
</div>
  )
}