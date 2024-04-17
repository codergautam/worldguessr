import React from 'react';
import { MdCameraAlt } from 'react-icons/md'; // Importing camera icon from Material Design
import { FaMapMarkedAlt } from 'react-icons/fa'; // Importing map icon from FontAwesome
import styles from '../styles/Tab.module.css';

const GameControls = ({ onCameraClick, onMapClick, showGuessBtn, onGuessClick, disableDiv }) => {
  return (
    <div className={styles.gameControls}>
      <button className={styles.iconButton} onClick={onCameraClick} disabled={disableDiv}>
        <MdCameraAlt size={24} />
      </button>
      <button className={styles.iconButton} onClick={onMapClick} disabled={disableDiv}>
        <FaMapMarkedAlt size={24} />
      </button>


      <button className="guessBtn" onClick={() => {onGuessClick()}} style={{display: showGuessBtn ? '' : 'none'}}>
            Guess
            </button>
    </div>
  );
};

export default GameControls;
