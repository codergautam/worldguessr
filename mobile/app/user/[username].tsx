import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ImageBackground,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { api } from '../../src/services/api';
import { getLeague, leagues } from '../../src/shared/user/leagues';

// ── Types ────────────────────────────────────────────────────

interface ProfileData {
  username: string;
  elo: number;
  totalXp: number;
  gamesPlayed: number;
  createdAt?: string;
  profileViews?: number;
  countryCode?: string;
  supporter?: boolean;
  rank?: number;
  duelStats?: {
    wins: number;
    losses: number;
    ties: number;
    winRate: number;
  };
}

interface EloData {
  elo: number;
  rank: number;
  duels_wins: number;
  duels_losses: number;
  duels_tied: number;
  win_rate: number;
}

type ActiveTab = 'profile' | 'elo';

interface ProgressionEntry {
  timestamp: string;
  totalXp: number;
  xpGain?: number;
  xpRank?: number;
  rankImprovement?: number;
  elo?: number;
  eloChange?: number;
  eloRank?: number;
}

// ── Helpers ──────────────────────────────────────────────────

function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function msToTime(duration: number): string {
  const msInDay = 1000 * 60 * 60 * 24;
  const days = Math.trunc(duration / msInDay);
  if (days > 0) return `${days}d`;
  const msInHour = 1000 * 60 * 60;
  const hours = Math.trunc(duration / msInHour);
  if (hours > 0) return `${hours}h`;
  const msInMinute = 1000 * 60;
  const minutes = Math.trunc(duration / msInMinute);
  if (minutes > 0) return `${minutes}m`;
  const seconds = Math.trunc(duration / 1000);
  return `${seconds}s`;
}

