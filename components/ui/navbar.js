import { FaArrowLeft, FaUser } from "react-icons/fa";
import nameFromCode from "../utils/nameFromCode";
import AccountBtn from "./accountBtn";
import { FaArrowRotateRight } from "react-icons/fa6";
import { useTranslation } from 'next-i18next'

export default function Navbar({ inGame, openAccountModal, shown, backBtnPressed, reloadBtnPressed, setGameOptionsModalShown, onNavbarPress, gameOptions, session, screen, multiplayerState }) {
  const { t: text } = useTranslation("common");

  return (
    <>
    { true && (
    <div className={`navbar ${shown ? "" : "hidden"} ${inGame ? 'inGame' : ''}`}>
      <h1 className="navbar__title desktop" onClick={onNavbarPress}>WorldGuessr</h1>
      <h1 className="navbar__title mobile" onClick={onNavbarPress}>WG</h1>

      <button className="gameBtn navBtn backBtn desktop" onClick={backBtnPressed}>{text("back")}</button>
      <button className="gameBtn navBtn backBtn mobile" onClick={backBtnPressed} style={{width: "50px"}}><FaArrowLeft /></button>

      {multiplayerState?.inGame || screen === 'singleplayer' && (
      <button className="gameBtn navBtn backBtn" style={{backgroundColor: '#000099'}} onClick={reloadBtnPressed}><FaArrowRotateRight /></button>
      )}


      {screen === 'multiplayer' && multiplayerState?.playerCount && !multiplayerState?.inGame && (
        <h1 className="desktop">
          {text("online", {cnt:multiplayerState.playerCount})}
        </h1>
      )}

      {/* <h1>
         &nbsp; <FaUser /> 4
        </h1> */}
        { screen === 'multiplayer' && multiplayerState?.inGame && multiplayerState?.gameData?.players.length > 0 && (
          <h1>
          &nbsp; <FaUser /> {multiplayerState.gameData.players.length}
         </h1>
        )}
      <div className="navbar__right">
        { screen === 'singleplayer' && (
        <button className="gameBtn navBtn" onClick={()=>setGameOptionsModalShown(true)}>
          {((gameOptions.location === "all")|| !gameOptions.location)? text("allCountries") : nameFromCode(gameOptions.location)}
          {gameOptions.nmpz?', NMPZ':''}
          </button>
        )}
        <AccountBtn session={session} navbarMode={true} openAccountModal={openAccountModal} />
        </div>
    </div>
)}
    </>
  )
}