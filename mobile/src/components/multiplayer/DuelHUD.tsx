/**
 * Duel mode HUD showing animated health bars for both players.
 */

import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, getLeague } from '../../shared';
import { spacing, fontSizes } from '../../styles/theme';
import { MPPlayer } from '../../store/multiplayerStore';
import CountryFlag from '../CountryFlag';

interface DuelHUDProps {
  players: MPPlayer[];
  myId: string;
}

const MAX_HP = 5000;
const DAMAGE_ANIMATION_MS = 1200;

export default function DuelHUD({ players, myId }: DuelHUDProps) {
  const me = players.find((p) => p.id === myId);
  const opponent = players.find((p) => p.id !== myId);

  if (!me || !opponent) return null;

  return (
    <View style={styles.container}>
      <PlayerBar player={me} isMe side="left" />
      <Text style={styles.vs}>VS</Text>
      <PlayerBar player={opponent} isMe={false} side="right" />
    </View>
  );
}

function PlayerBar({
  player,
  isMe,
  side,
}: {
  player: MPPlayer;
  isMe: boolean;
  side: 'left' | 'right';
}) {
  const router = useRouter();
  const hp = Math.max(0, player.score);
  const hpPct = Math.min(100, (hp / MAX_HP) * 100);
  const prevScoreRef = useRef(player.score);
  const [damage, setDamage] = useState<number | null>(null);
  const widthPct = useSharedValue(hpPct);
  const damageOpacity = useSharedValue(0);
  const damageTranslateY = useSharedValue(0);

  useEffect(() => {
    widthPct.value = withTiming(hpPct, {
      duration: DAMAGE_ANIMATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [hpPct, widthPct]);

  useEffect(() => {
    const previous = prevScoreRef.current;
    const delta = previous - player.score;
    prevScoreRef.current = player.score;

    if (delta <= 0) return;

    setDamage(delta);
    damageOpacity.value = 1;
    damageTranslateY.value = 0;
    damageOpacity.value = withTiming(0, { duration: DAMAGE_ANIMATION_MS });
    damageTranslateY.value = withTiming(-40, {
      duration: DAMAGE_ANIMATION_MS,
      easing: Easing.out(Easing.cubic),
    });

    const timer = setTimeout(() => setDamage(null), DAMAGE_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [player.score, damageOpacity, damageTranslateY]);

  const fillStyle = useAnimatedStyle(() => {
    const backgroundColor = widthPct.value > 60
      ? '#4ade80'
      : widthPct.value > 30
        ? '#fbbf24'
        : '#ef4444';
    const shadowColor = widthPct.value > 60
      ? '#22c55e'
      : widthPct.value > 30
        ? '#f59e0b'
        : '#dc2626';

    return {
      width: `${widthPct.value}%`,
      backgroundColor,
      shadowColor,
    };
  });

  const damageStyle = useAnimatedStyle(() => ({
    opacity: damageOpacity.value,
    transform: [{ translateY: damageTranslateY.value }],
  }));

  const league = player.elo !== undefined ? getLeague(player.elo) : null;
  const eloColor = league?.light ?? league?.color ?? '#60a5fa';
  const isCritical = hpPct <= 30;

  const nameContent = (
    <View style={[styles.nameRow, side === 'right' && styles.nameRowRight]}>
      {side === 'left' && player.countryCode && (
        <CountryFlag countryCode={player.countryCode} size={13} />
      )}
      <Text
        style={[
          styles.username,
          isMe && styles.usernameMe,
          !isMe && styles.usernameOpponent,
        ]}
        numberOfLines={1}
      >
        {player.username}
      </Text>
      {side === 'right' && player.countryCode && (
        <CountryFlag countryCode={player.countryCode} size={13} />
      )}
    </View>
  );

  return (
    <View style={[styles.playerBar, side === 'right' && styles.playerBarRight]}>
      {damage !== null && (
        <Animated.Text style={[styles.damageText, side === 'right' && styles.damageTextRight, damageStyle]}>
          -{damage}
        </Animated.Text>
      )}

      {!isMe ? (
        <Pressable
          onPress={() => {
            router.push({
              pathname: '/user/[username]',
              params: { username: player.username },
            });
          }}
          hitSlop={8}
          style={styles.namePressable}
        >
          {nameContent}
        </Pressable>
      ) : (
        nameContent
      )}

      {player.elo !== undefined && (
        <Text style={[styles.elo, { color: eloColor, textShadowColor: `${eloColor}70` }]}>
          {player.elo}
        </Text>
      )}
      <View style={styles.hpBarBg}>
        <Animated.View
          style={[
            styles.hpBarFill,
            fillStyle,
            side === 'right' && styles.hpBarFillRight,
          ]}
        />
      </View>
      <Text style={[styles.hpText, isCritical && styles.hpTextCritical]}>
        {hp}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: Platform.OS === 'android'
      ? 'rgba(0, 0, 0, 0.7)'
      : 'rgba(0, 0, 0, 0.5)',
    borderRadius: 12,
    gap: spacing.sm,
    width: '100%',
    maxWidth: 520,
  },
  vs: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-Bold',
  },
  playerBar: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 2,
    position: 'relative',
    minWidth: 0,
  },
  playerBarRight: {
    alignItems: 'flex-end',
  },
  namePressable: {
    maxWidth: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
  },
  nameRowRight: {
    justifyContent: 'flex-end',
  },
  username: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    maxWidth: '100%',
  },
  usernameMe: {
    color: colors.primary,
  },
  usernameOpponent: {
    textDecorationLine: 'underline',
  },
  elo: {
    fontSize: 10,
    fontFamily: 'Lexend-SemiBold',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  hpBarBg: {
    width: '100%',
    height: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 4,
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  hpBarFillRight: {
    alignSelf: 'flex-end',
  },
  hpText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    fontFamily: 'Lexend-SemiBold',
    fontVariant: ['tabular-nums'],
  },
  hpTextCritical: {
    color: '#ef4444',
  },
  damageText: {
    position: 'absolute',
    top: -22,
    left: 0,
    color: '#ef4444',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Bold',
    textShadowColor: 'rgba(239, 68, 68, 0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  damageTextRight: {
    left: undefined,
    right: 0,
  },
});
