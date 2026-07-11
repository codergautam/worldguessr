import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { t } from '../../shared/locale';
import CountryFlag from '../CountryFlag';
import { KM_TO_MILES } from '../../shared/units';
import { nameFromCode } from '../../shared/data/countryHelpers';
import { findCountryLocal } from '../../shared/game/findCountry';
import { useSettingsStore } from '../../store/settingsStore';
import { useGameUiScale } from '../../styles/responsive';

// Faithful port of web's components/endBanner.js (classic / daily pin round):
//  • Show Map / Show Street View toggle (top-right)
//  • main line: "It was {Country}!" when the guess landed in a different
//    country (distance demoted to a small line), else the distance, else
//    "You didn't guess"
//  • "You got {p} points" — small, white (NOT colored by score)
//  • bannerPop entrance on the main line
//  • Next Round / View Results — web's .playAgain gradient (#245734 → #2e7042)
interface Props {
  points: number;
  distance?: number | null;
  didGuess?: boolean;
  /** Accepted for caller compatibility; web shows the round only in the timer. */
  round?: number;
  totalRounds?: number;
  xpEarned?: number;
  /** ISO-2 code of the answer location; enables the "It was {Country}!" reveal. */
  answerCountry?: string | null;
  guessLat?: number | null;
  guessLng?: number | null;
  /** Street View / map toggle (web's topGameInfoButton). */
  panoShown?: boolean;
  onTogglePano?: () => void;
  /** Tap-to-advance. Omit for auto-transitioning flows (multiplayer). */
  onNext?: () => void;
  isFinal?: boolean;
  factText?: string;
  compact?: boolean;
  /** Replaces the next-button (multiplayer "Next round starting…"). */
  footerSlot?: React.ReactNode;
  /**
   * Country streak — world-map singleplayer only (web's `countryStreaksEnabled`).
   * `streak` is the current run after this guess; `lostStreak` is the run that
   * just broke. Omitted (undefined) elsewhere so no badge shows. Mirrors web
   * endBanner.js: when one is > 0 the banner shows the 🔥 / "lost streak" line.
   */
  streak?: number;
  lostStreak?: number;
  /**
   * Team/duel round verdict (web endBanner.js team sections). Numbers stay on
   * the HP bars / team scorebar — the banner's job here is interpretation
   * (won/lost + credit), by ruling: NO score digits in the banner.
   */
  verdict?: MpRoundVerdict;
}

export interface MpRoundVerdict {
  /**
   * HP modes (1v1 duel + team2v2): the damage verdict IS the headline.
   * `null` = a 0-damage round (renders the tied line); omit the field
   * entirely for non-HP modes.
   */
  damage?: { dealt: boolean; dmg: number } | null;
  /** Cumulative team parties: verdict line under the classic headline. */
  teamRound?: 'won' | 'lost' | 'tied';
  /**
   * Pre-translated carrier credit ("X's guess counted" / tie). Null when
   * suppressed: you carried (self-credit is noise, by ruling), average
   * scoring (no single guess counted), or no data.
   */
  carrierText?: string | null;
}

/**
 * Compact points for parentheticals: 3412 → "3.4k", 5000 → "5k". Exception:
 * 4950–4999 would also compact to "5k" — a perfect-score claim they didn't
 * earn (real 5000s wear the gold chip) — those render exact. The same guard
 * covers the damage line, where a fake "5k" would claim a full wipe.
 */
