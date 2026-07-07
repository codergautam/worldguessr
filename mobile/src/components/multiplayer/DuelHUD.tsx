/**
 * Duel mode HUD — two gradient, animated health bars (one per player).
 *
 * Visual parity with the web duel health bar (components/duelHealthbar.js +
 * styles/globals.scss): a glossy gradient fill that cross-fades green→yellow→red
 * as HP drops, a top shine highlight, a soft glow pulse, a centered animated HP
 * number, and a floating damage indicator.
 *
 * Motion policy: the *functional* transitions (fill width, HP number, entrance)
 * always play — even under OS "Reduce Motion" — so nothing ever snaps jarringly.
 * That is handled by the `../daily/anims` wrappers (which force ReduceMotion.Never
 * on timing) and by `.reduceMotion(ReduceMotion.Never)` on the layout animations.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  Extrapolation,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { withRepeat, withSequence, withTiming } from '../daily/anims';
import { colors, getHealthColor, getLeague, t, HEALTH_GRADIENTS } from '../../shared';
import { haptics } from '../../services/haptics';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import { MPPlayer } from '../../store/multiplayerStore';
import useAnimatedNumber from '../../hooks/useAnimatedNumber';
import PlayerName from '../PlayerName';
import ProfileSheet from '../account/ProfileSheet';

interface DuelHUDProps {
  players: MPPlayer[];
  myId: string;
  /**
   * Optional node (the round timer) rendered in the gap BETWEEN the two corner
   * health bars. The game screen passes this only when the middle gap is wide
   * enough (landscape / tablets / large phones); flexbox `space-between` then
   * centers it exactly between the bars. Omitted → bars sit at the edges and the
   * timer is rendered below them by the parent.
   */
  centerSlot?: ReactNode;
}

const MAX_HP = 5000;
const HP_ANIM_MS = 1200;       // fill + number, matches web's 1200ms RAF tween
const DAMAGE_ANIM_MS = 2000;   // floating "-X", matches web's damage-float
const TRACK_HEIGHT = 22;
const ENTER_STAGGER_MS = 120;  // opponent bar slides in just after yours
// Fixed bar width pinned to each corner (web parity: .health-bar-container is a
// fixed 160px at mobile widths, NOT flex-stretched). The middle gap grows with
// the screen instead of the bars; `maxWidth` lets them shrink on tiny phones.
// Exported so the game screen can size the middle gap and decide whether the
// round timer fits between the bars.
export const BAR_WIDTH = 164;
/** Fraction of the row each bar may occupy before it shrinks (collision guard). */
export const BAR_MAX_FRACTION = 0.47;

export default function DuelHUD({ players, myId, centerSlot }: DuelHUDProps) {
  const me = players.find((p) => p.id === myId);
  const opponent = players.find((p) => p.id !== myId);

  if (!me || !opponent) return null;

  return (
    <View style={styles.row}>
      <HealthBar player={me} isMe side="left" />
      {centerSlot != null && (
        <View style={styles.centerSlot} pointerEvents="none">
          {centerSlot}
        </View>
      )}
      <HealthBar player={opponent} isMe={false} side="right" />
    </View>
  );
}

