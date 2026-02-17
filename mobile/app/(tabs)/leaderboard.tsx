import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/shared';
import { api } from '../../src/services/api';

interface LeaderboardEntry {
  rank: number;
  username: string;
  elo?: number;
  totalXp?: number;
  countryCode?: string;
}

interface LeaderboardData {
  leaderboard: LeaderboardEntry[];
  myRank?: number;
  myElo?: number;
  myXp?: number;
  myCountryCode?: string;
}

type LeaderboardMode = 'elo' | 'xp';
type TimePeriod = 'allTime' | 'daily';

function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function formatScore(value: number | undefined, isDailyLeaderboard: boolean): string {
  if (value == null) return '0';
  if (!isDailyLeaderboard) return value.toFixed(0);
  const numValue = Number(value);
  if (numValue > 0) return `+${numValue.toFixed(0)}`;
  return numValue.toFixed(0);
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<LeaderboardMode>('elo');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('allTime');
  const [data, setData] = useState<LeaderboardData>({ leaderboard: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // TODO: Replace with real session when auth is implemented
  const session = null as { username: string } | null;

  const fetchLeaderboard = useCallback(async () => {
    setError(false);
    try {
      const response = await api.leaderboard({
        mode,
        pastDay: timePeriod === 'daily',
        username: session?.username,
      });
      setData(response);
    } catch (e) {
      console.error('Failed to fetch leaderboard:', e);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode, timePeriod, session?.username]);

  useEffect(() => {
    setLoading(true);
    fetchLeaderboard();
  }, [mode, timePeriod]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const isDailyLeaderboard = timePeriod === 'daily';

  const renderItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const isTopThree = index < 3;
    const medals = ['🥇', '🥈', '🥉'];

    return (
      <Pressable
        style={({ pressed }) => [
          styles.leaderboardItem,
          isTopThree && styles.topThree,
          pressed && { opacity: 0.8 },
        ]}
        onPress={() => router.push(`/user/${item.username}` as any)}
      >
        {/* Rank / Medal */}
        <View style={styles.rankNumber}>
          {isTopThree ? (
            <Text style={styles.medal}>{medals[index]}</Text>
          ) : (
            <Text style={styles.rankText}>#{index + 1}</Text>
          )}
        </View>

        {/* Player Details */}
        <View style={styles.playerDetails}>
          <View style={styles.usernameRow}>
            <Text style={styles.username} numberOfLines={1}>
              {item.username}
            </Text>
            {item.countryCode && (
              <Text style={styles.flag}>{getFlagEmoji(item.countryCode)}</Text>
            )}
          </View>
        </View>

        {/* Score */}
        <View style={styles.scoreContainer}>
          <Text style={styles.score}>
            {formatScore(mode === 'elo' ? item.elo : item.totalXp, isDailyLeaderboard)}
          </Text>
          <Text style={styles.scoreLabel}>{mode === 'elo' ? 'Elo' : 'XP'}</Text>
        </View>
      </Pressable>
    );
  };

  const ListHeader = () => (
    <>
      {/* My Rank Card — renders when user is logged in and has a rank */}
      {session && data.myRank && (
        <View style={styles.myRankCard}>
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeText}>#{data.myRank}</Text>
          </View>
          <View style={styles.playerInfo}>
            <View style={styles.usernameRow}>
              <Text style={styles.playerName}>{session.username}</Text>
              {data.myCountryCode && (
                <Text style={styles.flag}>{getFlagEmoji(data.myCountryCode)}</Text>
              )}
            </View>
            <Text style={styles.playerScore}>
              {formatScore(mode === 'elo' ? data.myElo : data.myXp, isDailyLeaderboard)}
              <Text style={styles.scoreType}> {mode === 'elo' ? 'Elo' : 'XP'}</Text>
            </Text>
          </View>
          <Text style={styles.myRankLabel}>Your Rank</Text>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      {/* Background Image */}
      <ImageBackground
        source={require('../../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />

      {/* Dark overlay matching web: rgba(0,0,0,0.9) → rgba(20,26,57,0.8) → rgba(0,0,0,0.9) */}
      <LinearGradient
        colors={[
          'rgba(0, 0, 0, 0.9)',
          'rgba(20, 26, 57, 0.8)',
          'rgba(0, 0, 0, 0.9)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Branding / Header */}
        <View style={styles.branding}>
          <Text style={styles.title}>Leaderboard</Text>

          <View style={styles.controls}>
            {/* Time Controls */}
            <View style={styles.pillGroup}>
              <Pressable
                style={[
                  styles.controlButton,
                  timePeriod === 'allTime' && styles.controlButtonActiveGreen,
                ]}
                onPress={() => setTimePeriod('allTime')}
              >
                <Text
                  style={[
                    styles.controlButtonText,
                    timePeriod === 'allTime' && styles.controlButtonTextActiveGreen,
                  ]}
                >
                  All Time
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.controlButton,
                  timePeriod === 'daily' && styles.controlButtonActiveGreen,
                ]}
                onPress={() => setTimePeriod('daily')}
              >
                <Text
                  style={[
                    styles.controlButtonText,
                    timePeriod === 'daily' && styles.controlButtonTextActiveGreen,
                  ]}
                >
                  Past Day
                </Text>
              </Pressable>
            </View>

            {/* Mode Controls */}
            <View style={styles.pillGroup}>
              <Pressable
                style={[
                  styles.controlButton,
                  mode === 'elo' && styles.controlButtonActiveGold,
                ]}
                onPress={() => setMode('elo')}
              >
                <Text
                  style={[
                    styles.controlButtonText,
                    mode === 'elo' && styles.controlButtonTextActiveGold,
                  ]}
                >
                  ELO
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.controlButton,
                  mode === 'xp' && styles.controlButtonActiveGold,
                ]}
                onPress={() => setMode('xp')}
              >
                <Text
                  style={[
                    styles.controlButtonText,
                    mode === 'xp' && styles.controlButtonTextActiveGold,
                  ]}
                >
                  XP
                </Text>
              </Pressable>
            </View>
            {/* Back Button */}
            <Pressable
              style={({ pressed }) => [
                styles.exitButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => router.replace('/(tabs)/home')}
            >
              <Ionicons name="arrow-back" size={16} color="#dc3545" />
              <Text style={styles.exitButtonText}>Back to Game</Text>
            </Pressable>
          </View>
        </View>

        {/* Error State */}
        {error && (
          <View style={styles.errorMessage}>
            <Text style={styles.errorText}>Error fetching leaderboard data</Text>
          </View>
        )}

        {/* Loading State */}
        {loading && !error && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}

        {/* Leaderboard List */}
        {!loading && !error && (
          <View style={styles.leaderboardContainer}>
            <FlatList
              data={data.leaderboard}
              keyExtractor={(item, index) => `${index}-${item.username}`}
              renderItem={renderItem}
              ListHeaderComponent={ListHeader}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#4CAF50"
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="trophy-outline" size={64} color="rgba(255,255,255,0.4)" />
                  <Text style={styles.emptyText}>No entries yet</Text>
                </View>
              }
            />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  safeArea: {
    flex: 1,
  },

  // ── Branding / Header ──────────────────────────────────────
  branding: {
    marginHorizontal: 8,
    marginTop: 8,
    marginBottom: 12,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#4CAF50',
    marginBottom: 16,
  },
  controls: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },

  // ── Pill Group (Time / Mode) ───────────────────────────────
  pillGroup: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 25,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  controlButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    minWidth: 70,
    alignItems: 'center',
  },
  controlButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  controlButtonActiveGreen: {
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  controlButtonTextActiveGreen: {
    color: '#fff',
    fontWeight: '600',
  },
  controlButtonActiveGold: {
    backgroundColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  controlButtonTextActiveGold: {
    color: '#000',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Exit Button ────────────────────────────────────────────
  exitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(220, 53, 69, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'rgba(220, 53, 69, 0.3)',
  },
  exitButtonText: {
    color: '#dc3545',
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Error ──────────────────────────────────────────────────
  errorMessage: {
    marginHorizontal: 8,
    marginBottom: 12,
    padding: 15,
    backgroundColor: 'rgba(248, 215, 218, 0.9)',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(245, 198, 203, 0.8)',
    alignItems: 'center',
  },
  errorText: {
    color: '#721c24',
    fontSize: 16,
  },

  // ── Loading ────────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
  },

  // ── Leaderboard Container ─────────────────────────────────
  leaderboardContainer: {
    flex: 1,
    marginHorizontal: 8,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  listContent: {
    padding: 12,
    paddingBottom: 100,
  },

  // ── My Rank Card ──────────────────────────────────────────
  myRankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginBottom: 12,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(76, 175, 80, 0.3)',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
  },
  rankBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.8)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  rankBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  playerInfo: {
    flex: 1,
    gap: 4,
  },
  playerName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  playerScore: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4CAF50',
  },
  scoreType: {
    fontSize: 13,
    opacity: 0.8,
  },
  myRankLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '500',
  },

  // ── Leaderboard Item ──────────────────────────────────────
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  topThree: {
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },

  // ── Rank ──────────────────────────────────────────────────
  rankNumber: {
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontWeight: '700',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  medal: {
    fontSize: 24,
  },

  // ── Player Details ────────────────────────────────────────
  playerDetails: {
    flex: 1,
    marginLeft: 8,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  username: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    flexShrink: 1,
  },
  flag: {
    fontSize: 14,
  },

  // ── Score ─────────────────────────────────────────────────
  scoreContainer: {
    alignItems: 'flex-end',
    gap: 2,
  },
  score: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4CAF50',
  },
  scoreLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Empty State ───────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 16,
  },
});
