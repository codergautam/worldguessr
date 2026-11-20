import { useState, useEffect } from "react";
import { FaMinus, FaPlus, FaChevronRight } from "react-icons/fa";
import { FaUserGroup } from "react-icons/fa6";
import { useTranslation } from "./useTranslations";
import Modal from "react-responsive-modal";
import MapsModal from "./maps/mapsModal";
import { getMode, REGIONS, QUIZ_PARTIES } from "../shared/modes/catalog.js";
import { quizOf, QUIZ_IDS, MODE_LABEL_KEYS } from "./modes/quizClient";
import { continentKey } from "./utils/continentLocale";

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
    // Party comms are EXCLUSIVE by user ruling: chat / emotes / off, host
    // picks, chat is the default. Maps onto the two server booleans
    // (disableEmotes/disableChat) so old clients and the server contract
    // stay untouched: chat = emotes off, emotes = chat off, off = both off.
    const [localComms, setLocalComms] = useState('chat');
    // Guest access — buffered like team config, committed on Save via its
    // own setPartySecurity message (setPrivateGameOptions regenerates
    // locations). Lock is NOT here: it's the instant button on the lobby
    // card next to the code.
    const [localAllowGuests, setLocalAllowGuests] = useState(true);
    // Game (Street View or a quiz) and quiz region, buffered like team
    // config and sent with setPrivateGameOptions on Save.
    const [localMode, setLocalMode] = useState('classic');
    const [localRegion, setLocalRegion] = useState('all');

    // Sync local state ONLY when the modal opens. The steppers/timer toggle
    // commit straight into createOptions while the modal is open — if those
    // values were deps here, every commit would re-run this and stomp the
    // still-buffered team/emote selections back to server truth (Team Duel
    // snapped back to Classic on any other edit).
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
            {
                const fromServer =
                    multiplayerState?.gameData?.disableChat && multiplayerState?.gameData?.disableEmotes ? 'none'
                    : multiplayerState?.gameData?.disableChat ? 'emotes' : 'chat';
                // Guest hosts can't pick chat (see the selector below), so never
                // seed them a value that isn't on their menu.
                setLocalComms(fromServer === 'chat' && !session?.token?.username ? 'emotes' : fromServer);
            }
            setLocalAllowGuests(multiplayerState?.gameData?.allowGuests !== false);
            // The lobby's truth is gameData; before it lands (pending create
            // shell) the last saved createOptions stand in.
            {
                const seed = multiplayerState?.gameData ?? multiplayerState?.createOptions;
                // Quiz parties are off for now: every party is Street View.
                setLocalMode(QUIZ_PARTIES ? seed?.mode ?? 'classic' : 'classic');
                setLocalRegion(QUIZ_PARTIES ? seed?.region ?? 'all' : 'all');
                // A timed quiz with the timer saved off runs at its default
                // (effectiveTimePerRound), so show that instead of a stale value.
                if (time === 60 * 60 * 24 && getMode(seed?.mode)?.timerRequired) {
                    setLocalTime(String(getMode(seed.mode).defaultTimePerRound));
                }
            }
            // NMPZ/No Move toggles read the gameOptions prop, but that's
            // MultiplayerHome-local state that resets on remount — the party's
            // truth lives on gameData (same as team config above). Without
            // this seed, a saved NM/NMPZ party showed its toggles OFF on
            // reopen.
            if (multiplayerState?.gameData?.nm !== undefined) {
                setGameOptions((prev) => ({
                    ...prev,
                    nm: !!multiplayerState.gameData.nm,
                    npz: !!multiplayerState.gameData.npz,
                }));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown]);
    
    const quiz = quizOf(localMode);
    // A timed quiz (speed bonus) cannot run with the timer off: its toggle
    // hides, and a saved "off" choice waits for Street View.
    const isTimerDisabled = multiplayerState?.createOptions?.timePerRound === 60 * 60 * 24 && !quiz?.timerRequired;

    // Single source for the option bounds — input blur, steppers and Save/ESC
    // must all clamp identically (this used to live as three divergent copies
    // with three different empty-input fallbacks). Invalid/empty input falls
    // back to the game defaults (5 rounds / 30s).
    const clampRounds = (value) => Math.max(1, Math.min(20, parseInt(value) || 5));
    // Timed quizzes cap the round time at 60s.
    const maxTime = quiz?.timerRequired ? 60 : 300;
    const clampTime = (value) => Math.max(10, Math.min(maxTime, parseInt(value) || 30));

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
    
    // One step below 10 seconds is "Off" (no timer); one step up from Off is 10.
    const adjustTime = (delta) => {
        if (isTimerDisabled) {
            if (delta > 0) commitTime(10);
            return;
        }
        const current = parseInt(localTime) || 30;
        if (delta < 0 && current <= 10 && !quiz?.timerRequired) {
            setMultiplayerState(prev => ({
                ...prev,
                createOptions: { ...prev.createOptions, timePerRound: 60 * 60 * 24 }
            }));
            return;
        }
        commitTime(current + delta);
    };

    // A yes/no option as the same segment every other row uses.
    const onOff = (value, set, label) => (
        <div className="party-lobby__seg" role="group" aria-label={label}>
            {[true, false].map((v) => (
                <button
                    key={String(v)}
                    className={`party-lobby__seg-btn ${value === v ? 'party-lobby__seg-btn--active' : ''}`}
                    onClick={() => set(v)}
                >{text(v ? 'optOn' : 'optOff')}</button>
            ))}
        </div>
    );

    // Same untouched-default trick as the team toggle: only a time the host
    // never edited follows the new game's default (Street View back to 30s).
    const selectMode = (id) => {
        const t = parseInt(localTime);
        if (t === getMode(localMode).defaultTimePerRound) setLocalTime(String(getMode(id).defaultTimePerRound));
        else if (getMode(id).timerRequired && t > 60) setLocalTime('60');
        setLocalMode(id);
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
            // location/displayLocation stay as they are, so going back to
            // Street View restores the chosen map.
            mode: localMode,
            region: localRegion,
            // Guest hosts choose emotes or off (never chat: they can neither
            // send it nor moderate the room), so their chat flag is pinned true
            // and only the emote flag follows the choice.
            ...(session?.token?.username ? {
                disableEmotes: localComms === 'chat' || localComms === 'none',
                disableChat: localComms === 'emotes' || localComms === 'none',
            } : {
                disableEmotes: localComms === 'none',
                disableChat: true,
            }),
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

        // Guest access rides the same Save, own wire message, only when
        // changed — and sends ONLY allowGuests so a lock toggled from the
        // lobby button while this modal sat open is never stomped.
        if (localAllowGuests !== (cur?.allowGuests !== false)) {
            handleAction("setPartySecurity", {
                allowGuests: localAllowGuests,
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
            blockScroll={false} // Critical: on iOS body-scroll-lock preventDefaults every
                                // touchmove the library's container can't consume itself,
                                // which kills the modal's own scrolling. Same as settings/
                                // account/maps modals. Nothing behind can scroll anyway.
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
            {/* One list of rows: label left, control right. Three controls
                only (segment, stepper, the map row). Closing in any way
                saves, so there is one button. */}
            <div className="party-modal">
                <h2 className="party-modal__title">{text("editOptions")}</h2>

                <div className="party-modal__rows">
                    {/* Game: Street View or a quiz (off while QUIZ_PARTIES is). */}
                    {QUIZ_PARTIES && (
                        <div className="party-modal__row party-modal__row--stack">
                            <span className="party-modal__label">{text("quizGame")}</span>
                            <div className="party-lobby__seg party-lobby__seg--block party-modal__game-seg" role="group" aria-label={text("quizGame")}>
                                {['classic', ...QUIZ_IDS.filter((id) => !quizOf(id)?.race)].map((id) => (
                                    <button
                                        key={id}
                                        className={`party-lobby__seg-btn ${localMode === id ? 'party-lobby__seg-btn--active' : ''}`}
                                        onClick={() => selectMode(id)}
                                    >{text(id === 'classic' ? 'quizStreetView' : MODE_LABEL_KEYS[id])}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Classic (FFA) or Team Duel, plus the team options.
                        Buffered and committed on close. */}
                    <div className="party-modal__row">
                        <span className="party-modal__label">{text("gameMode")}</span>
                        <div className="party-lobby__seg" role="group" aria-label={text("gameMode")}>
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
                                    // time): only bump the untouched 30s classic default.
                                    if (!isTimerDisabled && parseInt(localTime) === 30) setLocalTime('60');
                                }}
                            ><FaUserGroup /> {text("teamDuel")}</button>
                        </div>
                    </div>

                    {localTeamGame && (
                        <>
                            <div className="party-modal__row">
                                <span className="party-modal__label">{text("scoring")}</span>
                                <div className="party-lobby__seg" role="group" aria-label={text("scoring")}>
                                    {['closest', 'average'].map((mode) => (
                                        <button
                                            key={mode}
                                            className={`party-lobby__seg-btn ${localScoring === mode ? 'party-lobby__seg-btn--active' : ''}`}
                                            onClick={() => setLocalScoring(mode)}
                                        >{text(mode === 'average' ? 'scoringAverage' : 'scoringClosest')}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="party-modal__row">
                                <span className="party-modal__label">{text("allowTeamPick")}</span>
                                {onOff(localAllowPick, setLocalAllowPick, text("allowTeamPick"))}
                            </div>
                        </>
                    )}

                    <div className="party-modal__row">
                        <span className="party-modal__label">{text("rounds")}</span>
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
                                aria-label={text("rounds")}
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

                    {/* Round time. One step below 10 seconds is "Off" (no
                        timer); a timed quiz cannot go there. */}
                    <div className="party-modal__row">
                        <span className="party-modal__label">{text("timePerRoundSecs")}</span>
                        <div className="party-modal__stepper">
                            <button
                                className="party-modal__stepper-btn"
                                onClick={() => adjustTime(-10)}
                                disabled={isTimerDisabled || (!!quiz?.timerRequired && parseInt(localTime) <= 10)}
                                aria-label="Decrease time"
                            >
                                <FaMinus />
                            </button>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className="party-modal__stepper-input"
                                aria-label={text("timePerRoundSecs")}
                                readOnly={isTimerDisabled}
                                value={isTimerDisabled ? text("commsOff") : localTime}
                                onChange={(e) => setLocalTime(e.target.value.replace(/[^0-9]/g, ''))}
                                onBlur={(e) => !isTimerDisabled && commitTime(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !isTimerDisabled && commitTime(e.target.value)}
                            />
                            <button
                                className="party-modal__stepper-btn"
                                onClick={() => adjustTime(10)}
                                disabled={!isTimerDisabled && parseInt(localTime) >= maxTime}
                                aria-label="Increase time"
                            >
                                <FaPlus />
                            </button>
                        </div>
                    </div>

                    {/* Street View movement: Moving / No Move / NMPZ (nm/npz
                        mapping: neither / nm only / both; an npz-only state
                        is unreachable by design). */}
                    {!quiz && (
                        <div className="party-modal__row">
                            <span className="party-modal__label">{text('mode')}</span>
                            <div className="party-lobby__seg" role="group" aria-label={text('mode')}>
                                {[['moving', text('moving')], ['noMove', text('noMove')], ['nmpz', 'NMPZ']].map(([v, name]) => (
                                    <button
                                        key={v}
                                        title={v === 'nmpz' ? text('nmpz') : undefined}
                                        className={`party-lobby__seg-btn ${(gameOptions.nm && gameOptions.npz ? 'nmpz' : gameOptions.nm ? 'noMove' : 'moving') === v ? 'party-lobby__seg-btn--active' : ''}`}
                                        onClick={() => setGameOptions({ ...gameOptions, nm: v !== 'moving', npz: v === 'nmpz' })}
                                    >{name}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Map (Street View only; quizzes use Region). The whole
                        row opens the maps modal. */}
                    {!quiz && (
                        <button className="party-modal__row party-modal__map" onClick={() => setSelectCountryModalShown(true)}>
                            <span className="party-modal__label">{text("map")}</span>
                            <span className="party-modal__map-name">
                                <span>{multiplayerState?.createOptions?.displayLocation || multiplayerState?.createOptions?.location || text("allCountries")}</span>
                                <FaChevronRight aria-hidden="true" />
                            </span>
                        </button>
                    )}

                    {/* Quiz region: takes the map's place for quizzes. */}
                    {quiz?.supportsRegion && (
                        <div className="party-modal__row party-modal__row--stack">
                            <span className="party-modal__label">{text('quizRegion')}</span>
                            <div className="party-lobby__seg party-lobby__seg--block party-modal__game-seg" role="group" aria-label={text('quizRegion')}>
                                {REGIONS.map((r) => (
                                    <button
                                        key={r}
                                        className={`party-lobby__seg-btn ${localRegion === r ? 'party-lobby__seg-btn--active' : ''}`}
                                        onClick={() => setLocalRegion(r)}
                                    >{text(r === 'all' ? 'allCountries' : continentKey(r))}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Comms: chat / emotes / off (host-set, chat default).
                        Disabled channels hide on every client AND the server
                        drops their raw messages; "off" disables both booleans.
                        GUEST hosts get emotes or off only: they can neither
                        send chat nor moderate a chat room, so the server pins
                        their room chat-free either way. */}
                    <div className="party-modal__row">
                        <span className="party-modal__label">{text('communication')}</span>
                        <div className="party-lobby__seg" role="group" aria-label={text('communication')}>
                            {(session?.token?.username ? ['chat', 'emotes', 'none'] : ['emotes', 'none']).map((mode) => (
                                <button
                                    key={mode}
                                    className={`party-lobby__seg-btn ${localComms === mode ? 'party-lobby__seg-btn--active' : ''}`}
                                    onClick={() => setLocalComms(mode)}
                                >{text(mode === 'chat' ? 'chat' : mode === 'emotes' ? 'emotes' : 'commsOff')}</button>
                            ))}
                        </div>
                    </div>

                    {/* Guests off = only signed-in accounts can join. The LOCK
                        control lives on the lobby card next to the game code. */}
                    <div className="party-modal__row">
                        <span className="party-modal__label">{text('allowGuests')}</span>
                        {onOff(localAllowGuests, setLocalAllowGuests, text('allowGuests'))}
                    </div>
                </div>

                <div className="party-modal__footer">
                    <button
                        className="party-modal__save-btn"
                        disabled={!isValidRoundTime}
                        onClick={commitAndClose}
                    >
                        {text("save")}
                    </button>
                </div>
            </div>

            <style jsx global>{`
                .party-modal-container {
                    max-width: 480px !important;
                    width: 94vw !important;
                    /* This element (the react-responsive-modal dialog node) must be
                       the scroll surface, like every other mobile modal here:
                       body-scroll-lock registers it, so on touch devices gestures
                       it can't consume itself get preventDefaulted — the library's
                       outer container never receives them. Without a height cap it
                       grows past the viewport and nothing scrolls. */
                    max-height: calc(100% - 2.4rem) !important;
                    overscroll-behavior-y: contain;
                    /* Side margins must be 0: 94vw + the library's 1.2rem side
                       margins exceed 100vw, which wraps the container's invisible
                       centering strut (:after, height 100%) onto its own line —
                       that both kills vertical centering and appends a full
                       viewport-height of empty scrollable void below the card.
                       Horizontal centering comes from the container's text-align. */
                    margin: 1.2rem 0 !important;
                }
            `}</style>
            <style jsx>{`
                /* The game's modal frame: a near-opaque dark panel with the
                   2px accent frame. No bars, no dividers, no hairlines. */
                .party-modal {
                    --pm-bg: #0f170f;
                    background: var(--pm-bg);
                    border-radius: 16px;
                    border: 2px solid var(--primary);
                    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
                    width: 100%;
                    max-width: 480px;
                    text-align: start;
                    color: #fff;
                }

                .party-modal__title {
                    margin: 0;
                    padding: 20px 22px 6px;
                    font-size: 1.3rem;
                    font-weight: 700;
                    color: #fff;
                }

                .party-modal__rows {
                    padding: 6px 22px 10px;
                    display: flex;
                    flex-direction: column;
                }

                .party-modal__row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px 16px;
                    min-height: 56px;
                }

                .party-modal__row--stack {
                    flex-direction: column;
                    align-items: stretch;
                    justify-content: center;
                    padding: 8px 0;
                }

                .party-modal__label {
                    font-size: 0.95rem;
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.9);
                    min-width: 0;
                }

                .party-modal__row :global(.party-lobby__seg) {
                    flex-shrink: 0;
                }

                .party-modal__stepper {
                    display: flex;
                    align-items: center;
                    flex-shrink: 0;
                    background: rgba(255, 255, 255, 0.06);
                    border-radius: 10px;
                    overflow: hidden;
                }

                .party-modal__stepper-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 42px;
                    height: 40px;
                    border: none;
                    background: transparent;
                    color: rgba(255, 255, 255, 0.7);
                    cursor: pointer;
                    transition: background 0.15s ease, color 0.15s ease;
                    font-size: 0.8rem;
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
                    width: 58px;
                    height: 40px;
                    padding: 0;
                    /* multiPlayerModal.css gives every text input a 10px
                       margin; top and bottom made the stepper 60px tall. */
                    margin: 0 10px;
                    border: none;
                    background: transparent;
                    color: #fff;
                    font: inherit;
                    font-size: 1rem;
                    font-weight: 700;
                    font-variant-numeric: tabular-nums;
                    text-align: center;
                    outline: none;
                }

                .party-modal__stepper-input:focus:not(:read-only) {
                    background: rgba(var(--r), var(--g), var(--b), 0.35);
                }

                /* The map row is one button: the label, then the map's name. */
                .party-modal__map {
                    width: 100%;
                    padding: 0;
                    border: none;
                    background: none;
                    color: inherit;
                    font: inherit;
                    text-align: start;
                    cursor: pointer;
                }

                .party-modal__map-name {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 0;
                    font-size: 0.95rem;
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.7);
                    transition: color 0.15s ease;
                }

                .party-modal__map-name span {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .party-modal__map-name :global(svg) {
                    flex-shrink: 0;
                    font-size: 0.75rem;
                }

                .party-modal__map:hover .party-modal__map-name {
                    color: #fff;
                }

                /* Sticks to the bottom of the scrolling dialog on short
                   screens, so the one button is always in reach. */
                .party-modal__footer {
                    position: sticky;
                    bottom: 0;
                    padding: 10px 22px 20px;
                    background: var(--pm-bg);
                    border-radius: 0 0 14px 14px;
                }

                .party-modal__save-btn {
                    width: 100%;
                    padding: 14px 24px;
                    border: none;
                    border-radius: 12px;
                    background: var(--primary);
                    color: #fff;
                    font: inherit;
                    font-size: 1rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: background 0.15s ease;
                }

                .party-modal__save-btn:hover:not(:disabled) {
                    background: var(--primaryDark);
                }

                .party-modal__save-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                /* Phones: the control goes under its label, full width. */
                @media (max-width: 480px) {
                    .party-modal__title {
                        padding: 16px 18px 4px;
                        font-size: 1.15rem;
                    }

                    .party-modal__rows {
                        padding: 4px 18px 8px;
                    }

                    .party-modal__row:not(.party-modal__map) {
                        flex-direction: column;
                        align-items: stretch;
                        justify-content: center;
                        padding: 8px 0;
                    }

                    .party-modal__row :global(.party-lobby__seg) {
                        display: flex;
                    }

                    .party-modal__row :global(.party-lobby__seg-btn) {
                        flex: 1;
                        padding: 10px 6px;
                        font-size: 0.85rem;
                    }

                    .party-modal__stepper {
                        justify-content: space-between;
                    }

                    .party-modal__stepper-input {
                        flex: 1;
                    }

                    .party-modal__footer {
                        padding: 8px 18px 16px;
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
