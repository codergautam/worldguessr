import { FaArrowLeft, FaUser, FaUserFriends } from "react-icons/fa";
import nameFromCode from "../utils/nameFromCode";
import AccountBtn from "./accountBtn";
import { FaArrowRotateRight, FaPencil } from "react-icons/fa6";
import { useTranslation } from '@/components/useTranslations'
import WsIcon from "../wsIcon";
import { useState, useEffect } from "react";

export default function Navbar({ maintenance, inCrazyGames, inCoolMathGames, inGame, openAccountModal, shown, backBtnPressed, reloadBtnPressed, setGameOptionsModalShown, onNavbarPress, onFriendsPress, gameOptions, session, screen, multiplayerState, loading }) {
  const { t: text } = useTranslation("common");

  const reloadBtn = (((multiplayerState?.inGame) || (screen === 'singleplayer'))) && (!loading);

  const [showAccBtn, setShowAccBtn] = useState(true);
  useEffect(() => {
    if(window.location.search.includes("app=true")) {
      setShowAccBtn(false);
    }
  }, []);


  return (
    <>
    <div className={`navbar ${shown ? "" : "hidden"}`}>
      <div className={`nonHome ${screen==='home'?'':'shown'}`}>
      <h1 className="navbar__title desktop" onClick={onNavbarPress}>WorldGuessr</h1>
      <h1 className="navbar__title mobile" onClick={onNavbarPress}>WG</h1>

      <button className="gameBtn navBtn backBtn desktop" onClick={backBtnPressed}>{text("back")}</button>
      <button className="gameBtn navBtn backBtn mobile" onClick={backBtnPressed}><FaArrowLeft /></button>
      </div>
      {reloadBtn && (
      <button className="gameBtn navBtn backBtn" style={{backgroundColor: '#000099'}} onClick={reloadBtnPressed}><FaArrowRotateRight /></button>
      )}


      {multiplayerState?.playerCount &&  (
        <span className={`bigSpan onlineText desktop ${screen !== 'home' ? 'notHome':''} ${(screen==='singleplayer'||screen==='onboarding'||multiplayerState?.inGame||!multiplayerState?.connected)?'hide':''}`}>
          {maintenance ? text("maintenanceMode") : text("onlineCnt", {cnt:multiplayerState.playerCount})}
        </span>
      )}
      {!multiplayerState?.connected && (
        <WsIcon connected={false} shown={true} />
      )}


        { screen === 'multiplayer' && multiplayerState?.inGame && multiplayerState?.gameData?.players.length > 0 && (
          <span id="playerCnt" className="bigSpan">
          &nbsp; <FaUser /> {multiplayerState.gameData.players.length}
         </span>
        )}
      <div className="navbar__right">
      {session?.token?.secret && (
         <button className="gameBtn friendBtn" onClick={onFriendsPress} disabled={ !multiplayerState?.connected }>
         <FaUserFriends size={40}/>
          </button>
        )}
        { screen === 'singleplayer' && (
        <button className="gameBtn navBtn" disabled={loading} onClick={()=>setGameOptionsModalShown(true)}>
          {((gameOptions.location === "all")|| !gameOptions.location)? text("allCountries") : gameOptions?.countryMap?nameFromCode(gameOptions.location):gameOptions?.communityMapName}
          {gameOptions.nm && gameOptions.npz?
          ', NMPZ':
          gameOptions.nm? ', NM' :
          gameOptions.npz? ', NPZ' :
          ''}

          &nbsp;

          <FaPencil size={20}/>
          </button>
        )}
        {!inGame && showAccBtn && !inCoolMathGames && (<AccountBtn inCrazyGames={inCrazyGames} session={session} navbarMode={true} openAccountModal={openAccountModal} />)}
        </div>
    </div>
    </>
  )
}