// ── Main Component ───────────────────────────────────────────

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [eloData, setEloData] = useState<EloData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('profile');
  const [progression, setProgression] = useState<ProgressionEntry[]>([]);
  const [progressionLoading, setProgressionLoading] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();

  const setScrollEnabled = useCallback((enabled: boolean) => {
    scrollViewRef.current?.setNativeProps({ scrollEnabled: enabled });
  }, []);

  const fetchProfile = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    setError(null);

    try {
      const [profile, elo] = await Promise.allSettled([
        api.publicProfile(username),
        api.eloRank(username),
      ]);

      if (profile.status === 'rejected') {
        setError('User not found');
        setLoading(false);
        return;
      }

      setProfileData(profile.value);

      // ELO data — fallback to profile data if eloRank fails
      if (elo.status === 'fulfilled') {
        setEloData(elo.value);
      } else {
        setEloData({
          elo: profile.value.elo || 1000,
          rank: profile.value.rank || 0,
          duels_wins: profile.value.duelStats?.wins || 0,
          duels_losses: profile.value.duelStats?.losses || 0,
          duels_tied: profile.value.duelStats?.ties || 0,
          win_rate: profile.value.duelStats?.winRate || 0,
        });
      }
    } catch (e) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Fetch progression data
  useEffect(() => {
    if (!username) return;
    setProgressionLoading(true);
    api
      .userProgression(username)
      .then((res) => setProgression(res.progression || []))
      .catch(() => setProgression([]))
      .finally(() => setProgressionLoading(false));
  }, [username]);

  // ── Profile Tab ──────────────────────────────────────────

  const renderProfileTab = () => {
    if (!profileData) return null;

    const joinedAgo = profileData.createdAt
      ? msToTime(Date.now() - new Date(profileData.createdAt).getTime())
      : null;

    return (
      <View style={{ gap: 20 }}>
        <View style={styles.glassCard}>
          {joinedAgo && (
            <View style={styles.statRow}>
              <Ionicons name="time-outline" size={20} color="rgba(255,255,255,0.8)" style={styles.statIcon} />
              <Text style={styles.statText}>Joined {joinedAgo} ago</Text>
            </View>
          )}

          <View style={styles.statRow}>
            <Ionicons name="star" size={20} color="#ffd700" style={styles.statIcon} />
            <Text style={styles.statText}>{(profileData.totalXp || 0).toLocaleString()} XP</Text>
          </View>

          <View style={styles.statRow}>
            <Ionicons name="game-controller" size={20} color="rgba(255,255,255,0.8)" style={styles.statIcon} />
            <Text style={styles.statText}>Games Played: {(profileData.gamesPlayed || 0).toLocaleString()}</Text>
          </View>

          {profileData.profileViews != null && (
            <View style={styles.statRow}>
              <Ionicons name="people" size={20} color="rgba(255,255,255,0.8)" style={styles.statIcon} />
              <Text style={styles.statText}>Profile Views: {profileData.profileViews.toLocaleString()}</Text>
            </View>
          )}
        </View>

        {/* XP Progression Graph */}
        <ProgressionGraph
          data={progression}
          loading={progressionLoading}
          mode="xp"
          screenWidth={screenWidth}
          onChartTouch={setScrollEnabled}
        />
      </View>
    );
  };

  // ── ELO Tab ──────────────────────────────────────────────

  const renderEloTab = () => {
    if (!eloData) return null;

    const userLeague = getLeague(eloData.elo);
    const leagueList = Object.values(leagues);

    return (
      <View style={{ gap: 20 }}>
        {/* Leagues Card */}
        <View style={styles.glassCard}>
          <Text style={styles.cardTitle}>Leagues</Text>
          <View style={styles.leagueContainer}>
            {leagueList.map((league) => {
              const isCurrent = userLeague.name === league.name;
              return (
                <View key={league.name} style={styles.leagueItem}>
                  <View
                    style={[
                      styles.leagueBox,
                      { backgroundColor: league.color },
                      isCurrent && styles.leagueBoxCurrent,
                    ]}
                  >
                    <Text style={styles.leagueEmoji}>{league.emoji}</Text>
                  </View>
                  <Text
                    style={[
                      styles.leagueName,
                      isCurrent && styles.leagueNameCurrent,
                    ]}
                  >
                    {league.name}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Statistics Card */}
        <View style={styles.glassCard}>
          <Text style={styles.cardTitle}>Statistics</Text>
          <View style={styles.statsGrid}>
            <StatItem label="ELO" value={String(eloData.elo)} />
            <StatItem label="Global Rank" value={`#${eloData.rank}`} />
            <StatItem label="Duels Won" value={String(eloData.duels_wins)} />
            <StatItem label="Duels Lost" value={String(eloData.duels_losses)} />
            {eloData.duels_tied > 0 && (
              <StatItem label="Duels Tied" value={String(eloData.duels_tied)} />
            )}
            {eloData.win_rate > 0 && (
              <StatItem
                label="Win Rate"
                value={`${(eloData.win_rate * 100).toFixed(2)}%`}
              />
            )}
          </View>
        </View>

        {/* ELO Progression Graph */}
        <ProgressionGraph
          data={progression}
          loading={progressionLoading}
          mode="elo"
          screenWidth={screenWidth}
          onChartTouch={setScrollEnabled}
        />
      </View>
    );
  };

  // ── Render ───────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
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
        {/* Close Button */}
        <View style={styles.closeRow}>
          <Pressable
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.centered}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>Loading profile...</Text>
            </View>
          </View>
        )}

        {/* Error */}
        {error && !loading && (
          <View style={styles.centered}>
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>
                {error}
              </Text>
              <Text style={styles.errorSubtext}>The user profile could not be loaded.</Text>
              <View style={styles.errorActions}>
                <Pressable
                  style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.8 }]}
                  onPress={fetchProfile}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.closeModalButton, pressed && { opacity: 0.8 }]}
                  onPress={() => router.back()}
                >
                  <Text style={styles.closeModalButtonText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Profile Content */}
        {!loading && !error && profileData && (
          <ScrollView
            ref={scrollViewRef}
            style={styles.profileContainer}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.usernameRow}>
                <Text style={styles.usernameText}>{profileData.username}</Text>
                {profileData.countryCode && (
                  <Text style={styles.flag}>{getFlagEmoji(profileData.countryCode)}</Text>
                )}
                {profileData.supporter && (
                  <View style={styles.supporterBadge}>
                    <Text style={styles.supporterText}>SUPPORTER</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Tab Navigation */}
            <View style={styles.tabBar}>
              <Pressable
                style={[styles.tabButton, activeTab === 'profile' && styles.tabButtonActive]}
                onPress={() => setActiveTab('profile')}
              >
                <Text style={styles.tabIcon}>👤</Text>
                <Text style={[styles.tabLabel, activeTab === 'profile' && styles.tabLabelActive]}>
                  Profile
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tabButton, activeTab === 'elo' && styles.tabButtonActive]}
                onPress={() => setActiveTab('elo')}
              >
                <Text style={styles.tabIcon}>🏆</Text>
                <Text style={[styles.tabLabel, activeTab === 'elo' && styles.tabLabelActive]}>
                  ELO
                </Text>
              </Pressable>
            </View>

            {/* Tab Content */}
            {activeTab === 'profile' ? renderProfileTab() : renderEloTab()}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

