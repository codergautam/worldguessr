import { useState, useEffect } from "react";
import { FaMinus, FaPlus, FaMap, FaCheck } from "react-icons/fa";
import { useTranslation } from "./useTranslations";
import Modal from "react-responsive-modal";
import MapsModal from "./maps/mapsModal";

export default function PartyModal({ onClose, ws, setWs, multiplayerError, multiplayerState, setMultiplayerState, session, handleAction, gameOptions, setGameOptions, shown, setSelectCountryModalShown, selectCountryModalShown }) {
    const { t: text } = useTranslation("common");
    
    // Local state for number inputs to allow free typing
    const [localRounds, setLocalRounds] = useState(multiplayerState?.createOptions?.rounds?.toString() || "5");
    const [localTime, setLocalTime] = useState(multiplayerState?.createOptions?.timePerRound?.toString() || "30");
    
    // Sync local state when modal opens or multiplayer state changes
    useEffect(() => {
        if (shown) {
            setLocalRounds(multiplayerState?.createOptions?.rounds?.toString() || "5");
            const time = multiplayerState?.createOptions?.timePerRound;
            if (time !== 60 * 60 * 24) {
                setLocalTime(time?.toString() || "30");
            }
        }
    }, [shown, multiplayerState?.createOptions?.rounds, multiplayerState?.createOptions?.timePerRound]);
    
    const isTimerDisabled = multiplayerState?.createOptions?.timePerRound === 60 * 60 * 24;
    
    // Helper to clamp and commit rounds value
    const commitRounds = (value) => {
        const num = parseInt(value) || 1;
        const clamped = Math.max(1, Math.min(20, num));
        setLocalRounds(clamped.toString());
        setMultiplayerState(prev => ({
            ...prev,
            createOptions: { ...prev.createOptions, rounds: clamped }
        }));
    };
    
    // Helper to clamp and commit time value
    const commitTime = (value) => {
        const num = parseInt(value) || 10;
        const clamped = Math.max(10, Math.min(300, num));
        setLocalTime(clamped.toString());
        setMultiplayerState(prev => ({
            ...prev,
            createOptions: { ...prev.createOptions, timePerRound: clamped }
        }));
    };
    
    const adjustRounds = (delta) => {
        const current = parseInt(localRounds) || 5;
        commitRounds(current + delta);
    };
    
    const adjustTime = (delta) => {
        const current = parseInt(localTime) || 30;
        commitTime(current + delta);
    };

    if (selectCountryModalShown) {
        return (
            <MapsModal 
                showAllCountriesOption={true} 
                shown={selectCountryModalShown} 
                onClose={() => setSelectCountryModalShown(false)} 
                session={session} 
                text={text} 
                customChooseMapCallback={(map) => {
                    setMultiplayerState(prev => ({
                        ...prev, 
                        createOptions: {
                            ...prev.createOptions, 
                            location: map.countryMap || map.slug, 
                            displayLocation: map.name,
                            nm: gameOptions?.nm,
                            npz: gameOptions?.npz,
                            showRoadName: gameOptions?.showRoadName,
                        }
                    }));
                    setSelectCountryModalShown(false);
                }} 
                chosenMap={multiplayerState?.createOptions?.location} 
                showOptions={true} 
                gameOptions={gameOptions} 
                setGameOptions={setGameOptions} 
            />
        );
    }
    
    return (
        <Modal 
            onClose={onClose} 
            open={shown} 
            center
            showCloseIcon={false}
            classNames={{ modal: 'party-modal-container' }}
            styles={{
                modal: {
                    background: 'transparent',
                    padding: 0,
                    boxShadow: 'none',
                },
                overlay: {
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(4px)',
                }
            }}
        >
            <div className="party-modal">
                {/* Header */}
                <div className="party-modal__header">
                    <h2 className="party-modal__title">{text("editOptions")}</h2>
                </div>
                
                {/* Content */}
                <div className="party-modal__content">
                    {/* Rounds Setting */}
                    <div className="party-modal__setting">
                        <label className="party-modal__label">{text("numOfRounds")}</label>
                        <div className="party-modal__stepper">
                            <button 
                                className="party-modal__stepper-btn"
                                onClick={() => adjustRounds(-1)}
                                disabled={parseInt(localRounds) <= 1}
                                aria-label="Decrease rounds"
                            >
                                <FaMinus />
                            </button>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className="party-modal__stepper-input"
                                value={localRounds}
                                onChange={(e) => setLocalRounds(e.target.value.replace(/[^0-9]/g, ''))}
                                onBlur={(e) => commitRounds(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && commitRounds(e.target.value)}
                            />
                            <button 
                                className="party-modal__stepper-btn"
                                onClick={() => adjustRounds(1)}
                                disabled={parseInt(localRounds) >= 20}
                                aria-label="Increase rounds"
                            >
                                <FaPlus />
                            </button>
                        </div>
                        <span className="party-modal__hint">1-20 rounds</span>
                    </div>
                    
                    {/* Timer Toggle */}
                    <div className="party-modal__setting party-modal__setting--toggle">
                        <label className="party-modal__label">{text('disableTimer')}</label>
                        <button 
                            className={`party-modal__toggle ${isTimerDisabled ? 'party-modal__toggle--active' : ''}`}
                            onClick={() => {
                                const newDisabled = !isTimerDisabled;
                                if (newDisabled) {
                                    setMultiplayerState(prev => ({
                                        ...prev,
                                        createOptions: { ...prev.createOptions, timePerRound: 60 * 60 * 24 }
                                    }));
                                } else {
                                    const time = parseInt(localTime) || 30;
                                    const clamped = Math.max(10, Math.min(300, time));
                                    setMultiplayerState(prev => ({
                                        ...prev,
                                        createOptions: { ...prev.createOptions, timePerRound: clamped }
                                    }));
                                }
                            }}
                            aria-pressed={isTimerDisabled}
                        >
                            <span className="party-modal__toggle-track">
                                <span className="party-modal__toggle-thumb" />
                            </span>
                        </button>
                    </div>
                    
                    {/* Time Per Round */}
                    {!isTimerDisabled && (
                        <div className="party-modal__setting">
                            <label className="party-modal__label">{text("timePerRoundSecs")}</label>
                            <div className="party-modal__stepper">
                                <button 
                                    className="party-modal__stepper-btn"
                                    onClick={() => adjustTime(-10)}
                                    disabled={parseInt(localTime) <= 10}
                                    aria-label="Decrease time"
                                >
                                    <FaMinus />
                                </button>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    className="party-modal__stepper-input"
                                    value={localTime}
                                    onChange={(e) => setLocalTime(e.target.value.replace(/[^0-9]/g, ''))}
                                    onBlur={(e) => commitTime(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && commitTime(e.target.value)}
                                />
                                <button 
                                    className="party-modal__stepper-btn"
                                    onClick={() => adjustTime(10)}
                                    disabled={parseInt(localTime) >= 300}
                                    aria-label="Increase time"
                                >
                                    <FaPlus />
                                </button>
                            </div>
                            <span className="party-modal__hint">10-300 seconds</span>
                        </div>
                    )}
                    
                    <div className="party-modal__divider" />
                    
                    {/* NMPZ Toggle */}
                    <div className="party-modal__setting party-modal__setting--toggle">
                        <label className="party-modal__label">{text('nmpz')}</label>
                        <button 
                            className={`party-modal__toggle ${(gameOptions.nm && gameOptions.npz) ? 'party-modal__toggle--active' : ''}`}
                            onClick={() => {
                                const newValue = !(gameOptions.nm && gameOptions.npz);
                                setGameOptions({
                                    ...gameOptions,
                                    nm: newValue,
                                    npz: newValue
                                });
                            }}
                            aria-pressed={gameOptions.nm && gameOptions.npz}
                        >
                            <span className="party-modal__toggle-track">
                                <span className="party-modal__toggle-thumb" />
                            </span>
                        </button>
                    </div>
                    
                    <div className="party-modal__divider" />
                    
                    {/* Map Selection */}
                    <div className="party-modal__setting party-modal__setting--map">
                        <div className="party-modal__map-info">
                            <FaMap className="party-modal__map-icon" />
                            <div className="party-modal__map-details">
                                <span className="party-modal__map-label">{text("map")}</span>
                                <span className="party-modal__map-name">
                                    {multiplayerState?.createOptions?.displayLocation || multiplayerState?.createOptions?.location || text("allCountries")}
                                </span>
                            </div>
                        </div>
                        <button 
                            className="party-modal__change-map-btn"
                            onClick={() => setSelectCountryModalShown(true)}
                        >
                            {text("change")}
                        </button>
                    </div>
                </div>
                
                {/* Footer */}
                <div className="party-modal__footer">
                    <button 
                        className="party-modal__save-btn"
                        onClick={() => {
                            // Construct the complete options object with all current values
                            const finalOptions = {
                                ...multiplayerState.createOptions,
                                nm: gameOptions.nm,
                                npz: gameOptions.npz,
                                showRoadName: gameOptions.showRoadName
                            };
                            
                            // Update local state
                            setMultiplayerState(prev => ({
                                ...prev,
                                createOptions: finalOptions
                            }));
                            
                            // Send to server with the complete options
                            handleAction("setPrivateGameOptions", finalOptions);
                            onClose();
                        }}
                    >
                        <FaCheck style={{ marginRight: '8px' }} />
                        {text("save")}
                    </button>
                </div>
            </div>
            
            <style jsx global>{`
                .party-modal-container {
                    max-width: 480px !important;
                    width: 94vw !important;
                }
            `}</style>
            <style jsx>{`
                .party-modal {
                    background: linear-gradient(165deg, #1a2a1a 0%, #0d1a0d 100%);
                    border-radius: 20px;
                    border: 1px solid rgba(76, 175, 80, 0.3);
                    box-shadow: 
                        0 25px 50px rgba(0, 0, 0, 0.5),
                        0 0 0 1px rgba(255, 255, 255, 0.05),
                        inset 0 1px 0 rgba(255, 255, 255, 0.1);
                    overflow: hidden;
                    width: 100%;
                    max-width: 480px;
                }
                
                .party-modal__header {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px 24px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                    background: rgba(0, 0, 0, 0.2);
                }
                
                .party-modal__title {
                    margin: 0;
                    font-size: 1.25rem;
                    font-weight: 600;
                    color: #fff;
                    letter-spacing: 0.02em;
                }
                
                .party-modal__content {
                    padding: 20px 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                
                .party-modal__setting {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                
                .party-modal__setting--toggle {
                    flex-direction: row;
                    align-items: center;
                    justify-content: space-between;
                }
                
                .party-modal__setting--map {
                    flex-direction: row;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.06);
                }
                
                .party-modal__label {
                    font-size: 0.9rem;
                    font-weight: 500;
                    color: rgba(255, 255, 255, 0.85);
                }
                
                .party-modal__stepper {
                    display: flex;
                    align-items: center;
                    gap: 0;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    overflow: hidden;
                }
                
                .party-modal__stepper-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 48px;
                    height: 48px;
                    border: none;
                    background: transparent;
                    color: rgba(255, 255, 255, 0.7);
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-size: 0.9rem;
                }
                
                .party-modal__stepper-btn:hover:not(:disabled) {
                    background: rgba(76, 175, 80, 0.2);
                    color: #4caf50;
                }
                
                .party-modal__stepper-btn:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                }
                
                .party-modal__stepper-input {
                    width: 70px;
                    height: 48px;
                    border: none;
                    background: transparent;
                    color: #fff;
                    font-size: 1.1rem;
                    font-weight: 600;
                    text-align: center;
                    outline: none;
                    -moz-appearance: textfield;
                }
                
                .party-modal__stepper-input::-webkit-outer-spin-button,
                .party-modal__stepper-input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                
                .party-modal__stepper-input:focus {
                    background: rgba(76, 175, 80, 0.1);
                }
                
                .party-modal__hint {
                    font-size: 0.75rem;
                    color: rgba(255, 255, 255, 0.4);
                }
                
                .party-modal__toggle {
                    position: relative;
                    width: 52px;
                    height: 28px;
                    padding: 0;
                    border: none;
                    background: transparent;
                    cursor: pointer;
                }
                
                .party-modal__toggle-track {
                    display: block;
                    width: 100%;
                    height: 100%;
                    background: rgba(255, 255, 255, 0.15);
                    border-radius: 14px;
                    transition: background 0.25s ease;
                }
                
                .party-modal__toggle--active .party-modal__toggle-track {
                    background: #4caf50;
                }
                
                .party-modal__toggle-thumb {
                    position: absolute;
                    top: 3px;
                    left: 3px;
                    width: 22px;
                    height: 22px;
                    background: #fff;
                    border-radius: 50%;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                    transition: transform 0.25s ease;
                }
                
                .party-modal__toggle--active .party-modal__toggle-thumb {
                    transform: translateX(24px);
                }
                
                .party-modal__divider {
                    height: 1px;
                    background: rgba(255, 255, 255, 0.08);
                    margin: 4px 0;
                }
                
                .party-modal__map-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    min-width: 0;
                    flex: 1;
                }
                
                .party-modal__map-icon {
                    font-size: 1.25rem;
                    color: #4caf50;
                    flex-shrink: 0;
                }
                
                .party-modal__map-details {
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }
                
                .party-modal__map-label {
                    font-size: 0.75rem;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                
                .party-modal__map-name {
                    font-size: 0.95rem;
                    font-weight: 500;
                    color: #fff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .party-modal__change-map-btn {
                    padding: 8px 16px;
                    border: 1px solid rgba(76, 175, 80, 0.5);
                    border-radius: 8px;
                    background: transparent;
                    color: #4caf50;
                    font-size: 0.85rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    flex-shrink: 0;
                }
                
                .party-modal__change-map-btn:hover {
                    background: rgba(76, 175, 80, 0.15);
                    border-color: #4caf50;
                }
                
                .party-modal__footer {
                    padding: 16px 24px 20px;
                    border-top: 1px solid rgba(255, 255, 255, 0.08);
                    background: rgba(0, 0, 0, 0.2);
                }
                
                .party-modal__save-btn {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 14px 24px;
                    border: none;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
                    color: #fff;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
                }
                
                .party-modal__save-btn:hover {
                    background: linear-gradient(135deg, #5cbf60 0%, #43a047 100%);
                    box-shadow: 0 6px 16px rgba(76, 175, 80, 0.4);
                    transform: translateY(-1px);
                }
                
                .party-modal__save-btn:active {
                    transform: translateY(0);
                }
                
                @media (max-width: 480px) {
                    .party-modal__header {
                        padding: 16px 18px;
                    }
                    
                    .party-modal__title {
                        font-size: 1.1rem;
                    }
                    
                    .party-modal__content {
                        padding: 16px 18px;
                        gap: 14px;
                    }
                    
                    .party-modal__stepper-btn {
                        width: 44px;
                        height: 44px;
                    }
                    
                    .party-modal__stepper-input {
                        width: 60px;
                        height: 44px;
                    }
                    
                    .party-modal__footer {
                        padding: 14px 18px 18px;
                    }
                    
                    .party-modal__save-btn {
                        padding: 12px 20px;
                    }
                }
            `}</style>
        </Modal>
    );
}
