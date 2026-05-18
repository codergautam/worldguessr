/**
 * Reusable player list for lobby, between-round, and end-game displays.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../shared';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import CountryFlag from '../CountryFlag';
import type { MPPlayer } from '../../store/multiplayerStore';

interface PlayerListProps {
  players: MPPlayer[];
  myId?: string;
  showScores?: boolean;
  mode?: 'lobby' | 'betweenRounds' | 'endGame';
  roundDeltas?: Record<string, number>;
}

export default function PlayerList({
  players,
  myId,
  showScores = false,
  mode = 'lobby',
  roundDeltas,
}: PlayerListProps) {
  const sortedPlayers = mode === 'lobby'
    ? players
    : [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const rowLimit = sortedPlayers.length;
  const dense = mode === 'betweenRounds';
  const shouldShowScores = showScores || mode !== 'lobby';

  return (
    <View style={[styles.container, dense && styles.containerDense]}>
      {sortedPlayers.slice(0, rowLimit).map((player, index) => {
        const roundDelta = roundDeltas?.[player.id] ?? 0;

        return (
          <View
            key={player.id}
            style={[
              styles.playerRow,
              dense && styles.playerRowDense,
              player.id === myId && styles.playerRowSelf,
            ]}
          >
            <View style={styles.playerLeft}>
              {mode !== 'lobby' && (
                <Text style={styles.rankText}>#{index + 1}</Text>
              )}
              {player.countryCode && (
                <CountryFlag countryCode={player.countryCode} size={dense ? 16 : 18} />
              )}
              <Text
                style={[
                  styles.playerName,
                  dense && styles.playerNameDense,
                  player.id === myId && styles.playerNameSelf,
                ]}
                numberOfLines={1}
              >
                {player.username}
              </Text>
              {player.host && (
                <Text style={styles.hostText}>(Host)</Text>
              )}
              {player.supporter && (
                <Ionicons name="heart" size={12} color="#ff6b9d" />
              )}
            </View>
            {shouldShowScores && (
              <View style={styles.playerRight}>
                {player.elo !== undefined && player.elo > 0 && (
                  <Text style={styles.eloText}>{player.elo}</Text>
                )}
                <Text style={styles.scoreText}>{(player.score ?? 0).toLocaleString()}</Text>
                {roundDeltas && (
                  <Text
                    style={[
                      styles.deltaText,
                      roundDelta > 0 && styles.deltaTextPositive,
                    ]}
                  >
                    +{roundDelta.toLocaleString()}
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  containerDense: {
    gap: 3,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  playerRowDense: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  playerRowSelf: {
    backgroundColor: 'rgba(36, 87, 52, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.65)',
  },
  playerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  rankText: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-Bold',
    width: 28,
  },
  playerName: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-SemiBold',
    flexShrink: 1,
  },
  playerNameDense: {
    fontSize: fontSizes.sm,
  },
  playerNameSelf: {
    color: colors.white,
  },
  hostText: {
    color: '#dc3545',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    marginLeft: 2,
  },
  playerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eloText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
  },
  scoreText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Bold',
    minWidth: 46,
    textAlign: 'right',
  },
  deltaText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-Bold',
    minWidth: 38,
    textAlign: 'right',
  },
  deltaTextPositive: {
    color: colors.success,
  },
});
