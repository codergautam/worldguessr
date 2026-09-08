/** Round-1 matchup: the web's name pills, cyan VS badge, and numeric countdown. */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Reanimated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeInLeft,
  FadeInRight,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import SiteBackground from '../SiteBackground';
import { MATCHMAKING_VEIL_COLORS } from '../../styles/matchmakingBackdrop';
import { colors, resolveLeague, t } from '../../shared';
import { haptics } from '../../services/haptics';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import { MPPlayer } from '../../store/multiplayerStore';
import getMyTeam from '../../shared/game/getMyTeam';
import { GLOW_CLIP_RELIEF } from '../../shared/glowKeyframes';
import WgWordmark from '../ui/WgWordmark';
import PlayerName from '../PlayerName';
import { Pressable } from '../ui/SfxPressable';

interface GetReadyOverlayProps {
  players?: MPPlayer[];
  myId?: string;
  team2v2?: boolean;
  round: number;
  totalRounds: number;
  /** Server timestamp when getready phase ends. */
  nextEvtTime: number;
  timeOffset: number;
  generated: number;
  isPlacement?: boolean;
  onRetry?: () => void;
}

export default function GetReadyOverlay({
  players,
  myId,
  team2v2,
  nextEvtTime,
  timeOffset,
  isPlacement,
  onRetry,
}: GetReadyOverlayProps) {
  const [seconds, setSeconds] = useState(() => Math.max(0, (nextEvtTime - Date.now() - timeOffset) / 1000));
  const { width, height } = useWindowDimensions();
  const stacked = width <= 830 && height >= width;
  const me = players?.find((p) => p.id === myId);
  const opponent = players?.find((p) => p.id !== myId);
  // Unresolved teams must not be silently assigned to a side.
  const myTeam = team2v2 ? getMyTeam(players, myId) : null;
  const mySidePlayers = team2v2
    ? (myTeam ? (players ?? []).filter((p) => p.team === myTeam)
      .sort((a, b) => Number(b.id === myId) - Number(a.id === myId)) : [])
    : (me ? [me] : []);
  const enemySidePlayers = team2v2
    ? (myTeam ? (players ?? []).filter((p) => (p.team === 'a' || p.team === 'b') && p.team !== myTeam) : [])
    : (opponent ? [opponent] : []);
  const showMatchup = mySidePlayers.length > 0 && enemySidePlayers.length > 0;

  useEffect(() => {
    const update = () => {
      setSeconds(Math.max(0, (nextEvtTime - Date.now() - timeOffset) / 1000));
    };
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [nextEvtTime, timeOffset]);

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
    <View style={styles.overlay}>
      {/* The parent hides Street View while it preloads. Until this image
          paints, the shared root backdrop remains visible underneath. */}
      <SiteBackground style={StyleSheet.absoluteFillObject} />
      <LinearGradient colors={MATCHMAKING_VEIL_COLORS} style={StyleSheet.absoluteFillObject} />
      <SafeAreaView style={styles.brandBar} edges={['top']} pointerEvents="none">
        <WgWordmark size="sm" />
      </SafeAreaView>

      <View style={styles.body}>
        {showMatchup && (
          <View style={[styles.matchup, stacked && styles.matchupStacked]}>
            <PlayerColumn players={mySidePlayers} myId={myId} side="left" stacked={stacked} />
            <Reanimated.View entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}>
              <VsBadge />
            </Reanimated.View>
            <PlayerColumn players={enemySidePlayers} myId={myId} side="right" stacked={stacked} />
          </View>
        )}
        {isPlacement && <Text style={styles.placementTag}>{t('placementMatch')}</Text>}
        <Countdown seconds={seconds} />
        {onRetry && (
          <Pressable onPress={onRetry} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('retry')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function VsBadge() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, {
      duration: 2000,
      easing: Easing.inOut(Easing.quad),
      reduceMotion: ReduceMotion.System,
    }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));
  return (
    <Reanimated.View style={[styles.vsBadge, pulseStyle]}>
      <LinearGradient
        colors={['rgba(0,255,255,0.1)', 'rgba(255,255,255,0.05)']}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={styles.vsFill}
      >
        <Text style={styles.vsText}>VS</Text>
      </LinearGradient>
    </Reanimated.View>
  );
}

function PlayerColumn({ players, myId, side, stacked }: {
  players: MPPlayer[];
  myId?: string;
  side: 'left' | 'right';
  stacked: boolean;
}) {
  const Entering = stacked
    ? (side === 'left' ? FadeInDown : FadeInUp)
    : (side === 'left' ? FadeInLeft : FadeInRight);
  return (
    <Reanimated.View
      style={[styles.player, !stacked && styles.playerWide]}
      entering={Entering.duration(600).delay(side === 'left' ? 200 : 400).reduceMotion(ReduceMotion.System)}
    >
      {players.map((p) => {
        const league = typeof p.elo === 'number' ? resolveLeague(p.elo, p.league) : null;
        return (
          <LinearGradient
            key={p.id}
            colors={['rgba(0,0,0,0.7)', 'rgba(20,20,20,0.8)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.namePill}
          >
            <PlayerName
              name={p.id === myId ? t('you') : p.username}
              countryCode={p.countryCode}
              flagSize={15}
              textStyle={styles.name}
              style={styles.nameRow}
              glow={p.nameGlow}
            >
              {typeof p.elo === 'number' && (
                <Text style={[styles.eloText, { color: league?.light ?? league?.color ?? '#60a5fa' }]}>
                  ({p.elo})
                </Text>
              )}
            </PlayerName>
          </LinearGradient>
        );
      })}
    </Reanimated.View>
  );
}

function Countdown({ seconds }: { seconds: number }) {
  return (
    <Reanimated.View style={styles.countdown} entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}>
      <Text style={styles.countdownText}>{Math.ceil(seconds)}</Text>
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
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: GLOW_CLIP_RELIEF,
  },
  matchup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    width: '100%',
    maxWidth: 920,
  },
  matchupStacked: {
    flexDirection: 'column',
    gap: 12,
  },
  player: {
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '100%',
  },
  playerWide: {
    flex: 1,
    maxWidth: 320,
  },
  namePill: {
    maxWidth: '100%',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  nameRow: {
    maxWidth: '100%',
  },
  name: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: 15,
    flexShrink: 1,
  },
  eloText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  vsBadge: {
    marginVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(0,255,255,0.3)',
    shadowColor: '#00ffff',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  vsFill: {
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  vsText: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: 28,
    letterSpacing: 6,
    textAlign: 'center',
    textShadowColor: '#00ffff',
    textShadowRadius: 20,
    textShadowOffset: { width: 0, height: 0 },
  },
  placementTag: {
    color: colors.white,
    fontFamily: 'Lexend-Medium',
    fontSize: fontSizes.sm,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  countdown: {
    marginTop: 10,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    minWidth: 44,
    alignItems: 'center',
  },
  countdownText: {
    color: colors.white,
    fontFamily: 'Lexend-Medium',
    fontSize: 20,
    fontVariant: ['tabular-nums'],
  },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  retryText: {
    color: colors.white,
    fontFamily: 'Lexend-Medium',
  },
});