// ── Progression Graph Sub-component ──────────────────────────

type DateFilter = '7days' | '30days' | 'alltime';

function ProgressionGraph({
  data,
  loading,
  mode,
  screenWidth,
  onChartTouch,
}: {
  data: ProgressionEntry[];
  loading: boolean;
  mode: 'xp' | 'elo';
  screenWidth: number;
  onChartTouch?: (scrollEnabled: boolean) => void;
}) {
  const [viewMode, setViewMode] = useState<'value' | 'rank'>('value');
  const [dateFilter, setDateFilter] = useState<DateFilter>('alltime');

  if (loading) {
    return (
      <View style={styles.glassCard}>
        <View style={{ alignItems: 'center', gap: 16, paddingVertical: 20 }}>
          <ActivityIndicator size="small" color="#4CAF50" />
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontFamily: 'Lexend' }}>
            Loading game history...
          </Text>
        </View>
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={styles.glassCard}>
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontFamily: 'Lexend-SemiBold' }}>
            No stats available
          </Text>
        </View>
      </View>
    );
  }

  // Filter data by date range
  const now = new Date();
  const filteredData = data.filter((entry) => {
    if (dateFilter === 'alltime') return true;
    const entryDate = new Date(entry.timestamp);
    const daysDiff = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
    if (dateFilter === '7days') return daysDiff <= 7;
    if (dateFilter === '30days') return daysDiff <= 30;
    return true;
  });

  // Use at least the last entry if filter yields nothing
  const chartEntries = filteredData.length > 0 ? filteredData : [data[data.length - 1]];

  const isRankMode = viewMode === 'rank';
  const lineColor = isRankMode ? '#2196F3' : '#4CAF50';

  // Extract raw values
  const rawValues = chartEntries.map((entry) => {
    if (mode === 'xp') {
      return isRankMode ? (entry.xpRank ?? 0) : entry.totalXp;
    }
    return isRankMode ? (entry.eloRank ?? 0) : (entry.elo ?? 0);
  });

  const maxVal = Math.max(...rawValues);
  const minVal = Math.min(...rawValues);

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Compute display values and yAxisOffset so chart starts from min, not 0
  let chartValues: number[];
  let yAxisOffset: number;

  if (isRankMode) {
    // Invert so rank #1 is at top: chartValue = (maxVal + 1) - rawRank
    const inverted = rawValues.map((v) => maxVal + 1 - v);
    const invMin = Math.min(...inverted);
    const invMax = Math.max(...inverted);
    const range = invMax - invMin || 1;
    const pad = Math.max(1, Math.floor(range * 0.1));
    yAxisOffset = Math.max(0, invMin - pad);
    chartValues = inverted.map((v) => v - yAxisOffset);
  } else {
    const range = maxVal - minVal || 1;
    const pad = Math.max(1, Math.floor(range * 0.1));
    yAxisOffset = Math.max(0, minVal - pad);
    chartValues = rawValues.map((v) => v - yAxisOffset);
  }

  const chartMax = Math.max(...chartValues);

  // Build chart data — no built-in labels, we render them manually below
  const displayData = chartEntries.map((entry, i) => ({
    value: chartValues[i],
    label: '',
    timestamp: entry.timestamp,
  }));

  // Custom x-axis labels: start, middle, end
  const xLabels: { text: string; position: number }[] = [];
  if (chartEntries.length > 0) {
    const fmt = (idx: number) => {
      const d = new Date(chartEntries[idx].timestamp);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };
    xLabels.push({ text: fmt(0), position: 0 });
    if (chartEntries.length > 2) {
      const mid = Math.floor(chartEntries.length / 2);
      xLabels.push({ text: fmt(mid), position: 0.5 });
    }
    xLabels.push({ text: fmt(chartEntries.length - 1), position: 1 });
  }

  // Total width budget: screenWidth minus all parent padding/margins
  // profileContainer marginHorizontal:12 (×2=24) + border (×2=2)
  // bodyContent padding:20 (×2=40)
  // glassCard padding:24 (×2=48)
  // yAxisLabelWidth: 50
  // = 24 + 2 + 40 + 48 + 50 = 164
  const chartWidth = screenWidth - 170;

  // Title
  const filterSuffix =
    dateFilter === '7days' ? ' (7 Days)' : dateFilter === '30days' ? ' (30 Days)' : ' (All Time)';
  const baseTitle =
    mode === 'xp'
      ? isRankMode ? 'XP Rank Over Time' : 'XP Over Time'
      : isRankMode ? 'ELO Rank Over Time' : 'ELO Over Time';
  const titleText = baseTitle + filterSuffix;

  // Format Y-axis labels — add back yAxisOffset to get real values
  const formatYLabel = (val: string) => {
    const num = Number(val) + yAxisOffset;
    if (isRankMode) {
      // Convert back from inverted: rank = (maxVal + 1) - chartValue
      const rank = Math.round(maxVal + 1 - num);
      if (rank <= 0) return '';
      return `#${rank}`;
    }
    if (num >= 10000) return `${(num / 1000).toFixed(0)}k`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return String(Math.round(num));
  };

  return (
    <View style={styles.glassCard}>
      <Text style={styles.cardTitle}>{titleText}</Text>

      {/* Controls row */}
      <View style={{ gap: 10 }}>
        {/* Date filter pills */}
        <View style={styles.graphToggleRow}>
          <View style={styles.graphTogglePill}>
            {(['7days', '30days', 'alltime'] as DateFilter[]).map((f) => (
              <Pressable
                key={f}
                style={[
                  styles.graphToggleBtn,
                  dateFilter === f && styles.graphToggleBtnActive,
                ]}
                onPress={() => setDateFilter(f)}
              >
                <Text
                  style={[
                    styles.graphToggleText,
                    dateFilter === f && styles.graphToggleTextActive,
                  ]}
                >
                  {f === '7days' ? '7D' : f === '30days' ? '30D' : 'All'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Value/Rank toggle */}
        <View style={styles.graphToggleRow}>
          <View style={styles.graphTogglePill}>
            <Pressable
              style={[
                styles.graphToggleBtn,
                viewMode === 'value' && styles.graphToggleBtnActive,
              ]}
              onPress={() => setViewMode('value')}
            >
              <Text
                style={[
                  styles.graphToggleText,
                  viewMode === 'value' && styles.graphToggleTextActive,
                ]}
              >
                {mode === 'xp' ? 'XP' : 'ELO'}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.graphToggleBtn,
                viewMode === 'rank' && styles.graphToggleBtnActive,
              ]}
              onPress={() => setViewMode('rank')}
            >
              <Text
                style={[
                  styles.graphToggleText,
                  viewMode === 'rank' && styles.graphToggleTextActive,
                ]}
              >
                Rank
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Chart */}
      <View
        style={{ marginTop: 16 }}
        onTouchStart={() => onChartTouch?.(false)}
        onTouchEnd={() => onChartTouch?.(true)}
        onTouchCancel={() => onChartTouch?.(true)}
      >
        <LineChart
          data={displayData}
          width={chartWidth}
          height={220}
          spacing={Math.max(2, (chartWidth - 16) / Math.max(1, chartEntries.length - 1))}
          initialSpacing={8}
          endSpacing={8}
          disableScroll
          color={lineColor}
          thickness={2}
          hideDataPoints={chartEntries.length > 30}
          dataPointsColor={lineColor}
          dataPointsRadius={3}
          areaChart
          startFillColor={lineColor}
          endFillColor={lineColor}
          startOpacity={0.2}
          endOpacity={0.02}
          maxValue={chartMax}
          noOfSections={4}
          rulesColor="rgba(255, 255, 255, 0.08)"
          rulesType="solid"
          yAxisColor="rgba(255, 255, 255, 0.1)"
          xAxisColor="rgba(255, 255, 255, 0.1)"
          yAxisTextStyle={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 10, fontFamily: 'Lexend' }}
          xAxisLabelTextStyle={{ fontSize: 0 }}
          formatYLabel={formatYLabel}
          backgroundColor="transparent"
          yAxisLabelWidth={50}
          pointerConfig={{
            pointerStripColor: 'rgba(255, 255, 255, 0.2)',
            pointerStripWidth: 1,
            pointerColor: lineColor,
            radius: 5,
            pointerLabelWidth: 160,
            pointerLabelHeight: 70,
            activatePointersOnLongPress: false,
            autoAdjustPointerLabelPosition: true,
            persistPointer: true,
            pointerLabelComponent: (items: any, _secondary: any, index: number) => {
              const chartVal = (items[0]?.value ?? 0) + yAxisOffset;
              const realVal = isRankMode
                ? Math.round(maxVal + 1 - chartVal)
                : Math.round(chartVal);
              const displayVal = isRankMode
                ? `#${realVal}`
                : realVal.toLocaleString();
              // Get timestamp from our data
              const ts = displayData[index]?.timestamp;
              const dateStr = ts
                ? (() => {
                    const d = new Date(ts);
                    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
                  })()
                : '';
              return (
                <View
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.9)',
                    borderRadius: 8,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.2)',
                  }}
                >
                  {dateStr ? (
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'Lexend', textAlign: 'center', marginBottom: 2 }}>
                      {dateStr}
                    </Text>
                  ) : null}
                  <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Lexend-Bold', textAlign: 'center' }}>
                    {mode === 'xp'
                      ? (isRankMode ? `Rank: ${displayVal}` : `XP: ${displayVal}`)
                      : (isRankMode ? `Rank: ${displayVal}` : `ELO: ${displayVal}`)}
                  </Text>
                </View>
              );
            },
          }}
        />
        {/* Custom x-axis labels */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 50, marginTop: 4 }}>
          {xLabels.map((l, i) => (
            <Text key={i} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: 'Lexend' }}>
              {l.text}
            </Text>
          ))}
        </View>
      </View>

      <Text style={styles.dataPointsText}>
        {chartEntries.length} data points
      </Text>
    </View>
  );
}

