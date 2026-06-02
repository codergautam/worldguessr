import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { t } from '../../shared/locale';
import { KM_TO_MILES } from '../../shared/units';
import { nameFromCode } from '../../shared/data/countryHelpers';
import { findCountryLocal } from '../../shared/game/findCountry';
import { useSettingsStore } from '../../store/settingsStore';

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
}: Props) {
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
  }, [wrongCountryName, distanceText, didGuess]);
  const popStyle = {
    opacity: pop,
    transform: [
      { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
      { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
    ],
  };

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
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
          <Text style={styles.topBtnText}>{panoShown ? t('showMap') : t('showPano')}</Text>
        </Pressable>
      )}

      <View style={styles.content}>
        {wrongCountryName ? (
          <>
            <Animated.Text style={[styles.mainTxt, popStyle]}>
              {t('incorrectCountryWas', { country: wrongCountryName })}
            </Animated.Text>
            {distanceText ? <Text style={styles.smallMainTxt}>{distanceText}</Text> : null}
          </>
        ) : (
          <Animated.Text style={[styles.mainTxt, popStyle]}>
            {distanceText ?? t('didntGuess')}
          </Animated.Text>
        )}

        <Text style={styles.points}>{t('gotPoints', { p: Math.round(points) })}</Text>

        {factText ? <Text style={styles.fact}>{factText}</Text> : null}
      </View>

      {footerSlot}

      {onNext ? (
        <View style={styles.btnRow}>
          <Pressable onPress={onNext} style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}>
            <LinearGradient
              colors={['#245734', '#2e7042']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.playAgain}
            >
              <Text style={styles.playAgainText}>{isFinal ? t('viewResults') : t('nextRound')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // #endBanner: green-glass card.
  card: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    marginHorizontal: 16,
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
  mainTxt: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 20, textAlign: 'center' },
  smallMainTxt: { color: '#fff', fontFamily: 'Lexend-Medium', fontSize: 15, textAlign: 'center' },
  // bannerPoints: small, white — not colored by score.
  points: { color: 'rgba(255,255,255,0.92)', fontFamily: 'Lexend', fontSize: 13, textAlign: 'center' },
  fact: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Lexend',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 400,
  },
  btnRow: { marginTop: 16, alignItems: 'center', width: '100%' },
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
  playAgainText: { color: '#fff', fontFamily: 'Lexend-Bold', fontSize: 18 },
});
