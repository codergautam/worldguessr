/**
 * Reusable player list for lobby and in-game display.
 * Shows username, country flag, ELO, supporter badge, host indicator.
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
  /** Show ELO and score on the right side (default false — lobby mode hides them) */
  showScores?: boolean;
}

export default function PlayerList({ players, myId, showScores = false }: PlayerListProps) {
  return (
    <View style={styles.container}>
      {players.map((player) => (
        <View
          key={player.id}
          style={[
            styles.playerRow,
            player.id === myId && styles.playerRowSelf,
          ]}
        >
          <View style={styles.playerLeft}>
            {player.countryCode && (
              <CountryFlag countryCode={player.countryCode} size={18} />
            )}
            <Text
              style={[
                styles.playerName,
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
          {showScores && (
            <View style={styles.playerRight}>
              {player.elo !== undefined && player.elo > 0 && (
                <Text style={styles.eloText}>{player.elo}</Text>
              )}
              <Text style={styles.scoreText}>{player.score ?? 0}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
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
  playerRowSelf: {
    backgroundColor: 'rgba(36, 87, 52, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(36, 87, 52, 0.6)',
  },
  playerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  playerName: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-SemiBold',
    flexShrink: 1,
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
    gap: 12,
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
    minWidth: 32,
    textAlign: 'right',
  },
});