// ── Stat Item Sub-component ──────────────────────────────────

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statItemLabel}>{label}</Text>
      <Text style={styles.statItemValue}>{value}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  safeArea: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  // ── Close Button ─────────────────────────────────────────
  closeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Loading ──────────────────────────────────────────────
  loadingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 48,
    alignItems: 'center',
    gap: 20,
    maxWidth: 400,
    width: '100%',
  },
  loadingText: {
    fontSize: 18,
    fontFamily: 'Lexend-Medium',
    color: '#fff',
  },

  // ── Error ────────────────────────────────────────────────
  errorCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 32,
    alignItems: 'center',
    maxWidth: 500,
    width: '100%',
  },
  errorTitle: {
    fontSize: 22,
    fontFamily: 'Lexend-Bold',
    color: '#ffc107',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 16,
    fontFamily: 'Lexend',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 24,
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 123, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(0, 123, 255, 0.3)',
  },
  retryButtonText: {
    color: '#4dabf7',
    fontSize: 14,
    fontFamily: 'Lexend-Medium',
  },
  closeModalButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    backgroundColor: 'rgba(220, 53, 69, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(220, 53, 69, 0.3)',
  },
  closeModalButtonText: {
    color: '#dc3545',
    fontSize: 14,
    fontFamily: 'Lexend-Medium',
  },

  // ── Profile Container ────────────────────────────────────
  profileContainer: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },

  // ── Header ───────────────────────────────────────────────
  header: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  usernameText: {
    fontSize: 28,
    fontFamily: 'Lexend-Bold',
    color: '#fff',
  },
  flag: {
    fontSize: 22,
  },
  supporterBadge: {
    backgroundColor: '#ffd700',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  supporterText: {
    color: '#000',
    fontSize: 11,
    fontFamily: 'Lexend-Bold',
  },

  // ── Tab Bar ──────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  tabButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  tabIcon: {
    fontSize: 20,
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: 'Lexend-Medium',
    color: '#fff',
  },
  tabLabelActive: {
    fontFamily: 'Lexend-SemiBold',
  },

  // ── Body ─────────────────────────────────────────────────
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // ── Glass Card ───────────────────────────────────────────
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardTitle: {
    fontSize: 24,
    fontFamily: 'Lexend-SemiBold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },

  // ── Profile Tab Stats ────────────────────────────────────
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  statIcon: {
    width: 24,
    marginRight: 12,
  },
  statText: {
    fontSize: 17,
    fontFamily: 'Lexend',
    color: '#fff',
    letterSpacing: 0.3,
  },

  // ── League Visualization ─────────────────────────────────
  leagueContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  leagueItem: {
    alignItems: 'center',
  },
  leagueBox: {
    width: 60,
    height: 55,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  leagueBoxCurrent: {
    borderWidth: 3,
    borderColor: '#ffd700',
    shadowColor: '#ffd700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
    transform: [{ scale: 1.1 }],
  },
  leagueEmoji: {
    fontSize: 32,
  },
  leagueName: {
    fontSize: 13,
    color: '#e0e0e0',
    fontFamily: 'Lexend-SemiBold',
    marginTop: 6,
  },
  leagueNameCurrent: {
    color: '#ffd700',
    fontFamily: 'Lexend-Bold',
  },

  // ── Stats Grid ───────────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  statItemLabel: {
    fontSize: 12,
    color: '#b0b0b0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'Lexend-Medium',
    marginBottom: 6,
  },
  statItemValue: {
    fontSize: 22,
    color: '#ffd700',
    fontFamily: 'Lexend-Bold',
  },

  // ── Graph Toggle ─────────────────────────────────────────
  graphToggleRow: {
    alignItems: 'center',
  },
  graphTogglePill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 25,
    padding: 3,
  },
  graphToggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  graphToggleBtnActive: {
    backgroundColor: '#4CAF50',
  },
  graphToggleText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontFamily: 'Lexend-SemiBold',
    textTransform: 'uppercase',
  },
  graphToggleTextActive: {
    color: '#fff',
  },
  dataPointsText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    fontFamily: 'Lexend',
    textAlign: 'center',
    marginTop: 12,
  },
});