function compactPts(n: number): string {
  if (n < 1000) return `${n}`;
  const compact = `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return compact === '5k' && n !== 5000 ? `${n}` : compact;
}

export default function ClassicEndBanner({
  points,
  distance,
  didGuess = true,
  answerCountry,
  guessLat,
  guessLng,
  panoShown,
  onTogglePano,
  onNext,
  isFinal,
  factText,
  compact,
  footerSlot,
  streak,
  lostStreak,
  verdict,
}: Props) {
  // Mirror web's #endBanner: a centered card that HUGS its content (web is
  // `display:flex; flex-direction:column; align-items:center` with no width —
  // it's only as wide as the text/button). The card itself has no fixed width;
  // maxCardWidth only bounds how far long text may wrap before the edges, so on
  // a phone the banner reads as a tidy centered pill instead of a full-width
  // strip. Landscape goes compact (web's
  // `@media (orientation: landscape) and (max-height: 500px)`) so the banner
  // doesn't eat the short viewport.
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  // The cramped "landscape" banner styling targets SHORT viewports (landscape
  // phones, web's `max-height: 500px`). An iPad in landscape is wide AND tall,
  // so it must keep the comfortable portrait styling — gate compaction on phones.
  const compactLandscape = landscape && height <= 500;
  // Tablet scale: the web banner uses em/vw/vh fonts that grow to ~24–29px on an
  // iPad; our fixed px don't, so on tablets we scale the text/padding up (sc())
  // and widen the content cap. Phones are unaffected (sc is 1.0×, cap stays 420).
  const { sc, isTablet } = useGameUiScale();
  const maxCardWidth = Math.min(landscape ? width * 0.6 : width - 48, isTablet ? 600 : 420);
  // The Show Street View / Show Map toggle is an understated corner link on web.
  // Scale it at a DAMPENED rate so it doesn't balloon relative to the body text
  // on tablets (the "giant space-taking button" complaint) — it grows a little,
  // the body grows more, so the toggle reads smaller in proportion than before.
  const scTop = (v: number) => Math.round((v + (sc(v) - v) * 0.45) * 2) / 2;

  // Units-aware "your guess was Nkm/Nmi away" — mirrors web's endBanner.js.
  const units = useSettingsStore((s) => s.units);
  const distanceText =
    didGuess && distance != null
      ? units === 'imperial'
        ? t('guessDistanceMi', { d: (distance * KM_TO_MILES).toFixed(1) })
        : t('guessDistanceKm', { d: Math.round(distance) })
      : null;

  // "It was {Country}!" — only when the guess landed in a different country
  // than the answer. Mirrors web's findCountryLocal useEffect.
  const [wrongCountryName, setWrongCountryName] = useState<string | null>(null);
  useEffect(() => {
    if (!answerCountry || guessLat == null || guessLng == null) {
      setWrongCountryName(null);
      return;
    }
    let cancelled = false;
    findCountryLocal({ lat: guessLat, lon: guessLng })
      .then((guessCountry) => {
        if (cancelled) return;
        setWrongCountryName(
          guessCountry && guessCountry !== 'Unknown' && guessCountry !== answerCountry
            ? nameFromCode(answerCountry)
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setWrongCountryName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [answerCountry, guessLat, guessLng]);

  // ── HP-mode / team-round derivations (web endBanner.js team sections) ────
  const isHpMode = verdict?.damage !== undefined; // 1v1 duel + team2v2
  const isTeamGameRound = !!verdict?.teamRound; // cumulative team party
  // A flat 5000 is the game's rarest personal outcome — it outranks the humble
  // points text and renders as the gold chip in every mode that shows points.
  const isPerfectRound = didGuess && Math.round(points) === 5000;
  // "{distance} (3.4k pts)" — team modes fold the points into the distance
  // line so the banner stays compact; on a perfect the parenthetical drops
  // (the chip carries the moment).
  const personalRoundText = distanceText
    ? isPerfectRound
      ? distanceText
      : `${distanceText} (${t('ptsCount', { points: compactPts(Math.round(points)) })})`
    : t('didntGuess');
  // HP-mode country reveal above the damage verdict (singleplayer parity):
  // naming the RIGHT country silences the line — no pin or a wrong-country
  // pin keeps it. wrongCountryName is only set when the pin landed outside
  // the answer country, so `!didGuess || wrongCountryName` is exactly web's
  // `(!pinPoint || pinInRoundCountry === false)`.
  const hpCountryRevealName =
    isHpMode && answerCountry && (!didGuess || wrongCountryName)
      ? nameFromCode(answerCountry)
      : null;
  const damageHeadlineText = isHpMode
    ? verdict?.damage && verdict.damage.dmg > 0
      ? `${verdict.damage.dealt ? '⚔️' : '💔'} ${t(verdict.damage.dealt ? 'dealtDamage' : 'tookDamage', { dmg: compactPts(verdict.damage.dmg) })}`
      : t('teamRoundTied')
    : null;
  // One chip, rendered by whichever branch owns the perfect moment.
  const perfectChipEl = isPerfectRound ? (
    <View style={styles.perfectChip}>
      <Text style={[styles.perfectChipText, { fontSize: sc(13) }]}>{t('perfectFiveK')}</Text>
    </View>
  ) : null;
  // Non-HP headline: team rounds fold points into the distance line.
  const classicHeadline = (isTeamGameRound ? personalRoundText : distanceText) ?? t('didntGuess');

  // bannerPop on the main line (core Animated → ignores Reduce Motion, like web).
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pop.setValue(0);
    Animated.timing(pop, {
      toValue: 1,
      duration: 400,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
      useNativeDriver: true,
    }).start();
    // damageHeadlineText in the deps: HP-mode reveals swap the headline
    // between rounds without remounting — the new verdict must re-pop.
  }, [wrongCountryName, distanceText, didGuess, damageHeadlineText]);
  const popStyle = {
    opacity: pop,
    transform: [
      { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
      { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
    ],
  };

  return (
    <View
      style={[
        styles.card,
        { maxWidth: maxCardWidth },
        compactLandscape ? styles.cardLandscape : compact && styles.cardCompact,
        // Tablet: scale the card padding up with the larger text so the banner
        // doesn't read as a small pill on a big screen.
        isTablet && !compactLandscape && {
          paddingTop: sc(14),
          paddingHorizontal: sc(20),
          paddingBottom: sc(20),
          borderRadius: sc(10),
        },
      ]}
    >
      <LinearGradient
        colors={['rgba(36,87,52,0.78)', 'rgba(36,87,52,0.6)', 'rgba(36,87,52,0.42)']}
        locations={[0, 0.57, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {onTogglePano && (
        <Pressable onPress={onTogglePano} hitSlop={10} style={styles.topBtn}>
          <Text style={[styles.topBtnText, { fontSize: scTop(14) }]}>
            {panoShown ? t('showMap') : t('showPano')}
          </Text>
        </Pressable>
      )}

      <View style={[styles.content, compactLandscape && styles.contentLandscape, isTablet && { gap: sc(8) }]}>
        {isHpMode ? (
          /* HP modes (1v1 + team2v2): damage direction IS the verdict. The
             emoji is the win/lose signal — no colored verdict text (ruling). */
          <>
            {hpCountryRevealName && (
              <View style={styles.mainRow}>
                <Text style={[styles.smallMainTxt, { fontSize: sc(compactLandscape ? 13 : 15) }]}>
                  {t('incorrectCountryWas', { country: hpCountryRevealName })}
                </Text>
                <CountryFlag countryCode={answerCountry ?? ''} size={sc(compactLandscape ? 12 : 13)} />
              </View>
            )}
            <Animated.Text style={[styles.mainTxt, { fontSize: sc(compactLandscape ? 16 : 20) }, popStyle]}>
              {damageHeadlineText}
            </Animated.Text>
            {perfectChipEl}
            {verdict?.carrierText ? (
              <Text style={[styles.smallMainTxt, { fontSize: sc(compactLandscape ? 13 : 15) }]}>
                {verdict.carrierText}
              </Text>
            ) : null}
            <Text style={[styles.points, { fontSize: sc(compactLandscape ? 12 : 13) }]}>
              {personalRoundText}
            </Text>
          </>
        ) : wrongCountryName ? (
          <>
            <Animated.View style={[styles.mainRow, popStyle]}>
              <Text style={[styles.mainTxt, { fontSize: sc(compactLandscape ? 16 : 20) }]}>
                {t('incorrectCountryWas', { country: wrongCountryName })}
              </Text>
              <CountryFlag countryCode={answerCountry ?? ''} size={sc(compactLandscape ? 13 : 15)} />
            </Animated.View>
            {distanceText ? (
              <Text style={[styles.smallMainTxt, { fontSize: sc(compactLandscape ? 13 : 15) }]}>
                {isTeamGameRound ? personalRoundText : distanceText}
              </Text>
            ) : null}
          </>
        ) : (
          <Animated.Text style={[styles.mainTxt, { fontSize: sc(compactLandscape ? 16 : 20) }, popStyle]}>
            {classicHeadline}
          </Animated.Text>
        )}

        {/* Points line (classic only). Team rounds fold points into the
            distance line above; HP modes render their own personal line. A
            perfect 5000 outranks the humble text and wears the gold chip. */}
        {!isHpMode && !isTeamGameRound && (
          perfectChipEl ?? (
            <Text style={[styles.points, { fontSize: sc(compactLandscape ? 12 : 13) }]}>
              {t('gotPoints', { p: Math.round(points) })}
            </Text>
          )
        )}

        {/* Cumulative team party: verdict + credit only, damage-free (ruling:
            the scoreline is already visible on the team scorebar). */}
        {isTeamGameRound && (
          <>
            {perfectChipEl}
            <Text style={[styles.points, { fontSize: sc(compactLandscape ? 12 : 13) }]}>
              {t(
                verdict!.teamRound === 'won'
                  ? 'teamRoundWon'
                  : verdict!.teamRound === 'lost'
                    ? 'teamRoundLost'
                    : 'teamRoundTied',
              )}
            </Text>
            {verdict?.carrierText ? (
              <Text style={[styles.points, { fontSize: sc(compactLandscape ? 12 : 13) }]}>
                {verdict.carrierText}
              </Text>
            ) : null}
          </>
        )}

        {/* Country streak (world map only). Mirrors web endBanner.js: a 🔥 chip
            while the run is alive, or a muted "lost your N streak" line. */}
        {streak != null && streak > 0 ? (
          <View style={styles.streakBadge}>
            <Text style={[styles.streakText, { fontSize: sc(13) }]}>🔥 {t('onCountryStreak', { streak })}</Text>
          </View>
        ) : lostStreak != null && lostStreak > 0 ? (
          <Text style={[styles.lostStreakText, { fontSize: sc(13) }]}>
            {t('lostCountryStreak', { streak: lostStreak })}
          </Text>
        ) : null}

        {factText ? (
          <Text
            style={[
              styles.fact,
              // Scale lineHeight + maxWidth with the font so multi-line onboarding
              // facts don't clip/overlap on large iPads (lineHeight was fixed at 18).
              { fontSize: sc(compactLandscape ? 12 : 13), lineHeight: sc(compactLandscape ? 16 : 18), maxWidth: sc(400) },
              compactLandscape && styles.factLandscape,
            ]}
          >
            {factText}
          </Text>
        ) : null}
      </View>

      {footerSlot}

      {onNext ? (
        <View style={[styles.btnRow, compactLandscape && styles.btnRowLandscape, isTablet && { marginTop: sc(16) }]}>
          <Pressable onPress={onNext} style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}>
            <LinearGradient
              colors={['#245734', '#2e7042']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.playAgain,
                compactLandscape && styles.playAgainLandscape,
                isTablet && !compactLandscape && {
                  paddingVertical: sc(16),
                  paddingHorizontal: sc(40),
                  minWidth: sc(200),
                  borderRadius: sc(12),
                },
              ]}
            >
              <Text style={[styles.playAgainText, { fontSize: sc(compactLandscape ? 15 : isTablet ? 22 : 18) }]}>
                {/* Web's primary CTA (.playAgain 1.3em) is LARGER than the result
                    line (1.2em). Phone keeps 18 (matches web-mobile); tablets use
                    a 22 base so the CTA stays ≥ mainTxt and lands in web's band. */}
                {isFinal ? t('viewResults') : t('nextRound')}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // #endBanner: green-glass card. Centered + width-capped (see maxCardWidth)
  // so it reads as a card, not a full-width strip — matching web.
  card: {
    alignSelf: 'center',
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    marginBottom: 10,
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardCompact: { paddingTop: 12, paddingBottom: 14 },
  // Landscape (web's `@media (orientation: landscape) and (max-height: 500px)`):
  // tighten padding, radius and bottom margin so the banner stays low-profile.
  cardLandscape: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    marginBottom: 4,
    borderRadius: 8,
  },
  // topGameInfoButton.
  topBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
    marginBottom: 2,
  },
  topBtnText: { color: '#fff', fontFamily: 'Lexend', fontSize: 14 },
  content: { alignItems: 'center', gap: 8 },
  contentLandscape: { gap: 2 },
  // Wrong-country reveal: text + flag img on one centered row (web parity).
  mainRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mainTxt: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 20, textAlign: 'center' },
  mainTxtLandscape: { fontSize: 16 },
  smallMainTxt: { color: '#fff', fontFamily: 'Lexend-Medium', fontSize: 15, textAlign: 'center' },
  smallMainTxtLandscape: { fontSize: 13 },
  // bannerPoints: small, white — not colored by score.
  points: { color: 'rgba(255,255,255,0.92)', fontFamily: 'Lexend', fontSize: 13, textAlign: 'center' },
  pointsLandscape: { fontSize: 12 },
  // .perfect5k — gold chip for a flat 5000 (web endBanner.js perfect5kLine).
  perfectChip: {
    backgroundColor: 'rgba(255,215,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.45)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginTop: 2,
  },
  perfectChipText: { color: '#ffd700', fontFamily: 'Lexend-Bold', fontSize: 13, textAlign: 'center' },
  // .streakBadge — amber 🔥 pill (web endBanner.js), matches CountryEndBanner.
  streakBadge: {
    backgroundColor: 'rgba(251,191,36,0.18)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 3,
    marginTop: 2,
  },
  streakText: { color: '#fbbf24', fontFamily: 'Lexend-Medium', fontSize: 13, textAlign: 'center' },
  lostStreakText: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Lexend',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
  },
  fact: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Lexend',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 400,
  },
  factLandscape: { fontSize: 12, lineHeight: 16 },
  btnRow: { marginTop: 16, alignItems: 'center', width: '100%' },
  btnRowLandscape: { marginTop: 8 },
  // .playAgain
  playAgain: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    minWidth: 200,
  },
  playAgainLandscape: {
    paddingVertical: 9,
    paddingHorizontal: 24,
    minWidth: 150,
  },
  playAgainText: { color: '#fff', fontFamily: 'Lexend-Bold', fontSize: 18 },
  playAgainTextLandscape: { fontSize: 15 },
});
