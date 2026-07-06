import { useState, useEffect } from "react";
import { FaMinus, FaPlus, FaMap, FaCheck } from "react-icons/fa";
import { FaUserGroup } from "react-icons/fa6";
import { useTranslation } from "./useTranslations";
import Modal from "react-responsive-modal";
import MapsModal from "./maps/mapsModal";

export default function PartyModal({ onClose, ws, setWs, multiplayerError, multiplayerState, setMultiplayerState, session, handleAction, gameOptions, setGameOptions, shown, setSelectCountryModalShown, selectCountryModalShown }) {
    const { t: text } = useTranslation("common");

    // Local state for number inputs to allow free typing
    const [localRounds, setLocalRounds] = useState(multiplayerState?.createOptions?.rounds?.toString() || "5");
    const [localTime, setLocalTime] = useState(multiplayerState?.createOptions?.timePerRound?.toString() || "30");

    // Team mode config — buffered like every other option here and committed
    // on close (one setTeamConfig if anything changed). Server state lives on
    // gameData, not createOptions: a fresh party is always Classic.
    const [localTeamGame, setLocalTeamGame] = useState(false);
    const [localScoring, setLocalScoring] = useState('closest');
    const [localAllowPick, setLocalAllowPick] = useState(false);

    // Sync local state when modal opens or multiplayer state changes
    useEffect(() => {
        if (shown) {
            setLocalRounds(multiplayerState?.createOptions?.rounds?.toString() || "5");
            const time = multiplayerState?.createOptions?.timePerRound;
            if (time !== 60 * 60 * 24) {
                setLocalTime(time?.toString() || "30");
            }
            setLocalTeamGame(!!multiplayerState?.gameData?.teamGame);
            setLocalScoring(multiplayerState?.gameData?.teamScoring ?? 'closest');
            setLocalAllowPick(!!multiplayerState?.gameData?.allowTeamPick);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown, multiplayerState?.createOptions?.rounds, multiplayerState?.createOptions?.timePerRound]);
    
    const isTimerDisabled = multiplayerState?.createOptions?.timePerRound === 60 * 60 * 24;
    
    // Single source for the option bounds — input blur, steppers and Save/ESC
    // must all clamp identically (this used to live as three divergent copies
    // with three different empty-input fallbacks). Invalid/empty input falls
    // back to the game defaults (5 rounds / 30s).
    const clampRounds = (value) => Math.max(1, Math.min(20, parseInt(value) || 5));
    const clampTime = (value) => Math.max(10, Math.min(300, parseInt(value) || 30));

    // Helper to clamp and commit rounds value
    const commitRounds = (value) => {
        const clamped = clampRounds(value);
        setLocalRounds(clamped.toString());
        setMultiplayerState(prev => ({
            ...prev,
            createOptions: { ...prev.createOptions, rounds: clamped }
        }));
    };

    // Helper to clamp and commit time value
    const commitTime = (value) => {
        const clamped = clampTime(value);
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


    const isValidRoundTime = isTimerDisabled || (!isNaN(parseInt(localTime)) && parseInt(localTime) >= 10 && parseInt(localTime) <= 300);

    // Build the final options object using clamped input values, push to server,
    // then close. Used by both Save and outside-click/ESC so the two paths stay
    // in sync — closing without explicit Save was confusing users into thinking
    // their changes were lost.
    const commitAndClose = () => {
        const clampedRounds = clampRounds(localRounds);
        const clampedTime = isTimerDisabled ? 60 * 60 * 24 : clampTime(localTime);

        const finalOptions = {
            ...multiplayerState.createOptions,
            rounds: clampedRounds,
            timePerRound: clampedTime,
            nm: gameOptions.nm,
            npz: gameOptions.npz,
            showRoadName: gameOptions.showRoadName,
        };

        setMultiplayerState(prev => ({
            ...prev,
            createOptions: finalOptions,
        }));

        handleAction("setPrivateGameOptions", finalOptions);

        // Team config rides the same Save: one setTeamConfig only if something
        // actually changed (enabling reshuffles teams server-side, so no
        // spurious sends).
        const cur = multiplayerState?.gameData;
        if (localTeamGame !== !!cur?.teamGame
            || (localTeamGame && localScoring !== (cur?.teamScoring ?? 'closest'))
            || (localTeamGame && localAllowPick !== !!cur?.allowTeamPick)) {
            handleAction("setTeamConfig", {
                enabled: localTeamGame,
                scoring: localScoring,
                allowTeamPick: localAllowPick,
            });
        }
        onClose();
    };

    // Render BOTH modals at once and toggle them via their `open`/`shown`
    // props. The previous early-return swapped one for the other, which
    // unmounted the party modal instantly (no exit animation) and produced a
    // jarring "flash to nothing → maps modal slides in" transition. With both
    // mounted, react-responsive-modal cross-fades them: the party modal
    // gracefully fades down while the maps modal slides up.
    return (
        <>
        <Modal
            onClose={commitAndClose}
            open={shown && !selectCountryModalShown}
            center
            showCloseIcon={false}
            animationDuration={400}
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
                    {/* Game Mode: Classic (FFA) vs Team Duel, plus the team
                        sub-options. Buffered like everything else here and
                        committed on Save/close. Reuses the global party-lobby
                        segmented/checkbox/hint styles. */}
                    <div className="party-modal__setting">
                        <label className="party-modal__label">{text("gameMode")}</label>
                        <div className="party-lobby__seg party-lobby__seg--block" role="group" aria-label={text("gameMode")}>
                            <button
                                className={`party-lobby__seg-btn ${!localTeamGame ? 'party-lobby__seg-btn--active' : ''}`}
                                onClick={() => {
                                    setLocalTeamGame(false);
                                    // Undo the team-duel timer default if untouched
                                    if (!isTimerDisabled && parseInt(localTime) === 60) setLocalTime('30');
                                }}
                            >{text("classicMode")}</button>
                            <button
                                className={`party-lobby__seg-btn ${localTeamGame ? 'party-lobby__seg-btn--active' : ''}`}
                                onClick={() => {
                                    setLocalTeamGame(true);
                                    // Team duels default to 60s rounds (teams need coordination
                                    // time) — only bump the untouched 30s classic default.
                                    if (!isTimerDisabled && parseInt(localTime) === 30) setLocalTime('60');
                                }}
                            ><FaUserGroup /> {text("teamDuel")}</button>
                        </div>
                        <p className="party-lobby__hint">
                            {localTeamGame ? text("teamDuelModeHint") : text("classicModeHint")}
                        </p>
                    </div>

                    {localTeamGame && (
                        <>
                            <div className="party-modal__setting">
                                <label className="party-modal__label">{text("scoring")}</label>
                                <div className="party-lobby__seg party-lobby__seg--block" role="group" aria-label={text("scoring")}>
                                    {['closest', 'average'].map((mode) => (
                                        <button
                                            key={mode}
                                            className={`party-lobby__seg-btn ${localScoring === mode ? 'party-lobby__seg-btn--active' : ''}`}
                                            onClick={() => setLocalScoring(mode)}
                                        >{text(mode === 'average' ? 'scoringAverage' : 'scoringClosest')}</button>
                                    ))}
                                </div>
                                <p className="party-lobby__hint">
                                    {text(localScoring === 'average' ? 'scoringAverageHint' : 'scoringClosestHint')}
                                </p>
                            </div>
                            <label className="party-lobby__checkbox">
                                <input
                                    type="checkbox"
                                    checked={localAllowPick}
                                    onChange={() => setLocalAllowPick((v) => !v)}
                                />
                                <span>{text("allowTeamPick")}</span>
                            </label>
                        </>
                    )}

                    <div className="party-modal__divider" />

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
                            {!isValidRoundTime && <span style={{ color: '#ff6b6b', fontSize: '0.8rem' }}>{text("timePerRoundError")}</span>}
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
                        disabled={!isValidRoundTime}
                        onClick={commitAndClose}
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
                    border: 1px solid rgba(255, 255, 255, 0.3);
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
                    background: rgba(var(--r), var(--g), var(--b), 0.45);
                    color: #fff;
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
                    background: rgba(var(--r), var(--g), var(--b), 0.35);
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
                    background: var(--primary);
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
                    color: rgba(255, 255, 255, 0.85);
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
                    border: 1px solid rgba(255, 255, 255, 0.35);
                    border-radius: 8px;
                    background: transparent;
                    color: #fff;
                    font-size: 0.85rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    flex-shrink: 0;
                }

                .party-modal__change-map-btn:hover {
                    background: rgba(var(--r), var(--g), var(--b), 0.4);
                    border-color: var(--primary);
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
                    background: var(--primary);
                    color: #fff;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }

                .party-modal__save-btn:hover {
                    background: var(--primaryDark);
                    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
                    transform: translateY(-1px);
                }
                
                .party-modal__save-btn:active {
                    transform: translateY(0);
                }

                .party-modal__save-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                    box-shadow: none;
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
        <MapsModal
            showAllCountriesOption={true}
            hideCountryGuessrModes={true}
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
        </>
    );
}
