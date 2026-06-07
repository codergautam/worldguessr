/**
 * Reusable player list for lobby, between-round, and end-game displays.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, t } from '../../shared';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import PlayerName from '../PlayerName';
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
  const dense = mode === 'betweenRounds';
  const shouldShowScores = showScores || mode !== 'lobby';

  // Web parity (playerList.js): the in-round / end-game leaderboard shows only
  // the top 5, then a "…" separator, then the current player's own row when
  // they rank below the cutoff. The lobby keeps showing everyone.
  const rowLimit = mode === 'lobby' ? sortedPlayers.length : 5;
  const myIndex = sortedPlayers.findIndex((player) => player.id === myId);
  const showSelfRow = myIndex >= rowLimit;

  const renderRow = (player: MPPlayer, index: number) => {
    const roundDelta = roundDeltas?.[player.id] ?? 0;

    return (
      <View
        key={player.id}
        style={[
          styles.playerRow,
          dense && styles.playerRowDense,
          dense && styles.playerRowBetween,
          player.id === myId && (dense ? styles.playerRowSelfBetween : styles.playerRowSelf),
        ]}
      >
        <View style={styles.playerLeft}>
          {mode !== 'lobby' && (
            <Text style={[styles.rankText, dense && styles.rankTextBetween]}>{t('rankN', { rank: index + 1 }, '#{{rank}}')}</Text>
          )}
          <PlayerName
            name={player.username}
            countryCode={player.countryCode}
            flagSize={dense ? 16 : 18}
            gap={8}
            textStyle={[
              styles.playerName,
              dense && styles.playerNameDense,
              player.id === myId && styles.playerNameSelf,
              dense && styles.playerNameBetween,
            ]}
          >
            {player.host && (
              <Text style={styles.hostText}>({t('host')})</Text>
            )}
            {player.supporter && (
              <Ionicons name="heart" size={12} color="#ff6b9d" />
            )}
          </PlayerName>
        </View>
        {shouldShowScores && (
          <View style={styles.playerRight}>
            {/* Web in-round leaderboard shows the total score only — no ELO,
                no per-round delta (those clutter; keep them for end-game). */}
            {!dense && player.elo !== undefined && player.elo > 0 && (
              <Text style={styles.eloText}>{player.elo}</Text>
            )}
            <Text style={[styles.scoreText, dense && styles.scoreTextBetween]}>{(player.score ?? 0).toLocaleString()}</Text>
            {!dense && roundDeltas && (
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
  };

  return (
    <View style={[styles.container, dense && styles.containerDense]}>
      {sortedPlayers.slice(0, rowLimit).map((player, index) => renderRow(player, index))}
      {showSelfRow && (
        <>
          <Text style={[styles.separator, dense && styles.separatorBetween]}>…</Text>
          {renderRow(sortedPlayers[myIndex], myIndex)}
        </>
      )}
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
  // Between-rounds leaderboard — white cards w/ dark text (matches web).
  playerRowBetween: {
    backgroundColor: '#ffffff',
    paddingVertical: spacing.sm,
    ...{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 3,
    },
  },
  playerRowSelfBetween: {
    backgroundColor: '#d4edda',
    borderLeftWidth: 4,
    borderLeftColor: '#28a745',
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
  rankTextBetween: { color: 'rgba(0, 0, 0, 0.45)' },
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
  playerNameBetween: { color: '#15202b' },
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
  scoreTextBetween: { color: '#15202b' },
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
  // "…" between the top-5 cards and the current player's own row.
  separator: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
    lineHeight: fontSizes.lg,
    paddingVertical: 2,
  },
  separatorBetween: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
});
