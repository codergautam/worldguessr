import { FaUser } from "react-icons/fa";
import nameFromCode from "../utils/nameFromCode";
import AccountBtn from "./accountBtn";
import { FaXmark } from "react-icons/fa6";

export default function Navbar({ openAccountModal, shown, backBtnPressed, setGameOptionsModalShown, onNavbarPress, gameOptions, session, screen, multiplayerState }) {
  return (
    <>
    { true && (
    <div className={`navbar ${shown ? "" : "hidden"}`}>
      <h1 className="navbar__title desktop" onClick={onNavbarPress}>WorldGuessr</h1>
      <h1 className="navbar__title mobile" onClick={onNavbarPress}>WG</h1>

      <button className="gameBtn navBtn backBtn desktop" onClick={backBtnPressed}>Back</button>
      <button className="gameBtn navBtn backBtn mobile" onClick={backBtnPressed} style={{width: "50px"}}><FaXmark /></button>


      {screen === 'multiplayer-home' && multiplayerState?.playerCount && (
        <h1 className="desktop">
          🟢 {multiplayerState.playerCount} online
        </h1>
      )}

      {/* <h1>
         &nbsp; <FaUser /> 4
        </h1> */}
      <div className="navbar__right">
        { screen === 'singleplayer' && (
        <button className="gameBtn navBtn" onClick={()=>setGameOptionsModalShown(true)}>{((gameOptions.location === "all")|| !gameOptions.location)? "All Countries" : nameFromCode(gameOptions.location)}</button>
        )}
        <AccountBtn session={session} navbarMode={true} openAccountModal={openAccountModal} />
        </div>
    </div>
)}
    </>
  )
}