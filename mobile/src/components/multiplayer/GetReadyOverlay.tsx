/**
 * Fullscreen overlay shown during the "getready" phase before duel round 1 —
 * the opponent introduction (web parity: the two players slide to center with a
 * "VS" in gameUI.js while `isStartingDuel`).
 *
 * WorldGuessr has no user avatars, so each player is identified by their country
 * flag + name + league/ELO. The round countdown is intentionally understated — a
 * thin draining bar, not a hero ring — so the matchup is the focus.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  FadeIn,
  FadeInLeft,
  FadeInRight,
  ZoomIn,
  ReduceMotion,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, getLeague, t } from '../../shared';
import { haptics } from '../../services/haptics';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import { MPPlayer } from '../../store/multiplayerStore';
import WgWordmark from '../ui/WgWordmark';
import PlayerName from '../PlayerName';

interface GetReadyOverlayProps {
  /** Both duel players — drives the opponent-introduction matchup. */
  players?: MPPlayer[];
  /** My player id (so the matchup knows which side is "You"). */
  myId?: string;
  round: number;
  totalRounds: number;
  /** Server timestamp when getready phase ends */
  nextEvtTime: number;
  /** Client-server time offset */
  timeOffset: number;
  /** Number of locations generated so far */
  generated: number;
}

const COUNTDOWN_WINDOW = 5;

export default function GetReadyOverlay({
  players,
  myId,
  round,
  totalRounds,
  nextEvtTime,
  timeOffset,
  generated,
}: GetReadyOverlayProps) {
  const [seconds, setSeconds] = useState(COUNTDOWN_WINDOW);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const me = players?.find((p) => p.id === myId);
  const opponent = players?.find((p) => p.id !== myId);
  const showMatchup = !!(me && opponent);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Countdown from server time (fractional — drives the draining bar)
  useEffect(() => {
    const update = () => {
      const remaining = Math.max(0, (nextEvtTime - Date.now() - timeOffset) / 1000);
      setSeconds(remaining);
    };
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [nextEvtTime, timeOffset]);

  // Countdown haptics: a light tick on each of the final 3 integer seconds, then
  // a punchier medium "GO" the instant the timer hits zero (round start). The ref
  // de-dupes the ~100ms updates so each beat fires exactly once; it resets on
  // remount, so every round's getready ramps fresh.
  const lastTickRef = useRef<number | null>(null);
  useEffect(() => {
    if (seconds > 0) {
      const whole = Math.ceil(seconds);
      if (whole <= 3 && lastTickRef.current !== whole) {
        lastTickRef.current = whole;
        haptics.light();
      }
    } else if (lastTickRef.current !== 0) {
      lastTickRef.current = 0;
      haptics.medium();
    }
  }, [seconds]);

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={['rgba(6, 16, 10, 0.92)', 'rgba(3, 8, 5, 0.96)']}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.brandBar} edges={['top']} pointerEvents="none">
        <WgWordmark size="sm" />
      </SafeAreaView>

      <View style={styles.body}>
        {showMatchup && (
          <View style={styles.matchup}>
            <PlayerColumn player={me} label={t('you', undefined, 'You')} side="left" />
            <Reanimated.View
              entering={ZoomIn.delay(200).duration(380).reduceMotion(ReduceMotion.Never)}
            >
              <Text style={styles.vsText}>VS</Text>
            </Reanimated.View>
            <PlayerColumn player={opponent} side="right" />
          </View>
        )}

        <Countdown
          seconds={seconds}
          round={round}
          totalRounds={totalRounds}
          generated={generated}
        />
      </View>
    </Animated.View>
  );
}

function PlayerColumn({
  player,
  label,
  side,
}: {
  player: MPPlayer;
  /** Override the displayed name (e.g. "You" for the local player). */
  label?: string;
  side: 'left' | 'right';
}) {
  const league = player.elo !== undefined ? getLeague(player.elo) : null;
  const accent = league?.light ?? league?.color ?? '#cbd5e1';
  const name = label ?? player.username;
  const Entering = side === 'left' ? FadeInLeft : FadeInRight;

  return (
    <Reanimated.View
      style={styles.player}
      entering={Entering.duration(460).reduceMotion(ReduceMotion.Never)}
    >
      <PlayerName
        name={name}
        countryCode={player.countryCode}
        flagSize={15}
        flagStyle={styles.flag}
        textStyle={styles.name}
        style={styles.nameRow}
      />

      {player.elo !== undefined && (
        <View style={styles.eloRow}>
          <Text style={[styles.eloText, { color: accent }]}>({player.elo})</Text>
        </View>
      )}
    </Reanimated.View>
  );
}

function Countdown({
  seconds,
  round,
  totalRounds,
  generated,
}: {
  seconds: number;
  round: number;
  totalRounds: number;
  generated: number;
}) {
  // Grow the window to the largest value seen so the bar starts full even if we
  // mount a beat into the countdown, then drains only.
  const windowRef = useRef(COUNTDOWN_WINDOW);
  windowRef.current = Math.max(windowRef.current, seconds);
  const progress = windowRef.current > 0
    ? Math.max(0, Math.min(1, seconds / windowRef.current))
    : 0;

  // The seconds prop steps every ~100ms; glide the bar between steps so it reads
  // as a continuous drain rather than a stutter. Hold full until the first real
  // (>0) value, then snap to the true fill and only ever drain.
  const barAnim = useRef(new Animated.Value(1)).current;
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!syncedRef.current) {
      if (seconds > 0) {
        syncedRef.current = true;
        barAnim.setValue(progress);
      }
      return;
    }
    const anim = Animated.timing(barAnim, {
      toValue: progress,
      duration: 130,
      easing: Easing.linear,
      useNativeDriver: false, // width % isn't a native-driver prop
    });
    anim.start();
    return () => anim.stop();
  }, [progress, seconds, barAnim]);

  const barWidth = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Reanimated.View
      style={styles.countdown}
      entering={FadeIn.delay(320).duration(420).reduceMotion(ReduceMotion.Never)}
    >
      <Text style={styles.getReady}>{t('getReady', undefined, 'Get Ready!')}</Text>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: barWidth }]} />
      </View>

      <Text style={styles.roundText}>
        {t('round', { r: round, mr: totalRounds }, 'Round #{{r}} / {{mr}}')}
        {generated < totalRounds
          ? `  ·  ${t(
              'loadingLocationsProgress',
              { generated, total: totalRounds },
              'Loading locations... {{generated}}/{{total}}',
            )}`
          : ''}
      </Text>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  brandBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingLeft: spacing.xl,
    paddingTop: spacing.sm,
  },
  body: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  // ── Opponent-introduction matchup ───────────────────────────────
  matchup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 420,
    marginBottom: spacing['3xl'],
  },
  player: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  flag: {
    borderRadius: 3,
  },
  name: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.md,
    flexShrink: 1,
  },
  eloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  eloText: {
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes.md,
    fontVariant: ['tabular-nums'],
  },
  vsText: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes.lg,
    letterSpacing: 1.5,
    marginHorizontal: spacing.sm,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  // ── Understated round countdown ─────────────────────────────────
  countdown: {
    alignItems: 'center',
  },
  getReady: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes.lg,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  track: {
    width: 200,
    height: 4,
    borderRadius: 2,
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.success,
  },
  roundText: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
