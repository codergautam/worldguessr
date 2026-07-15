import { useEffect, useRef, useState } from "react";
import calcPoints, { findDistance, pickBestTeamGuessIds } from "./calcPoints";
import { useTranslation } from '@/components/useTranslations'
import triggerConfetti from "./utils/triggerConfetti";
import { playSfx } from "./utils/audio";
import nameFromCode from "./utils/nameFromCode";
import continentFromCode from "./utils/continentFromCode";
import { continentKey } from "./utils/continentLocale";
import findCountryLocal, { findCountryLocalSync } from "./findCountryLocal";
import { loadBorders } from "./utils/loadBorders";
import getMyTeam from "./utils/getMyTeam";
import CountryFlag from "./utils/countryFlag";
const QUIP_KEYS = {
  correct: Array.from({length: 24}, (_, i) => `quipCorrect${i+1}`),
  wrongSameContinent: Array.from({length: 20}, (_, i) => `quipWrongSame${i+1}`),
  wrongDiffContinent: Array.from({length: 24}, (_, i) => `quipWrongDiff${i+1}`),
};

const CORRECT_ENCOURAGEMENTS = [
    "correctEncouragement1",
    "correctEncouragement2",
    "correctEncouragement3",
    "correctEncouragement4",
    "correctEncouragement5",
];

const ONBOARDING_FACTS = [
    "onboardingFact1",
    "onboardingFact2",
    "onboardingFact3",
];
const ONBOARDING_AUTO_ADVANCE_SECONDS = 7;

