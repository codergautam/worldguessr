import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ImageBackground,
} from 'react-native';
import { Pressable } from '../../src/components/ui/SfxPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, t } from '../../src/shared';
import { api } from '../../src/services/api';
import PlayerName from '../../src/components/PlayerName';
import { useAuthStore } from '../../src/store/authStore';

interface LeaderboardEntry {
  rank: number;
  username: string;
  elo?: number;
  totalXp?: number;
  countryCode?: string;
  /** Equipped name-glow sku (api/leaderboard.js sendableUser). */
  nameGlow?: string | null;
}

interface LeaderboardData {
  leaderboard: LeaderboardEntry[];
  myRank?: number;
  myElo?: number;
  myXp?: number;
  myCountryCode?: string;
  /**
   * The VIEWER's own glow, for the "Your Rank" card. It cannot be read off
   * `leaderboard` — the point of that card is that the viewer is usually not
   * in the top 100.
   */
  myNameGlow?: string | null;
  /**
   * Present ONLY on the all-time ranked board (api/leaderboard.js): rows whose
   * owner has not finished a ranked match inside this window are filtered out
   * server-side. Its presence is the signal that the window applies — the rule
   * itself is not duplicated here, so a change to the window never needs an app
   * release.
   */
  activityWindowDays?: number;
  /** True when the VIEWER is the one the window is hiding. */
  myRankHidden?: boolean;
}

type LeaderboardMode = 'elo' | 'xp';
type TimePeriod = 'allTime' | 'daily';


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

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const session = isAuthenticated && user?.username ? { username: user.username } : null;

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
  }, [mode, timePeriod, session?.username]);

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
          <PlayerName
            name={item.username}
            countryCode={item.countryCode}
            flagSize={18}
            textStyle={styles.username}
            style={styles.usernameRow}
            glow={item.nameGlow}
            // Static: a hundred virtualised rows, each animated sku stacking
            // blurred <Text> copies. Same call the web leaderboard makes.
            animated={false}
          />
        </View>

        {/* Score */}
        <View style={styles.scoreContainer}>
          <Text style={styles.score}>
            {formatScore(mode === 'elo' ? item.elo : item.totalXp, isDailyLeaderboard)}
          </Text>
          <Text style={styles.scoreLabel}>{t(mode === 'elo' ? 'ELO' : 'xp')}</Text>
        </View>
      </Pressable>
    );
  };

  // The 14-day ranked activity window is applied SERVER-SIDE (api/leaderboard.js)
  // and this screen adds no client-side list processing on top: `data.leaderboard`
  // is passed to FlatList verbatim, ranks come from the array index, and nothing
  // merges the signed-in user into the rows. So there is no path by which a
  // filtered-out player can be re-added here. All this needs to do is EXPLAIN the
  // absence, which is otherwise indistinguishable from a bug.
  const showActivityNote = !isDailyLeaderboard && (data.activityWindowDays ?? 0) > 0;

  const ListHeader = () => (
    <>
      {showActivityNote && (
        <View style={styles.activityNote}>
          <Ionicons
            name="information-circle-outline"
            size={15}
            color="rgba(255,255,255,0.6)"
            style={styles.activityNoteIcon}
          />
          <Text style={styles.activityNoteText}>
            {t(
              'leaderboardInactiveNote',
              { days: data.activityWindowDays },
              'Players who have not finished a ranked match in the last {{days}} days are hidden from this board. Their rating is untouched, and their place returns on their next ranked match.',
            )}
            {session && data.myRankHidden ? (
              <Text style={styles.activityNoteYou}>
                {' '}
                {t(
                  'leaderboardInactiveYou',
                  undefined,
                  'That includes you right now. Play a ranked match to reappear.',
                )}
              </Text>
            ) : null}
          </Text>
        </View>
      )}

      {/* My Rank Card — renders when user is logged in and has a rank */}
      {session && data.myRank && (
        <View style={styles.myRankCard}>
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeText}>#{data.myRank}</Text>
          </View>
          <View style={styles.playerInfo}>
            <PlayerName
              name={session.username}
              countryCode={data.myCountryCode}
              flagSize={18}
              textStyle={styles.playerName}
              style={styles.usernameRow}
              // ANIMATED, unlike the rows above: this is exactly one card,
              // pinned outside the list, and it is the card the buyer came to
              // look at.
              glow={data.myNameGlow}
            />
            <Text style={styles.playerScore}>
              {formatScore(mode === 'elo' ? data.myElo : data.myXp, isDailyLeaderboard)}
              <Text style={styles.scoreType}> {t(mode === 'elo' ? 'ELO' : 'xp')}</Text>
            </Text>
          </View>
          <Text style={styles.myRankLabel}>{t('yourRank')}</Text>
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
          <Text style={styles.title}>{t('leaderboard')}</Text>

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
                  {t('allTime')}
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
                  {t('pastDay')}
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
                  {t('ELO')}
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
                  {t('xp')}
                </Text>
              </Pressable>
            </View>
            {/* Back Button */}
            <Pressable
              style={({ pressed }) => [
                styles.exitButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => router.navigate('/(tabs)/home')}
            >
              <Ionicons name="close" size={16} color="#dc3545" />
              <Text style={styles.exitButtonText}>{t('backToGame')}</Text>
            </Pressable>
          </View>
        </View>

        {/* Error State */}
        {error && (
          <View style={styles.errorMessage}>
            <Text style={styles.errorText}>{t('errorFetchingLeaderboard')}</Text>
          </View>
        )}

        {/* Loading State */}
        {loading && !error && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>{t('loading')}</Text>
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
                  <Text style={styles.emptyText}>{t('noEntriesYet')}</Text>
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
    backgroundColor: colors.background,
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
    fontFamily: 'Lexend-Bold',
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
    fontFamily: 'Lexend-Medium',
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
    fontFamily: 'Lexend-SemiBold',
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
    fontFamily: 'Lexend-SemiBold',
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
    fontFamily: 'Lexend-Medium',
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
    fontFamily: 'Lexend-Medium',
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
    fontFamily: 'Lexend',
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
  // Deliberately quieter than myRankCard below: an explanation, not a result.
  // Same 15px radius and translucent-fill vocabulary as the rest of this screen.
  activityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 13,
    marginBottom: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  activityNoteIcon: {
    marginTop: 1,
  },
  activityNoteText: {
    flex: 1,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Lexend-Regular',
  },
  activityNoteYou: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontFamily: 'Lexend-SemiBold',
  },
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
    fontFamily: 'Lexend-Bold',
    fontSize: 16,
  },
  playerInfo: {
    flex: 1,
    gap: 4,
  },
  playerName: {
    fontSize: 17,
    fontFamily: 'Lexend-SemiBold',
    color: '#fff',
  },
  playerScore: {
    fontSize: 20,
    fontFamily: 'Lexend-Bold',
    color: '#4CAF50',
  },
  scoreType: {
    fontSize: 13,
    fontFamily: 'Lexend',
    opacity: 0.8,
  },
  myRankLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'Lexend-Medium',
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
    fontFamily: 'Lexend-Bold',
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
    fontFamily: 'Lexend-Medium',
    color: '#fff',
    flexShrink: 1,
  },

  // ── Score ─────────────────────────────────────────────────
  scoreContainer: {
    alignItems: 'flex-end',
    gap: 2,
  },
  score: {
    fontSize: 18,
    fontFamily: 'Lexend-Bold',
    color: '#4CAF50',
  },
  scoreLabel: {
    fontSize: 11,
    fontFamily: 'Lexend-Medium',
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
    fontFamily: 'Lexend-Medium',
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 16,
  },
});
