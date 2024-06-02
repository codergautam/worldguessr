import nameFromCode from "../utils/nameFromCode";

export default function Navbar({ shown, backBtnPressed, setGameOptionsModalShown, onNavbarPress, gameOptions }) {
  return (
    <>
    { true && (
    <div className={`navbar ${shown ? "" : "hidden"}`}>
      <h1 className="navbar__title" onClick={onNavbarPress}>WorldGuessr</h1>
      <button className="gameBtn navBtn backBtn" onClick={backBtnPressed}>Back</button>

      <div className="navbar__right">
        <button className="gameBtn navBtn" onClick={()=>setGameOptionsModalShown(true)}>{((gameOptions.location === "all")|| !gameOptions.location)? "All Countries" : nameFromCode(gameOptions.location)}</button>
        </div>
    </div>
)}
    </>
  )
}