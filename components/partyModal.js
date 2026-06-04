import { useState, useEffect } from "react";
import { FaMinus, FaPlus, FaMap, FaCheck, FaListOl, FaStopwatch, FaLock, FaInfinity, FaCog } from "react-icons/fa";
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

    const isValidRoundTime = isTimerDisabled || (!isNaN(parseInt(localTime)) && parseInt(localTime) >= 10 && parseInt(localTime) <= 300);

    // Build the final options object using clamped input values, push to server,
    // then close. Used by both Save and outside-click/ESC so the two paths stay
    // in sync — closing without explicit Save was confusing users into thinking
    // their changes were lost.
    const commitAndClose = () => {
        const roundsNum = parseInt(localRounds);
        const clampedRounds = Math.max(1, Math.min(20, isNaN(roundsNum) ? 5 : roundsNum));

        let clampedTime;
        if (isTimerDisabled) {
            clampedTime = 60 * 60 * 24;
        } else {
            const t = parseInt(localTime);
            clampedTime = Math.max(10, Math.min(300, isNaN(t) ? 30 : t));
        }

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
                    background: 'rgba(0, 0, 0, 0.88)',
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                }
            }}
        >
            <div className="party-modal">
                <div className="party-modal__header">
                    <span className="party-modal__header-icon" aria-hidden="true">
                        <FaCog />
                    </span>
                    <h2 className="party-modal__title">{text("editOptions")}</h2>
                </div>

                <div className="party-modal__content">
                    <div className="party-modal__section">
                        <div className="party-modal__section-heading">Gameplay</div>

                        <div className="party-modal__row">
                            <span className="party-modal__row-icon party-modal__row-icon--rounds">
                                <FaListOl />
                            </span>
                            <div className="party-modal__row-text">
                                <div className="party-modal__row-label">{text("numOfRounds")}</div>
                                <div className="party-modal__row-hint">1–20 rounds</div>
                            </div>
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
                        </div>

                        <div className="party-modal__row party-modal__row--toggle">
                            <span className="party-modal__row-icon party-modal__row-icon--timer">
                                {isTimerDisabled ? <FaInfinity /> : <FaStopwatch />}
                            </span>
                            <div className="party-modal__row-text">
                                <div className="party-modal__row-label">{text('disableTimer')}</div>
                                <div className="party-modal__row-hint">
                                    {isTimerDisabled
                                        ? "No time limit per round."
                                        : "Each round has a countdown."}
                                </div>
                            </div>
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

                        {!isTimerDisabled && (
                            <div className="party-modal__row">
                                <span className="party-modal__row-icon party-modal__row-icon--time">
                                    <FaStopwatch />
                                </span>
                                <div className="party-modal__row-text">
                                    <div className="party-modal__row-label">{text("timePerRoundSecs")}</div>
                                    <div className="party-modal__row-hint">10–300 seconds</div>
                                    {!isValidRoundTime && (
                                        <div className="party-modal__row-error">{text("timePerRoundError")}</div>
                                    )}
                                </div>
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
                            </div>
                        )}
                    </div>

                    <div className="party-modal__section">
                        <div className="party-modal__section-heading">Rules</div>
                        <div className="party-modal__row party-modal__row--toggle">
                            <span className="party-modal__row-icon party-modal__row-icon--nmpz">
                                <FaLock />
                            </span>
                            <div className="party-modal__row-text">
                                <div className="party-modal__row-label">NMPZ</div>
                                <div className="party-modal__row-hint">{text('nmpz')}</div>
                            </div>
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
                    </div>

                    <div className="party-modal__section">
                        <div className="party-modal__section-heading">Map</div>
                        <div className="party-modal__row party-modal__row--map">
                            <span className="party-modal__row-icon party-modal__row-icon--map">
                                <FaMap />
                            </span>
                            <div className="party-modal__row-text">
                                <div className="party-modal__row-label">{text("map")}</div>
                                <div className="party-modal__row-mapname">
                                    {multiplayerState?.createOptions?.displayLocation || multiplayerState?.createOptions?.location || text("allCountries")}
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
                </div>

                <div className="party-modal__footer">
                    <button
                        className="party-modal__save-btn"
                        disabled={!isValidRoundTime}
                        onClick={commitAndClose}
                    >
                        <FaCheck />
                        {text("save")}
                    </button>
                </div>
            </div>

            <style jsx global>{`
                .party-modal-container {
                    max-width: 520px !important;
                    width: 94vw !important;
                }
            `}</style>
            <style jsx>{`
                /* === Card — flat opaque dark-blue. No gradient. */
                .party-modal {
                    background: #0d1730;
                    border-radius: 18px;
                    border: 1px solid rgba(96, 165, 250, 0.4);
                    box-shadow: 0 24px 56px rgba(0, 0, 0, 0.75);
                    overflow: hidden;
                    width: 100%;
                    max-width: 520px;
                    color: #fff;
                    font-family: 'Lexend', sans-serif;
                    animation: party-modal-pop 0.35s cubic-bezier(0.22, 1.4, 0.36, 1) both;
                }

                @keyframes party-modal-pop {
                    from { opacity: 0; transform: translateY(14px) scale(0.96); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }

                /* === Header — flat solid strip, no gradient. */
                .party-modal__header {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    padding: 20px 24px;
                    border-bottom: 1px solid rgba(96, 165, 250, 0.22);
                    background: #0a1226;
                }
                .party-modal__header-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    color: #60a5fa;
                    font-size: 22px;
                    line-height: 1;
                }
                .party-modal__header-icon :global(svg) { display: block; }
                .party-modal__title {
                    margin: 0;
                    font-family: 'GmarketSans', 'Lexend', sans-serif;
                    font-size: 1.3rem;
                    font-weight: 700;
                    color: #fff;
                    letter-spacing: 0.3px;
                }

                /* === Content — sectioned settings list. Generous
                 * bottom padding so the save button doesn't hug the map
                 * row (which previously made the modal look like it
                 * should scroll when it doesn't). */
                .party-modal__content {
                    padding: 18px 22px 28px;
                    display: flex;
                    flex-direction: column;
                    gap: 22px;
                }

                .party-modal__section {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .party-modal__section-heading {
                    padding: 0 4px 4px;
                    font-family: 'GmarketSans', 'Lexend', sans-serif;
                    font-size: 14px;
                    font-weight: 700;
                    letter-spacing: 0.2px;
                    color: rgba(191, 219, 254, 0.95);
                }

                /* === Settings row — uniform layout: icon | text | control.
                 * Flat opaque row, no outline. */
                .party-modal__row {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 12px 14px;
                    background: #1a2541;
                    border: none;
                    border-radius: 12px;
                    transition: background 0.15s ease;
                }
                .party-modal__row:hover {
                    background: #24315a;
                }

                /* Per-row standalone icon — no chip background. Larger
                 * glyph in its own accent colour. */
                .party-modal__row-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    flex-shrink: 0;
                    font-size: 22px;
                    line-height: 1;
                }
                .party-modal__row-icon--rounds { color: #60a5fa; }
                .party-modal__row-icon--timer,
                .party-modal__row-icon--time   { color: #facc15; }
                .party-modal__row-icon--nmpz   { color: #c084fc; }
                .party-modal__row-icon--map    { color: #4ade80; }

                .party-modal__row-text {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    min-width: 0;
                    flex: 1;
                }
                .party-modal__row-label {
                    font-family: 'Lexend', sans-serif;
                    font-size: 14.5px;
                    font-weight: 600;
                    color: #fff;
                    line-height: 1.2;
                }
                .party-modal__row-hint {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.55);
                    line-height: 1.35;
                }
                .party-modal__row-mapname {
                    font-family: 'GmarketSans', 'Lexend', sans-serif;
                    font-size: 14px;
                    font-weight: 700;
                    color: #fff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .party-modal__row-error {
                    margin-top: 4px;
                    font-size: 12px;
                    color: #fecaca;
                    font-weight: 500;
                }

                /* === Stepper — segmented blue chip with - / number / +.
                 * align-items:center on the parent + explicit height +
                 * line-height:1 inside the buttons makes the icons sit on
                 * the same horizontal axis as the number readout. */
                .party-modal__stepper {
                    display: inline-flex;
                    align-items: center;
                    height: 42px;
                    background: #0a1226;
                    border-radius: 10px;
                    border: none;
                    overflow: hidden;
                    flex-shrink: 0;
                }
                .party-modal__stepper-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 38px;
                    height: 100%;
                    padding: 0;
                    margin: 0;
                    border: none;
                    background: transparent;
                    color: rgba(255, 255, 255, 0.85);
                    cursor: pointer;
                    transition: background 0.15s ease, color 0.15s ease;
                    font-size: 13px;
                    line-height: 1;
                }
                .party-modal__stepper-btn :global(svg) {
                    display: block;
                }
                .party-modal__stepper-btn:hover:not(:disabled) {
                    background: #1d3573;
                    color: #fff;
                }
                .party-modal__stepper-btn:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                }
                .party-modal__stepper-input {
                    width: 60px;
                    height: 100%;
                    padding: 0;
                    margin: 0;
                    border: none;
                    background: transparent;
                    color: #fff;
                    font-family: 'GmarketSans', 'Lexend', sans-serif;
                    font-size: 1.05rem;
                    font-weight: 700;
                    text-align: center;
                    outline: none;
                    -moz-appearance: textfield;
                    font-variant-numeric: tabular-nums;
                    line-height: 1;
                }
                .party-modal__stepper-input::-webkit-outer-spin-button,
                .party-modal__stepper-input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                .party-modal__stepper-input:focus {
                    background: #1d3573;
                }

                /* === Toggle. Blue when on, neutral when off. */
                .party-modal__toggle {
                    position: relative;
                    width: 50px;
                    height: 28px;
                    padding: 0;
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    flex-shrink: 0;
                }
                .party-modal__toggle-track {
                    display: block;
                    width: 100%;
                    height: 100%;
                    background: #2a3450;
                    border-radius: 14px;
                    transition: background 0.25s ease;
                }
                .party-modal__toggle--active .party-modal__toggle-track {
                    background: #2c63d8;
                }
                .party-modal__toggle-thumb {
                    position: absolute;
                    top: 3px;
                    left: 3px;
                    width: 22px;
                    height: 22px;
                    background: #fff;
                    border-radius: 50%;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
                    transition: transform 0.25s ease;
                }
                .party-modal__toggle--active .party-modal__toggle-thumb {
                    transform: translateX(22px);
                }

                /* === Change-map button — ghost outline matching the blue
                 * accent. */
                .party-modal__change-map-btn {
                    padding: 8px 14px;
                    border: 1px solid rgba(96, 165, 250, 0.45);
                    border-radius: 10px;
                    background: #1d3573;
                    color: #fff;
                    font-family: 'GmarketSans', 'Lexend', sans-serif;
                    font-size: 13px;
                    font-weight: 700;
                    letter-spacing: 0.3px;
                    cursor: pointer;
                    flex-shrink: 0;
                    transition: background 0.15s ease, border-color 0.15s ease;
                }
                .party-modal__change-map-btn:hover {
                    background: #24407f;
                    border-color: rgba(96, 165, 250, 0.75);
                }

                /* === Footer — variant-C pressed-depth save. Extra
                 * top padding here on top of the content's bottom
                 * padding pushes the save button well clear of the
                 * last setting row. Flat solid background. */
                .party-modal__footer {
                    padding: 22px 22px 22px;
                    border-top: 1px solid rgba(96, 165, 250, 0.22);
                    background: #0a1226;
                }
                .party-modal__save-btn {
                    width: 100%;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    min-height: 52px;
                    padding: 0 24px;
                    border: 1px solid rgba(155, 195, 255, 0.45);
                    border-radius: 12px;
                    background: #2c63d8;
                    color: #fff;
                    font-family: 'GmarketSans', 'Lexend', sans-serif;
                    font-size: 16px;
                    font-weight: 700;
                    letter-spacing: 0.4px;
                    line-height: 1;
                    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
                    cursor: pointer;
                    transform: translateY(0);
                    box-shadow:
                        inset 0 1px 0 rgba(255, 255, 255, 0.28),
                        inset 0 -2px 0 rgba(0, 0, 0, 0.3);
                    transition: transform 0.16s ease-out, filter 0.16s ease-out, box-shadow 0.16s ease-out;
                }
                .party-modal__save-btn:hover:not(:disabled) {
                    transform: translateY(-1px);
                    filter: brightness(1.06);
                }
                .party-modal__save-btn:active:hover:not(:disabled) {
                    transform: translateY(1px);
                    filter: brightness(0.95);
                    box-shadow:
                        inset 0 1px 0 rgba(0, 0, 0, 0.32),
                        inset 0 -1px 0 rgba(255, 255, 255, 0.14);
                }
                .party-modal__save-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                    filter: grayscale(0.4);
                }

                @media (max-width: 480px) {
                    .party-modal__header { padding: 16px 18px; }
                    .party-modal__title { font-size: 1.15rem; }
                    .party-modal__content { padding: 14px 16px 4px; gap: 14px; }
                    .party-modal__row { padding: 10px 12px; gap: 10px; }
                    .party-modal__row-icon { width: 32px; height: 32px; }
                    .party-modal__row-label { font-size: 13.5px; }
                    .party-modal__row-hint { font-size: 11.5px; }
                    .party-modal__stepper-btn { width: 34px; height: 38px; }
                    .party-modal__stepper-input { width: 50px; height: 38px; font-size: 0.95rem; }
                    .party-modal__footer { padding: 12px 16px 18px; }
                    .party-modal__save-btn { min-height: 48px; font-size: 15px; }
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
