import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../../services/api';
import { GlassCard, formatTimeAgo, formatTime, sharedStyles } from './shared';
import { t } from '../../shared';

interface GameHistoryTabProps {
  secret: string;
  onNavigateToUser?: (username: string) => void;
}

interface Game {
  gameId: string;
  gameType: string;
  settings: {
    location: string;
    countryGuesser?: boolean;
    countryGuessrSubMode?: 'country' | 'continent' | null;
    /** Intra-party team mode (never set for matchmade 2v2 — gameType '2v2'). */
    teamGame?: boolean;
  };
  endedAt: string;
  userStats: {
    totalPoints: number;
    totalXp: number;
    finalRank?: number;
    elo?: { change: number };
    /** Team assignment in team modes ('a' | 'b'); null on solo modes. */
    team?: 'a' | 'b' | null;
  };
  opponent?: { username: string; countryCode?: string; accountId?: string | null };
  roundsPlayed: number;
  totalDuration: number;
  result: {
    maxPossiblePoints: number;
    /** Team modes: 'a' | 'b', null on draws/solo games. */
    winningTeam?: 'a' | 'b' | null;
  };
  multiplayer?: { playerCount: number };
}

interface Pagination {
  currentPage: number;
  totalPages: number;
  totalGames: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// labelKey holds the i18n key (NOT a t() call) so the label is resolved at
// render time and updates on language switch — never call t() at module scope.
const GAME_TYPES: Record<string, { labelKey: string; icon: string; color: string }> = {
  singleplayer: { labelKey: 'singleplayer', icon: '👤', color: '#4CAF50' },
  ranked_duel: { labelKey: 'rankedDuel', icon: '⚔️', color: '#FF5722' },
  '2v2': { labelKey: 'twovtwo', icon: '🛡️', color: '#e91e63' },
  unranked_multiplayer: { labelKey: 'multiplayer', icon: '👥', color: '#2196F3' },
  private_multiplayer: { labelKey: 'privateGame', icon: '🔒', color: '#9C27B0' },
  daily_challenge: { labelKey: 'dailyChallenge', icon: '📅', color: '#FFC107' },
};

export default function GameHistoryTab({ secret, onNavigateToUser }: GameHistoryTabProps) {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({
    currentPage: 1,
    totalPages: 1,
    totalGames: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const fetchGames = async (p: number) => {
    setLoading(true);
    try {
      const data = await api.gameHistory(secret, p, 10);
      setGames(data.games || []);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Error fetching game history:', error);
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGames(page);
  }, [page, secret]);

  const getGameType = (gameType: string) =>
    GAME_TYPES[gameType] || { labelKey: null, icon: '🎮', color: '#757575' };

  const getLocationDisplay = (settings: Game['settings']) => {
    if (settings.countryGuesser) {
      return t(settings.countryGuessrSubMode === 'continent'
        ? 'continentGuesser'
        : 'countryGuesser');
    }

    const location = settings.location;
    if (location === 'all') return t('worldwide');
    if (location && location.length === 2 && location === location.toUpperCase()) return location;
    return location || t('unknown');
  };

  if (loading) {
    return (
      <GlassCard>
        <View style={{ alignItems: 'center', gap: 16, paddingVertical: 40 }}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontFamily: 'Lexend' }}>
            {t('loadingGameHistory')}
          </Text>
        </View>
      </GlassCard>
    );
  }

  if (games.length === 0) {
    return (
      <GlassCard>
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
          <Text style={{ fontSize: 48 }}>🎮</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontFamily: 'Lexend-SemiBold' }}>
            {t('noGamesPlayed')}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: 'Lexend' }}>
            {t('startPlayingToSeeHistory')}
          </Text>
        </View>
      </GlassCard>
    );
  }

  return (
    <View style={{ gap: 12 }}>

      {/* Game Cards */}
      {games.map((game) => {
        const typeInfo = getGameType(game.gameType);
        const isRankedDuel = game.gameType === 'ranked_duel';
        const isVictory = game.userStats?.finalRank === 1;

        return (
          <Pressable
            key={game.gameId}
            onPress={() => router.push({
              pathname: '/game/results',
              params: { gameId: game.gameId, fromHistory: 'true' },
            })}
            style={({ pressed }) => [pressed && { opacity: 0.85 }]}
          >
          <GlassCard style={{ padding: 14 }}>
            {/* Header row: type + date */}
            <View style={styles.gameHeader}>
              <View style={styles.gameTypeRow}>
                <Text style={{ fontSize: 18 }}>{typeInfo.icon}</Text>
                <Text style={[styles.gameTypeLabel, { color: typeInfo.color }]}>
                  {typeInfo.labelKey ? t(typeInfo.labelKey) : game.gameType}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.gameDate}>{formatTimeAgo(game.endedAt)}</Text>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.4)" />
              </View>
            </View>

            {/* Stats */}
            <View style={styles.gameStatsRow}>
              {/* Team games — BOTH kinds: party team mode (settings.teamGame)
                  and matchmade 2v2 (gameType '2v2', which never sets the
                  party-only flag). W/L/D from winningTeam vs MY team, ahead
                  of points; NEVER an opponent name (the backend computes
                  opponent only for ranked_duel — web gameHistory.js parity). */}
              {(game.settings?.teamGame || game.gameType === '2v2') && game.userStats?.team && (
                <View style={styles.gameStat}>
                  <Text style={styles.gameStatLabel}>{t('result')}</Text>
                  <Text
                    style={[
                      styles.gameStatValue,
                      {
                        color:
                          game.result?.winningTeam == null
                            ? '#9E9E9E'
                            : game.result.winningTeam === game.userStats.team
                              ? '#4CAF50'
                              : '#F44336',
                      },
                    ]}
                  >
                    {game.result?.winningTeam == null
                      ? t('draw')
                      : game.result.winningTeam === game.userStats.team
                        ? t('victory')
                        : t('defeat')}
                  </Text>
                </View>
              )}
              {isRankedDuel ? (
                <>
                  <View style={styles.gameStat}>
                    <Text style={styles.gameStatLabel}>{t('result')}</Text>
                    <Text style={[styles.gameStatValue, { color: isVictory ? '#4CAF50' : '#F44336' }]}>
                      {t(isVictory ? 'victory' : 'defeat')}
                    </Text>
                  </View>
                  <View style={styles.gameStat}>
                    <Text style={styles.gameStatLabel}>{t('elo')}</Text>
                    <Text style={[styles.gameStatValue, {
                      color: (game.userStats?.elo?.change ?? 0) >= 0 ? '#4CAF50' : '#F44336'
                    }]}>
                      {(game.userStats?.elo?.change ?? 0) > 0 ? '+' : ''}{game.userStats?.elo?.change ?? 0}
                    </Text>
                  </View>
                  {game.opponent?.username && (
                    <View style={styles.gameStat}>
                      <Text style={styles.gameStatLabel}>{t('opponent')}</Text>
                      {game.opponent.accountId ? (
                        <Pressable onPress={() => onNavigateToUser?.(game.opponent!.username)}>
                          <Text style={[styles.gameStatValue, { color: '#4dabf7', fontSize: 13 }]}>
                            {game.opponent.username}
                          </Text>
                        </Pressable>
                      ) : (
                        // Account-less opponent (bot/guest): no profile to open (web parity)
                        <Text style={[styles.gameStatValue, { fontSize: 13 }]}>
                          {game.opponent.username}
                        </Text>
                      )}
                    </View>
                  )}
                  <View style={styles.gameStat}>
                    <Text style={styles.gameStatLabel}>{t('duration')}</Text>
                    <Text style={styles.gameStatValue}>{formatTime(game.totalDuration * 1000)}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.gameStat}>
                  <Text style={styles.gameStatLabel}>{t('points')}</Text>
                  <Text style={styles.gameStatValue}>
                    {game.userStats.totalPoints.toLocaleString()}
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                      {' '}/ {game.result.maxPossiblePoints.toLocaleString()}
                    </Text>
                  </Text>
                </View>
              )}

              {game.userStats.totalXp > 0 && (
                <View style={styles.gameStat}>
                  <Text style={styles.gameStatLabel}>{t('xp')}</Text>
                  <Text style={styles.gameStatValue}>{game.userStats.totalXp}</Text>
                </View>
              )}

              {!isRankedDuel && (
                <View style={styles.gameStat}>
                  <Text style={styles.gameStatLabel}>{t('duration')}</Text>
                  <Text style={styles.gameStatValue}>{formatTime(game.totalDuration * 1000)}</Text>
                </View>
              )}
            </View>

            {/* Details row */}
            <View style={styles.gameDetailsRow}>
              <View style={{ flexDirection: 'row', gap: 16, flex: 1 }}>
                <View style={styles.gameDetail}>
                  <Text style={styles.gameDetailLabel}>{t('map')}</Text>
                  <Text style={styles.gameDetailValue}>{getLocationDisplay(game.settings)}</Text>
                </View>
                <View style={styles.gameDetail}>
                  <Text style={styles.gameDetailLabel}>{t('rounds')}</Text>
                  <Text style={styles.gameDetailValue}>{game.roundsPlayed}</Text>
                </View>
                {game.multiplayer && (
                  <View style={styles.gameDetail}>
                    <Text style={styles.gameDetailLabel}>{t('players')}</Text>
                    <Text style={styles.gameDetailValue}>{game.multiplayer.playerCount}</Text>
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
            </View>
          </GlassCard>
          </Pressable>
        );
      })}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <View style={styles.paginationRow}>
          <Pressable
            style={[styles.pageButton, !pagination.hasPrevPage && styles.pageButtonDisabled]}
            onPress={() => setPage(page - 1)}
            disabled={!pagination.hasPrevPage}
          >
            <Text style={[styles.pageButtonText, !pagination.hasPrevPage && { opacity: 0.4 }]}>
              ← {t('previous')}
            </Text>
          </Pressable>

          <Text style={styles.pageInfo}>
            {pagination.currentPage} / {pagination.totalPages}
          </Text>

          <Pressable
            style={[styles.pageButton, !pagination.hasNextPage && styles.pageButtonDisabled]}
            onPress={() => setPage(page + 1)}
            disabled={!pagination.hasNextPage}
          >
            <Text style={[styles.pageButtonText, !pagination.hasNextPage && { opacity: 0.4 }]}>
              {t('next')} →
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gameTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gameTypeLabel: {
    fontSize: 14,
    fontFamily: 'Lexend-SemiBold',
  },
  gameDate: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'Lexend',
  },
  gameStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  gameStat: {
    flexGrow: 1,
    flexBasis: '28%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  gameStatLabel: {
    fontSize: 10,
    color: '#b0b0b0',
    textTransform: 'uppercase',
    fontFamily: 'Lexend-Medium',
    marginBottom: 4,
  },
  gameStatValue: {
    fontSize: 15,
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
  },
  gameDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
  },
  gameDetail: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  gameDetailLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'Lexend',
  },
  gameDetailValue: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'Lexend-Medium',
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  pageButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pageButtonDisabled: {
    opacity: 0.5,
  },
  pageButtonText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Lexend-Medium',
  },
  pageInfo: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontFamily: 'Lexend',
  },
});
