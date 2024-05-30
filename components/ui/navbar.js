export default function Navbar({ shown, backBtnPressed, setGameOptionsModalShown }) {
  return (
    <>
    { true && (
    <div className={`navbar ${shown ? "" : "hidden"}`}>
      <h1 className="navbar__title">WorldGuessr</h1>
      <button className="gameBtn navBtn backBtn" onClick={backBtnPressed}>Back</button>

      <div className="navbar__right">
        <button className="gameBtn navBtn" onClick={()=>setGameOptionsModalShown(true)}>default</button>
        </div>
    </div>
)}
    </>
  )
}