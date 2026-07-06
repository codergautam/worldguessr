import { useEffect, useRef, useState } from "react";
import calcPoints, { findDistance, pickBestTeamGuessIds } from "./calcPoints";
import { useTranslation } from '@/components/useTranslations'
import triggerConfetti from "./utils/triggerConfetti";
import nameFromCode from "./utils/nameFromCode";
import continentFromCode from "./utils/continentFromCode";
import { continentKey } from "./utils/continentLocale";
import findCountryLocal, { findCountryLocalSync } from "./findCountryLocal";
import { loadBorders } from "./utils/loadBorders";
import getMyTeam from "./utils/getMyTeam";
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

export default function EndBanner({ countryStreaksEnabled, singlePlayerRound, onboarding, countryGuesser, countryGuesserCorrect, guessTier, isContinentMode, isWorldMap, dailyMode, options, lostCountryStreak, session, guessed, latLong, pinPoint, countryStreak, fullReset, km, multiplayerState, usedHint, toggleMap, panoShown, setExplanationModalShown, mapFadingOut }) {
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

    // On the world map, promote the country reveal when the guess landed in the
    // wrong country — that's the interesting signal, distance/points are secondary.
    // Borders data is fetched lazily; on a cold first guess we may render once
    // without the wrongCountry copy and then re-render once the data arrives.
    const wantsWrongCountry = isClassicRound && (isWorldMap || dailyMode) && pinPoint && latLong?.country;
    const [wrongCountryName, setWrongCountryName] = useState(null);
    useEffect(() => {
        if (!wantsWrongCountry) {
            setWrongCountryName(null);
            return;
        }
        // Try sync (cached) first to avoid an extra render.
        const sync = findCountryLocalSync({ lat: pinPoint.lat, lon: pinPoint.lng });
        if (sync !== null) {
            setWrongCountryName(sync && sync !== "Unknown" && sync !== latLong.country ? nameFromCode(latLong.country, lang) : null);
            return;
        }
        let cancelled = false;
        findCountryLocal({ lat: pinPoint.lat, lon: pinPoint.lng })
            .then((guessCountry) => {
                if (cancelled) return;
                setWrongCountryName(guessCountry && guessCountry !== "Unknown" && guessCountry !== latLong.country ? nameFromCode(latLong.country, lang) : null);
            })
            .catch(() => {
                if (!cancelled) setWrongCountryName(null);
            });
        return () => { cancelled = true; };
    }, [wantsWrongCountry, pinPoint?.lat, pinPoint?.lng, latLong?.country, lang]);

    const distanceText = (pinPoint && km >= 0)
        ? text(`guessDistance${options.units === "imperial" ? "Mi" : "Km"}`, { d: options.units === "imperial" ? (km * 0.621371).toFixed(1) : km })
        : null;
    const gd = multiplayerState?.gameData;
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
    const teamCarrierText = teamCarrier
        ? (teamCarrier.tie
            ? text("guessCountedTie")
            : teamCarrier.isMe
                ? text("guessCounted")
                : teamCarrier.name ? text("guessCountedBy", { name: teamCarrier.name }) : null)
        : null;
    // Compact points for the parenthetical: 3412 → "3.4k", 5000 → "5k".
    const compactPts = (n) => n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : `${n}`;
    const personalRoundText = distanceText
        ? `${distanceText} (${text("ptsCount", { points: compactPts(displayPoints) })})`
        : text("didntGuess");
    // Team party rounds fold the points into the distance line (2v2-style
    // parenthetical) so the banner stays compact; other modes keep gotPoints.
    const classicDistanceLine = showTeamGameRoundLine ? personalRoundText : distanceText;
    // 2v2 (teamGame has no HP): |a−b| is exactly what the losing team's
    // health dropped by, same construction as the server's subtraction.
    const teamRoundDamage = (showTeamDuelRoundSummary && winningRoundTeam)
        ? Math.abs(teamRoundScores.a - teamRoundScores.b)
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
    // Country reveal above the damage verdict. Matchmade HP modes always run
    // the world pool so country is present; community-map locations stamp
    // 'unknown' server-side and skip the line.
    const duelRevealCountry = damageHeadline && latLong?.country && latLong.country !== 'unknown'
        ? nameFromCode(latLong.country, lang)
        : null;

    return (
        <div id='endBanner' className={isCountryGuessrRound && guessed ? 'countryGuessrDelayed' : ''} style={{ display: guessed && !mapFadingOut ? '' : 'none' }}>

            <button className="openInMaps topGameInfoButton" onClick={toggleMap}>
                {panoShown ? text("showMap") : text("showPano")}
            </button>

            <div className="bannerContent">
                {/* Main result line */}
                {damageHeadline ? (
                    <>
                        {duelRevealCountry && (
                            <span className='smallmainBannerTxt'>{text("incorrectCountryWas", { country: duelRevealCountry })}</span>
                        )}
                        <span className='mainBannerTxt'>
                            {damageHeadline.dmg > 0
                                ? `${damageHeadline.dealt ? '⚔️' : '💔'} ${text(damageHeadline.dealt ? "dealtDamage" : "tookDamage", { dmg: compactPts(damageHeadline.dmg) })}`
                                : text("teamRoundTied")}
                        </span>
                        {teamCarrierText && (
                            <span className='smallmainBannerTxt'>{teamCarrierText}</span>
                        )}
                        <p className='motivation team-round-personal'>{personalRoundText}</p>
                    </>
                ) : isClassicRound && wrongCountryName ? (
                    <>
                        <span className='mainBannerTxt'>
                            {text("incorrectCountryWas", { country: wrongCountryName })}
                        </span>
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
                                : text("incorrectCountryWas", { country: nameFromCode(latLong?.country, lang) })
                    }</span>
                ) : null}

                {/* Points (classic only; team rounds carry them in the distance line) */}
                {!countryGuesser && !damageHeadline && !showTeamGameRoundLine && (
                    <p className="motivation bannerPoints">
                        {text("gotPoints", { p: displayPoints })}
                    </p>
                )}

                {showTeamGameRoundLine && (
                    <>
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

                {/* Funny quip (singleplayer country/continent guesser only) */}
                {quipRef.current && (
                    <p className="motivation quip">{text(quipRef.current)}</p>
                )}

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
