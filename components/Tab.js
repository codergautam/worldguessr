import React from 'react';
import { MdCameraAlt } from 'react-icons/md'; // Importing camera icon from Material Design
import { FaMapMarkedAlt, FaMedal } from 'react-icons/fa'; // Importing map icon from FontAwesome
import styles from '../styles/Tab.module.css';

const GameControls = ({ onCameraClick, latLong, guessed, showHint, setShowHint, onMapClick, showGuessBtn, onGuessClick, disableDiv, playingMultiplayer, leaderboardClick, guessing }) => {
  return (
    <div className={styles.gameControls}>
      <button className={styles.iconButton} onClick={onCameraClick} disabled={disableDiv}>
        <MdCameraAlt size={24} />
      </button>
      <button className={styles.iconButton} onClick={onMapClick} disabled={disableDiv}>
        <FaMapMarkedAlt size={24} />
      </button>

      {playingMultiplayer && (
        <FaMedal size={24} onClick={leaderboardClick} className={styles.iconButton} />
      )}


      <button className="guessBtn" onClick={() => {onGuessClick()}} style={{display: showGuessBtn ? '' : 'none'}}>
      { (playingMultiplayer && guessing) ? 'Waiting...' : 'Guess'}
            </button>

            { !guessed && latLong &&  !showHint && (
            <button className="guessBtn hintBtn" onClick={() => {setShowHint(true)}} >
            Hint
            </button>
            )}
    </div>
  );
};

export default GameControls;