function HealthBar({
  player,
  isMe,
  side,
}: {
  player: MPPlayer;
  isMe: boolean;
  side: 'left' | 'right';
}) {
  const isRight = side === 'right';
  const hp = Math.max(0, player.score);
  const hpPct = Math.min(100, (hp / MAX_HP) * 100);
  const { glow } = getHealthColor(hpPct);
  const isCritical = hpPct <= 30;

  // One-shot warning buzz the moment MY health crosses into the critical zone —
  // the tense "you're about to lose" beat. Only on the downward crossing.
  const wasCriticalRef = useRef(isCritical);
  useEffect(() => {
    if (isMe && isCritical && !wasCriticalRef.current) haptics.warning();
    wasCriticalRef.current = isCritical;
  }, [isCritical, isMe]);

  // HP number counts both up AND down (resetWhenLower:false) like the web bar.
  const { displayed: displayedHp } = useAnimatedNumber(hp, {
    duration: HP_ANIM_MS,
    resetWhenLower: false,
  });

  // Smooth fill width on the UI thread (single source the colour bands read from).
  const widthPct = useSharedValue(hpPct);
  useEffect(() => {
    widthPct.value = withTiming(hpPct, {
      duration: HP_ANIM_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [hpPct, widthPct]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${widthPct.value}%` }));

  // Three glossy gradients stacked + cross-faded by the SAME widthPct → the colour
  // can never desync from the bar length, and the transition is a smooth blend.
  const highStyle = useAnimatedStyle(() => ({
    opacity: interpolate(widthPct.value, [55, 62], [0, 1], Extrapolation.CLAMP),
  }));
  const mediumStyle = useAnimatedStyle(() => ({
    opacity: interpolate(widthPct.value, [25, 33, 58, 65], [0, 1, 1, 0], Extrapolation.CLAMP),
  }));
  const lowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(widthPct.value, [27, 34], [1, 0], Extrapolation.CLAMP),
  }));

  // Idle glow pulse (decorative; gentle 0.12↔0.34).
  const pulse = useSharedValue(0.12);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.34, { duration: 1400 }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  // Opponent profile opens in a slide-up sheet (not a route push) so the game —
  // health bars, timer — stays visible behind it and one tap dismisses it.
  const [profileOpen, setProfileOpen] = useState(false);

  // Damage feedback: floating "-X" + a brief container scale-pop on HP loss.
  const [damage, setDamage] = useState<number | null>(null);
  const prevScore = useRef(player.score);
  const dmgOpacity = useSharedValue(0);
  const dmgY = useSharedValue(0);
  const dmgScale = useSharedValue(1);
  const popScale = useSharedValue(1);

  useEffect(() => {
    const delta = prevScore.current - player.score;
    prevScore.current = player.score;
    if (delta <= 0) return;

    setDamage(delta);
    // Light pulse when the OPPONENT takes a hit (your guess chipped them). Your
    // own damage stays silent here — the critical-zone warning above covers the
    // moment that actually matters for you.
    if (!isMe) haptics.light();
    dmgOpacity.value = 1;
    dmgY.value = 0;
    dmgScale.value = 1;
    dmgOpacity.value = withTiming(0, { duration: DAMAGE_ANIM_MS });
    dmgY.value = withTiming(-40, { duration: DAMAGE_ANIM_MS, easing: Easing.out(Easing.cubic) });
    dmgScale.value = withTiming(1.2, { duration: DAMAGE_ANIM_MS });
    popScale.value = withSequence(
      withTiming(1.045, { duration: 150 }),
      withTiming(1, { duration: 420 }),
    );

    const timer = setTimeout(() => setDamage(null), DAMAGE_ANIM_MS);
    return () => clearTimeout(timer);
  }, [player.score, dmgOpacity, dmgY, dmgScale, popScale]);

  const damageStyle = useAnimatedStyle(() => ({
    opacity: dmgOpacity.value,
    transform: [{ translateY: dmgY.value }, { scale: dmgScale.value }],
  }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: popScale.value }] }));

  const league = player.elo !== undefined ? getLeague(player.elo) : null;
  const eloColor = league?.light ?? league?.color ?? '#60a5fa';

  const nameInner = (
    <PlayerName
      name={player.username}
      countryCode={player.countryCode}
      flagSize={14}
      textStyle={[styles.username, !isMe && styles.usernameOpponent]}
      gap={5}
    >
      {player.elo !== undefined && (
        <Text style={[styles.elo, { color: eloColor, textShadowColor: `${eloColor}70` }]}>
          ({player.elo})
        </Text>
      )}
    </PlayerName>
  );

  return (
    <Animated.View
      style={styles.bar}
      entering={FadeInDown.delay(isRight ? ENTER_STAGGER_MS : 0)
        .duration(420)
        .reduceMotion(ReduceMotion.Never)}
      exiting={FadeOut.duration(200).reduceMotion(ReduceMotion.Never)}
    >
      <Animated.View style={[styles.barInner, popStyle]}>
      {damage !== null && (
        <Animated.Text style={[styles.damageText, damageStyle]}>-{damage}</Animated.Text>
      )}

      <View style={styles.barOuter}>
        <View style={[styles.track, isRight && styles.trackRight]}>
          <Animated.View style={[styles.fill, fillStyle]}>
            <Animated.View style={[StyleSheet.absoluteFill, lowStyle]}>
              <LinearGradient
                colors={HEALTH_GRADIENTS.low}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, mediumStyle]}>
              <LinearGradient
                colors={HEALTH_GRADIENTS.medium}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, highStyle]}>
              <LinearGradient
                colors={HEALTH_GRADIENTS.high}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            <Animated.View
              style={[StyleSheet.absoluteFill, { backgroundColor: glow }, pulseStyle]}
              pointerEvents="none"
            />
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shine}
              pointerEvents="none"
            />
          </Animated.View>

          <View style={styles.hpTextWrap} pointerEvents="none">
            <Text style={[styles.hpNumber, isCritical && styles.hpNumberCritical]}>
              {displayedHp}
            </Text>
            <Text style={[styles.hpMax, isCritical && styles.hpMaxCritical]}> / {MAX_HP}</Text>
          </View>
        </View>
      </View>

      {!isMe ? (
        <Pressable
          onPress={() => setProfileOpen(true)}
          hitSlop={6}
          style={styles.namePressable}
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.7)', 'rgba(20,20,20,0.82)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.namePill}
          >
            {nameInner}
          </LinearGradient>
        </Pressable>
      ) : (
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'rgba(20,20,20,0.82)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.namePill}
        >
          {nameInner}
        </LinearGradient>
      )}
      </Animated.View>

      {!isMe && (
        <ProfileSheet
          visible={profileOpen}
          username={player.username}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    // Pin one bar to each edge so a clear gap opens in the middle and grows with
    // the screen (web parity), instead of both bars stretching to fill the width.
    justifyContent: 'space-between',
    width: '100%',
  },
  bar: {
    width: BAR_WIDTH,
    maxWidth: '47%',  // == BAR_MAX_FRACTION; shrink rather than overflow on narrow phones
    flexShrink: 1,
  },
  centerSlot: {
    flex: 1,           // soak up the gap between the two fixed-width bars
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.sm,
  },
  barInner: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.xs,
  },
  barOuter: {
    width: '100%',
    backgroundColor: 'rgba(10,12,14,0.78)',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  track: {
    width: '100%',
    height: TRACK_HEIGHT,
    borderRadius: 11,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#1b1e21',
  },
  trackRight: {
    justifyContent: 'flex-end',
  },
  fill: {
    // overflow:hidden rounds the gradient corners to the fill — note this also
    // clips any shadow on iOS, so the glow comes from the pulse overlay instead.
    height: '100%',
    borderRadius: 11,
    overflow: 'hidden',
  },
  shine: {
    position: 'absolute',
    top: 2,
    left: 4,
    right: 4,
    height: 6,
    borderRadius: 6,
  },
  hpTextWrap: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hpNumber: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hpNumberCritical: {
    color: '#fecaca',
  },
  hpMax: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hpMaxCritical: {
    color: 'rgba(254,202,202,0.85)',
  },
  namePressable: {
    maxWidth: '100%',
  },
  namePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  username: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.xs,
    flexShrink: 1,
  },
  usernameOpponent: {
    textDecorationLine: 'underline',
  },
  elo: {
    fontSize: 11,
    fontFamily: 'Lexend-SemiBold',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  damageText: {
    position: 'absolute',
    top: -24,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#ef4444',
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-Bold',
    textShadowColor: 'rgba(239,68,68,0.75)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
    zIndex: 10,
  },
});
