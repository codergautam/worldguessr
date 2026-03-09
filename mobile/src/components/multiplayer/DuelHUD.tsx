/**
 * Duel mode HUD showing health bars for both players.
 * Displayed during ranked/unranked duels at the top of the game screen.
 */

import { View, Text, StyleSheet, Platform } from 'react-native';
import { colors } from '../../shared';
import { spacing, fontSizes } from '../../styles/theme';
import { MPPlayer } from '../../store/multiplayerStore';

interface DuelHUDProps {
  players: MPPlayer[];
  myId: string;
}

const MAX_HP = 5000;

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
  const hp = Math.max(0, player.score);
  const hpPct = Math.min(100, (hp / MAX_HP) * 100);
  const barColor = isMe ? colors.primary : colors.error;
  const isCritical = hpPct < 20;

  return (
    <View style={[styles.playerBar, side === 'right' && styles.playerBarRight]}>
      <Text
        style={[styles.username, isMe && styles.usernameMe]}
        numberOfLines={1}
      >
        {player.username}
      </Text>
      {player.elo !== undefined && (
        <Text style={styles.elo}>{player.elo}</Text>
      )}
      <View style={styles.hpBarBg}>
        <View
          style={[
            styles.hpBarFill,
            {
              width: `${hpPct}%`,
              backgroundColor: isCritical ? '#ff4444' : barColor,
            },
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
  },
  playerBarRight: {
    alignItems: 'flex-end',
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
  elo: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    fontFamily: 'Lexend',
  },
  hpBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 3,
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
    color: '#ff4444',
  },
});
