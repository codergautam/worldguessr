import { FaArrowLeft, FaUser } from "react-icons/fa";
import nameFromCode from "../utils/nameFromCode";
import AccountBtn from "./accountBtn";
import { FaArrowRotateRight } from "react-icons/fa6";
import { useTranslation } from 'next-i18next'

export default function Navbar({ inGame, openAccountModal, shown, backBtnPressed, reloadBtnPressed, setGameOptionsModalShown, onNavbarPress, gameOptions, session, screen, multiplayerState, loading }) {
  const { t: text } = useTranslation("common");

  return (
    <>
    { true && (
    <div className={`navbar ${shown ? "" : "hidden"} ${inGame&&(multiplayerState?.inGame || screen==="singleplayer") ? 'inGame' : ''}`}>
      <h1 className="navbar__title desktop" onClick={onNavbarPress}>WorldGuessr</h1>
      <h1 className="navbar__title mobile" onClick={onNavbarPress}>WG</h1>

      <button className="gameBtn navBtn backBtn desktop" onClick={backBtnPressed}>{text("back")}</button>
      <button className="gameBtn navBtn backBtn mobile" onClick={backBtnPressed} style={{width: "50px"}}><FaArrowLeft /></button>

      {(((multiplayerState?.inGame) || (screen === 'singleplayer'))) && (!loading) && (
      <button className="gameBtn navBtn backBtn" style={{backgroundColor: '#000099'}} onClick={reloadBtnPressed}><FaArrowRotateRight /></button>
      )}


      {screen === 'multiplayer' && multiplayerState?.playerCount && !multiplayerState?.inGame && (
        <span className="desktop bigSpan">
          {text("online", {cnt:multiplayerState.playerCount})}
        </span>
      )}

        { screen === 'multiplayer' && multiplayerState?.inGame && multiplayerState?.gameData?.players.length > 0 && (
          <span id="playerCnt" className="bigSpan">
          &nbsp; <FaUser /> {multiplayerState.gameData.players.length}
         </span>
        )}
      <div className="navbar__right">
        { screen === 'singleplayer' && (
        <button className="gameBtn navBtn" disabled={loading} onClick={()=>setGameOptionsModalShown(true)}>
          {((gameOptions.location === "all")|| !gameOptions.location)? text("allCountries") : nameFromCode(gameOptions.location)}
          {gameOptions.nm && gameOptions.npz?
          ', NMPZ':
          gameOptions.nm? ', NM' :
          gameOptions.npz? ', NPZ' :
          ''}
          </button>
        )}
        <AccountBtn session={session} navbarMode={true} openAccountModal={openAccountModal} />
        </div>
    </div>
)}
    </>
  )
}