export default function EndBanner({ countryStreaksEnabled, singlePlayerRound, onboarding, countryGuesser, countryGuesserCorrect, guessedCountryCode, guessTier, isContinentMode, isWorldMap, dailyMode, options, lostCountryStreak, session, guessed, latLong, pinPoint, countryStreak, fullReset, km, multiplayerState, usedHint, toggleMap, panoShown, setExplanationModalShown, mapFadingOut }) {
    const { t: text, lang } = useTranslation("common");
    const confettiTriggered = useRef(false);
    const autoAdvanceTimer = useRef(null);
    const autoAdvanceTimeout = useRef(null);
    const revealStartedAt = useRef(0);
    const fullResetRef = useRef(fullReset);
    const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState(null);
    const shouldAutoAdvanceOnboarding = guessed && onboarding && !onboarding.completed && onboarding.mode !== 'classic';

    if (shouldAutoAdvanceOnboarding && !revealStartedAt.current) {
        revealStartedAt.current = Date.now();
    }

    useEffect(() => {
        fullResetRef.current = fullReset;
    }, [fullReset]);

    function logOnboardingAdvance(event, details = {}) {
        if (process.env.NEXT_PUBLIC_COOLMATH !== "true") return;
        console.log("[onboarding-advance]", {
            event,
            round: onboarding?.round,
            mode: onboarding?.mode,
            elapsedMs: revealStartedAt.current ? Date.now() - revealStartedAt.current : null,
            countdown: autoAdvanceCountdown,
            ...details,
        });
    }

    function clearAutoAdvance() {
        if (autoAdvanceTimer.current) {
            clearInterval(autoAdvanceTimer.current);
            autoAdvanceTimer.current = null;
        }
        if (autoAdvanceTimeout.current) {
            clearTimeout(autoAdvanceTimeout.current);
            autoAdvanceTimeout.current = null;
        }
    }

    const points = (!multiplayerState?.inGame && singlePlayerRound?.lastPoint != null)
        ? singlePlayerRound.lastPoint
        : (latLong && pinPoint ? calcPoints({
            lat: latLong.lat, lon: latLong.long,
            guessLat: pinPoint.lat, guessLon: pinPoint.lng,
            usedHint: false, maxDist: multiplayerState?.gameData?.maxDist ?? 20000
        }) : 0);

    useEffect(() => {
        let timer;
        if (guessed && points >= 4850 && !panoShown && !confettiTriggered.current) {
            confettiTriggered.current = true;
            timer = setTimeout(() => triggerConfetti(), 500);
        }
        if (!guessed) confettiTriggered.current = false;
        return () => clearTimeout(timer);
    }, [guessed, points, panoShown]);

    // Auto-advance for onboarding (consider shorter on last round to keep flow snappy)
    const isOnboardingLastRound = onboarding && onboarding.round === (onboarding.locations?.length || 3);
    useEffect(() => {
        clearAutoAdvance();
        if (shouldAutoAdvanceOnboarding) {
            const duration = isOnboardingLastRound ? ONBOARDING_AUTO_ADVANCE_SECONDS : ONBOARDING_AUTO_ADVANCE_SECONDS;
            const endAt = Date.now() + duration * 1000;
            revealStartedAt.current = Date.now();
            setAutoAdvanceCountdown(duration);
            logOnboardingAdvance("timer-start", { duration });
            const interval = setInterval(() => {
                setAutoAdvanceCountdown(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
            }, 250);
            const timeout = setTimeout(() => {
                clearAutoAdvance();
                setAutoAdvanceCountdown(0);
                logOnboardingAdvance("timer-fired");
                // Same sound a manual Next Round press makes (the delegated
                // click listener can't see a programmatic advance).
                playSfx('click_2');
                // fullReset → gameUI.advanceRound → setMapFadingOut(true),
                // which hides this banner via the mapFadingOut prop.
                fullResetRef.current({ source: "endBannerAutoAdvance" });
            }, duration * 1000);
            autoAdvanceTimer.current = interval;
            autoAdvanceTimeout.current = timeout;
            return clearAutoAdvance;
        } else {
            setAutoAdvanceCountdown(null);
            revealStartedAt.current = 0;
        }
    }, [shouldAutoAdvanceOnboarding, guessed, onboarding?.round, onboarding?.completed, onboarding?.mode, isOnboardingLastRound]);

    const isLastRound = (onboarding && onboarding.round === (onboarding.locations?.length || 3))
        || (singlePlayerRound && singlePlayerRound.round === singlePlayerRound.totalRounds);

    // Stable encouragement (picked once per guess, never repeats consecutively)
    const encouragementRef = useRef(null);
    const lastEncouragementRef = useRef(null);
    if (guessed && countryGuesser && countryGuesserCorrect && !encouragementRef.current) {
        let pick;
        do {
            pick = CORRECT_ENCOURAGEMENTS[Math.floor(Math.random() * CORRECT_ENCOURAGEMENTS.length)];
        } while (pick === lastEncouragementRef.current && CORRECT_ENCOURAGEMENTS.length > 1);
        encouragementRef.current = pick;
        lastEncouragementRef.current = pick;
    }
    if (!guessed) encouragementRef.current = null;
    const encouragement = encouragementRef.current ? text(encouragementRef.current) : null;

    // Funny quip for singleplayer (not onboarding), tiered by how wrong the guess was
    const quipRef = useRef(null);
    const lastQuipRef = useRef(null);
    if (guessed && countryGuesser && !onboarding && singlePlayerRound && guessTier && !quipRef.current) {
        const pool = QUIP_KEYS[guessTier];
        if (pool && pool.length > 0) {
            let pick;
            do {
                pick = pool[Math.floor(Math.random() * pool.length)];
            } while (pick === lastQuipRef.current && pool.length > 1);
            quipRef.current = pick;
            lastQuipRef.current = pick;
        }
    }
    if (!guessed) quipRef.current = null;

    // Timed out with no pick in SP country/continent guesser: no quip (nothing
    // to riff on), but tell the player they didn't guess — parity with classic
    // singleplayer's "You didn't guess" line.
    const forgotToGuess = guessed && countryGuesser && !onboarding && singlePlayerRound && !guessedCountryCode;

    const locationFact = onboarding && guessed && onboarding.round
        ? text(ONBOARDING_FACTS[onboarding.round - 1] || "")
        : null;

    const isCountryGuessrRound = countryGuesser && !pinPoint;
    const isClassicRound = !countryGuesser;
    const showStreaks = (countryStreaksEnabled || countryGuesser) && (countryStreak > 0 || lostCountryStreak > 0);

    // Points to display
    const displayPoints = countryGuesser
        ? (singlePlayerRound?.lastPoint ?? (countryGuesserCorrect ? 1000 : 0))
        : (singlePlayerRound?.lastPoint ?? points);

    // Resolve which country MY pin landed in. Two consumers, opposite jobs:
    //   - classic SP/daily world map: a wrong-country pin PROMOTES the reveal
    //     to the headline — that's the interesting signal there;
    //   - HP modes (1v1 + 2v2 duels): a right-country pin SUPPRESSES the
    //     "It was X" line above the damage verdict (singleplayer parity).
    // Borders data is fetched lazily; on a cold first guess we may render once
    // with the match unresolved and settle when the data arrives.
    const gd = multiplayerState?.gameData;
    const wantsPinCountry = ((isClassicRound && (isWorldMap || dailyMode)) || (multiplayerState?.inGame && gd?.duel))
        && pinPoint && latLong?.country && latLong.country !== 'unknown';
    // true/false once resolved; null = no pin / still resolving / lookup failed.
    const [pinInRoundCountry, setPinInRoundCountry] = useState(null);
    useEffect(() => {
        if (!wantsPinCountry) {
            setPinInRoundCountry(null);
            return;
        }
        const resolve = (guessCountry) => setPinInRoundCountry(
            guessCountry && guessCountry !== "Unknown" ? guessCountry === latLong.country : null
        );
        // Try sync (cached) first to avoid an extra render.
        const sync = findCountryLocalSync({ lat: pinPoint.lat, lon: pinPoint.lng });
        if (sync !== null) {
            resolve(sync);
            return;
        }
        let cancelled = false;
        findCountryLocal({ lat: pinPoint.lat, lon: pinPoint.lng })
            .then((guessCountry) => {
                if (!cancelled) resolve(guessCountry);
            })
            .catch(() => {
                if (!cancelled) setPinInRoundCountry(null);
            });
        return () => { cancelled = true; };
    }, [wantsPinCountry, pinPoint?.lat, pinPoint?.lng, latLong?.country]);
    // Classic wrong-country headline: only once the pin is CONFIRMED outside
    // the round's country (same visibility as before the tri-state refactor).
    const wrongCountryName = isClassicRound && (isWorldMap || dailyMode) && pinInRoundCountry === false && latLong?.country
        ? nameFromCode(latLong.country, lang)
        : null;

    const distanceText = (pinPoint && km >= 0)
        ? text(`guessDistance${options.units === "imperial" ? "Mi" : "Km"}`, { d: options.units === "imperial" ? (km * 0.621371).toFixed(1) : km })
        : null;
    const players = gd?.players || [];
    const myTeam = (gd?.team2v2 || gd?.teamGame) ? getMyTeam(players, gd?.myId) : null;
    const teamRoundScores = gd?.teamRoundScores?.scores;
    // Verdict only \u2014 the numbers themselves already live on the HP bars /
    // team scorebar; the banner's job is interpretation (won/lost + credit).
    const hasTeamRoundScores = !!(
        myTeam &&
        typeof teamRoundScores?.a === 'number' &&
        typeof teamRoundScores?.b === 'number'
    );
    const winningRoundTeam = hasTeamRoundScores && teamRoundScores.a !== teamRoundScores.b
        ? (teamRoundScores.a > teamRoundScores.b ? 'a' : 'b')
        : null;
    const showTeamDuelRoundSummary = !!(gd?.team2v2 && hasTeamRoundScores);
    const showTeamGameRoundLine = !!(gd?.teamGame && !gd?.team2v2 && hasTeamRoundScores);
    const teamRoundResultKey = (showTeamDuelRoundSummary || showTeamGameRoundLine)
        ? (winningRoundTeam == null
            ? "teamRoundTied"
            : winningRoundTeam === myTeam
                ? "teamRoundWon"
                : "teamRoundLost")
        : null;

    // Whose guess counted for my team \u2014 same calcPoints + distance tie-break
    // as the reveal map's enlarged pin (pickBestTeamGuessIds), so the name
    // here always matches the big pin. Frozen per reveal: the next round's
    // broadcast wipes players[].guess while the banner is still fading out.
    const carrierRef = useRef({ key: null, carrier: null });
    const teamRevealKey = guessed && (showTeamDuelRoundSummary || showTeamGameRoundLine)
        ? `${gd?.code ?? ''}:${gd?.teamRoundScores?.round ?? ''}`
        : null;
    if (teamRevealKey && carrierRef.current.key !== teamRevealKey) {
        let carrier = null;
        // Under 'average' scoring no single guess counted (same rule as the map).
        const averageScoring = showTeamGameRoundLine && gd?.teamScoring === 'average';
        if (!averageScoring && latLong) {
            const maxDist = gd?.maxDist ?? 20000;
            const entries = [];
            const consider = (id, lat, lng) => {
                if (lat == null || lng == null) return;
                entries.push({
                    id, team: myTeam,
                    pts: calcPoints({ lat: latLong.lat, lon: latLong.long, guessLat: lat, guessLon: lng, usedHint: false, maxDist }),
                    dist: findDistance(latLong.lat, latLong.long, lat, lng),
                });
            };
            players.forEach(p => {
                if (p.id === gd?.myId || p.team !== myTeam) return;
                if (p.guess) consider(p.id, p.guess[0], p.guess[1]);
            });
            if (pinPoint) consider(gd?.myId, pinPoint.lat, pinPoint.lng);
            const bestId = [...pickBestTeamGuessIds(entries)][0];
            if (bestId != null) {
                // Exact point ties (both teammates capping 5000 is common)
                // mean either guess IS the team score — credit both instead
                // of naming whoever was centimeters closer.
                const bestPts = entries.find(e => e.id === bestId)?.pts;
                const tied = entries.filter(e => e.pts === bestPts).length > 1;
                carrier = tied
                    ? { tie: true }
                    : bestId === gd?.myId
                        ? { isMe: true, name: null }
                        : { isMe: false, name: players.find(p => p.id === bestId)?.username || null };
            }
        }
        carrierRef.current = { key: teamRevealKey, carrier };
    }
    const teamCarrier = teamRevealKey ? carrierRef.current.carrier : null;
    // "Your guess counted" is self-evident noise (user ruling) — the credit
    // line only earns its space when the TEAMMATE carried, or on an exact tie
    // (which still tells you your mate matched your guess).
    const teamCarrierText = teamCarrier
        ? (teamCarrier.tie
            ? text("guessCountedTie")
            : teamCarrier.isMe
                ? null
                : teamCarrier.name ? text("guessCountedBy", { name: teamCarrier.name }) : null)
        : null;
    // Compact points for the parenthetical: 3412 → "3.4k", 5000 → "5k".
    // Exception: 4950-4999 also compact to "5k", a perfect-score claim they
    // didn't earn (real 5000s wear the gold chip) — those render exact. Same
    // guard covers the damage line, where a fake "5k" would claim a full wipe.
    const compactPts = (n) => {
        if (n < 1000) return `${n}`;
        const compact = `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
        return (compact === '5k' && n !== 5000) ? `${n}` : compact;
    };
    // A flat 5000 is the game's rarest personal outcome — it outranks the
    // humble points text and renders as the gold chip instead, in every mode
    // that shows personal points (classic gotPoints line, HP/team parenthetical).
    const isPerfectRound = guessed && displayPoints === 5000;
    const perfectChip = <span className="perfect5k">{text("perfectFiveK")}</span>;
    // On a perfect the chip gets its own full-brightness line (the personal
    // line is dimmed 0.8 — burying the star moment there undersold it), and
    // the distance drops its "(5k pts)" parenthetical echo.
    const personalRoundText = distanceText
        ? (isPerfectRound
            ? distanceText
            : `${distanceText} (${text("ptsCount", { points: compactPts(displayPoints) })})`)
        : text("didntGuess");
    // Team party rounds fold the points into the distance line (2v2-style
    // parenthetical) so the banner stays compact; other modes keep gotPoints.
    const classicDistanceLine = showTeamGameRoundLine ? personalRoundText : distanceText;
    // 2v2: the server stamps the HP actually applied (multiplier included) on
    // teamRoundScores.damage — never re-derive |a−b| here or the banner
    // drifts from the bars. The |a−b| fallback only covers a stale ws that
    // predates the stamp.
    const teamRoundDamage = (showTeamDuelRoundSummary && winningRoundTeam)
        ? (gd?.teamRoundScores?.damage ?? Math.abs(teamRoundScores.a - teamRoundScores.b))
        : 0;
    // 1v1 duels get the same damage-verdict banner. No server stamp there —
    // rebuild both round scores exactly like the server's HP subtraction
    // (calcPoints per guess, absolute diff), frozen per reveal since the next
    // round's broadcast wipes the opponent's guess mid-fade.
    const is1v1Duel = !!(multiplayerState?.inGame && gd?.duel && !gd?.team2v2);
    const duelDamageRef = useRef({ key: null, result: null });
    const duelRevealKey = guessed && is1v1Duel ? `${gd?.code ?? ''}:${gd?.curRound ?? ''}` : null;
    if (duelRevealKey && duelDamageRef.current.key !== duelRevealKey) {
        let result = null;
        if (latLong) {
            const oppGuess = players.find(p => p.id !== gd?.myId)?.guess;
            const oppPts = oppGuess ? calcPoints({
                lat: latLong.lat, lon: latLong.long,
                guessLat: oppGuess[0], guessLon: oppGuess[1],
                usedHint: false, maxDist: gd?.maxDist ?? 20000
            }) : 0;
            result = { dmg: Math.abs(points - oppPts), dealt: points > oppPts };
        }
        duelDamageRef.current = { key: duelRevealKey, result };
    }
    const duelRoundDamage = duelRevealKey ? duelDamageRef.current.result : null;

    // Damage direction IS the verdict for HP modes (2v2 + 1v1); a 0-damage
    // round renders the tied line instead.
    const damageHeadline = showTeamDuelRoundSummary
        ? { dealt: winningRoundTeam === myTeam, dmg: teamRoundDamage }
        : duelRoundDamage;
    // Country reveal above the damage verdict. Matchmade HP modes run world
    // pools so country is present; community-map locations stamp 'unknown'
    // server-side and skip the line. Singleplayer parity: naming the right
    // country silences the reveal — no pin or a wrong-country pin keeps it.
    const duelRevealCountry = damageHeadline && latLong?.country && latLong.country !== 'unknown'
        && (!pinPoint || pinInRoundCountry === false)
        ? nameFromCode(latLong.country, lang)
        : null;
    // Shared "It was {country}" + flag img reveal — HP-mode line, classic
    // wrong-country headline, and country guesser all render the same thing.
    const countryReveal = (name) => (
        <>
            {text("incorrectCountryWas", { country: name })}
            <CountryFlag countryCode={latLong?.country} size={0.9} marginRight="0" style={{ marginLeft: '0.4em' }} />
        </>
    );

    // singlePlayerRound.done: the game-ending advance keeps the answer scene
    // (and its `guessed` state) mounted beneath the results summary, but this
    // banner lives in .endCards (z-index 1001, above the summary's 1000) — it
    // must yield on the click that ended the game or its buttons float over
    // the results.
    return (
        <div id='endBanner' className={isCountryGuessrRound && guessed ? 'countryGuessrDelayed' : ''} style={{ display: guessed && !mapFadingOut && !singlePlayerRound?.done ? '' : 'none' }}>

            <button className="openInMaps topGameInfoButton" onClick={toggleMap}>
                {panoShown ? text("showMap") : text("showPano")}
            </button>

            <div className="bannerContent">
                {/* Main result line */}
                {damageHeadline ? (
                    <>
                        {duelRevealCountry && (
                            <span className='smallmainBannerTxt'>{countryReveal(duelRevealCountry)}</span>
                        )}
                        <span className='mainBannerTxt'>
                            {damageHeadline.dmg > 0
                                ? `${damageHeadline.dealt ? '⚔️' : '💔'} ${text(damageHeadline.dealt ? "dealtDamage" : "tookDamage", { dmg: compactPts(damageHeadline.dmg) })}`
                                : text("teamRoundTied")}
                        </span>
                        {isPerfectRound && (
                            <p className='motivation perfect5kLine'>{perfectChip}</p>
                        )}
                        {teamCarrierText && (
                            <span className='smallmainBannerTxt'>{teamCarrierText}</span>
                        )}
                        <p className='motivation team-round-personal'>{personalRoundText}</p>
                    </>
                ) : isClassicRound && wrongCountryName ? (
                    <>
                        <span className='mainBannerTxt'>{countryReveal(wrongCountryName)}</span>
                        {distanceText && (
                            <span className='smallmainBannerTxt'>{classicDistanceLine}</span>
                        )}
                    </>
                ) : isClassicRound && pinPoint && (km >= 0) ? (
                    <span className='mainBannerTxt'>{classicDistanceLine}</span>
                ) : isClassicRound && !pinPoint ? (
                    <span className='mainBannerTxt'>{text("didntGuess")}</span>
                ) : countryGuesser ? (
                    <span className='mainBannerTxt'>{
                        countryGuesserCorrect
                            ? text("correctCountryNice")
                            : isContinentMode
                                ? text("incorrectContinentWas", { continent: text(continentKey(continentFromCode(latLong?.country))) })
                                : countryReveal(nameFromCode(latLong?.country, lang))
                    }</span>
                ) : null}

                {/* Points (classic only; team rounds carry them in the distance line) */}
                {!countryGuesser && !damageHeadline && !showTeamGameRoundLine && (
                    <p className={`motivation bannerPoints${isPerfectRound ? ' perfect5kLine' : ''}`}>
                        {isPerfectRound ? perfectChip : text("gotPoints", { p: displayPoints })}
                    </p>
                )}

                {showTeamGameRoundLine && (
                    <>
                        {isPerfectRound && (
                            <p className="motivation perfect5kLine">{perfectChip}</p>
                        )}
                        <p className="motivation team-round-line">{text(teamRoundResultKey)}</p>
                        {teamCarrierText && (
                            <p className="motivation team-round-line">{teamCarrierText}</p>
                        )}
                    </>
                )}

                {/* Streak badge */}
                {showStreaks && (
                    <p className="motivation">
                        {countryStreak > 0 && (
                            <span className="streakBadge">🔥 {isContinentMode ? text("onContinentStreak", { streak: countryStreak }) : text("onCountryStreak", { streak: countryStreak })}</span>
                        )}
                        {lostCountryStreak > 0 && (isContinentMode ? text("lostContinentStreak", { streak: lostCountryStreak }) : text("lostCountryStreak", { streak: lostCountryStreak }))}
                    </p>
                )}

                {/* Funny quip (SP country/continent guesser), or a plain "you
                    didn't guess" note when the round timed out with no pick. */}
                {quipRef.current ? (
                    <p className="motivation quip">{text(quipRef.current)}</p>
                ) : forgotToGuess ? (
                    <p className="motivation quip">{text("didntGuess")}</p>
                ) : null}

                {/* Location fact (onboarding only) */}
                {locationFact && (
                    <p className="motivation locationFact">{locationFact}</p>
                )}
            </div>

            {!multiplayerState && (
                <div className="endButtonContainer">
                    {onboarding && !onboarding.completed ? (
                        <button className={`playAgain${isLastRound ? ' lastRoundPulse' : ''}`} onClick={(event) => {
                            clearAutoAdvance();
                            logOnboardingAdvance("manual-click", {
                                pointerType: event?.nativeEvent?.pointerType,
                                detail: event?.detail,
                                isTrusted: event?.nativeEvent?.isTrusted,
                                clientX: event?.nativeEvent?.clientX,
                                clientY: event?.nativeEvent?.clientY,
                            });
                            fullReset({ source: "endBannerClick" });
                        }}>
                            {`${isLastRound ? text("viewResults") : text("nextRound")}${autoAdvanceCountdown != null ? ` (${autoAdvanceCountdown})` : ''}`}
                        </button>
                    ) : (
                        <button className="playAgain" onClick={() => { fullReset(); }}>
                            {isLastRound ? text("viewResults") : text("nextRound")}
                        </button>
                    )}

                    {session?.token?.canMakeClues && (
                        <button className="openInMaps" onClick={() => {
                            if (!panoShown) toggleMap();
                            setExplanationModalShown(true);
                        }}>
                            {text("writeExplanation")}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
