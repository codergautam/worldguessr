import nameFromCode from "../utils/nameFromCode";
import AccountBtn from "./accountBtn";

export default function Navbar({ openAccountModal, shown, backBtnPressed, setGameOptionsModalShown, onNavbarPress, gameOptions, session, screen, multiplayerState }) {
  return (
    <>
    { true && (
    <div className={`navbar ${shown ? "" : "hidden"}`}>
      <h1 className="navbar__title" onClick={onNavbarPress}>WorldGuessr</h1>
      <button className="gameBtn navBtn backBtn" onClick={backBtnPressed}>Back</button>

      {screen === 'multiplayer-home' && multiplayerState?.playerCount && (
        <h1>
          🟢 {multiplayerState.playerCount} online
        </h1>
      )}
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