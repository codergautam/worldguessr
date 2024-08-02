import { FaArrowLeft, FaUser, FaUserFriends } from "react-icons/fa";
import nameFromCode from "../utils/nameFromCode";
import AccountBtn from "./accountBtn";
import { FaArrowRotateRight } from "react-icons/fa6";
import { useTranslation } from 'next-i18next'
import WsIcon from "../wsIcon";
import { useState, useEffect } from "react";

export default function Navbar({ inGame, openAccountModal, shown, backBtnPressed, reloadBtnPressed, setGameOptionsModalShown, onNavbarPress, onFriendsPress, gameOptions, session, screen, multiplayerState, loading }) {
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
    { true && (
    <div className={`navbar ${shown ? "" : "hidden"}`}>
      <div className={`nonHome ${screen==='home'?'':'shown'}`}>
      <h1 className="navbar__title desktop" onClick={onNavbarPress}>WorldGuessr</h1>
      <h1 className="navbar__title mobile" onClick={onNavbarPress}>WG</h1>

      <button className="gameBtn navBtn backBtn desktop" onClick={backBtnPressed}>{text("back")}</button>
      <button className="gameBtn navBtn backBtn mobile" onClick={backBtnPressed} style={{width: "50px"}}><FaArrowLeft /></button>
      </div>
      {reloadBtn && (
      <button className="gameBtn navBtn backBtn" style={{backgroundColor: '#000099'}} onClick={reloadBtnPressed}><FaArrowRotateRight /></button>
      )}


      {multiplayerState?.playerCount &&  (
        <span className={`desktop bigSpan onlineText ${screen !== 'home' ? 'notHome':''} ${(screen==='singleplayer'||screen==='onboarding'||multiplayerState?.inGame||!multiplayerState?.connected)?'hide':''}`}>
          {text("onlineCnt", {cnt:multiplayerState.playerCount})}
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
          {((gameOptions.location === "all")|| !gameOptions.location)? text("allCountries") : nameFromCode(gameOptions.location)}
          {gameOptions.nm && gameOptions.npz?
          ', NMPZ':
          gameOptions.nm? ', NM' :
          gameOptions.npz? ', NPZ' :
          ''}
          </button>
        )}
        {!inGame && showAccBtn && (<AccountBtn session={session} navbarMode={true} openAccountModal={openAccountModal} />)}
        </div>
    </div>
)}
    </>
  )
}