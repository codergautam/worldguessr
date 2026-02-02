import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, getLeague } from '../../src/shared';
import { api } from '../../src/services/api';
import { commonStyles, spacing, fontSizes, borderRadius } from '../../src/styles/theme';

interface LeaderboardEntry {
  rank: number;
  username: string;
  elo?: number;
  totalXp?: number;
  countryCode?: string;
}

type LeaderboardMode = 'xp' | 'elo';
type TimePeriod = 'allTime' | 'daily';

function LeaderboardRow({ entry, mode, onPress }: {
  entry: LeaderboardEntry;
  mode: LeaderboardMode;
  onPress: () => void;
}) {
  const league = entry.elo ? getLeague(entry.elo) : null;
  const isTopThree = entry.rank <= 3;
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && commonStyles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View style={[
        styles.rankContainer,
        isTopThree && { backgroundColor: rankColors[entry.rank - 1] + '33' },
      ]}>
        <Text style={[
          styles.rank,
          isTopThree && { color: rankColors[entry.rank - 1] },
        ]}>
          {entry.rank}
        </Text>
      </View>

      <View style={styles.userInfo}>
        <View style={styles.usernameRow}>
          <Text style={styles.username}>{entry.username}</Text>
          {entry.countryCode && (
            <Text style={styles.flag}>
              {getFlagEmoji(entry.countryCode)}
            </Text>
          )}
        </View>
        {mode === 'elo' && league && (
          <Text style={[styles.league, { color: league.color }]}>
            {league.emoji} {league.name}
          </Text>
        )}
      </View>

      <Text style={styles.score}>
        {mode === 'xp'
          ? `${(entry.totalXp ?? 0).toLocaleString()} XP`
          : entry.elo?.toLocaleString() ?? '—'
        }
      </Text>
    </Pressable>
  );
}

function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function SegmentedControl<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.segmentedControl}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          style={[
            styles.segment,
            selected === option.value && styles.segmentSelected,
          ]}
          onPress={() => onSelect(option.value)}
        >
          <Text
            style={[
              styles.segmentText,
              selected === option.value && styles.segmentTextSelected,
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<LeaderboardMode>('xp');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('allTime');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const response = await api.leaderboard({
        mode,
        pastDay: timePeriod === 'daily',
      });
      setEntries(response.leaderboard);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode, timePeriod]);

  useEffect(() => {
    setLoading(true);
    fetchLeaderboard();
  }, [mode, timePeriod]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const handleUserPress = (username: string) => {
    router.push(`/user/${username}`);
  };

  return (
    <SafeAreaView style={commonStyles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Leaderboard</Text>
      </View>

      <View style={styles.controls}>
        <SegmentedControl
          options={[
            { value: 'xp', label: 'XP' },
            { value: 'elo', label: 'ELO' },
          ]}
          selected={mode}
          onSelect={setMode}
        />

        <SegmentedControl
          options={[
            { value: 'allTime', label: 'All Time' },
            { value: 'daily', label: 'Today' },
          ]}
          selected={timePeriod}
          onSelect={setTimePeriod}
        />
      </View>

      {loading ? (
        <View style={commonStyles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => `${item.rank}-${item.username}`}
          renderItem={({ item }) => (
            <LeaderboardRow
              entry={item}
              mode={mode}
              onPress={() => handleUserPress(item.username)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="trophy-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyText}>No entries yet</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes['2xl'],
    fontWeight: 'bold',
    color: colors.text,
  },
  controls: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: borderRadius.md,
    padding: spacing.xs,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  segmentSelected: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    color: colors.textMuted,
  },
  segmentTextSelected: {
    color: colors.white,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rankContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  rank: {
    fontSize: fontSizes.md,
    fontWeight: 'bold',
    color: colors.text,
  },
  userInfo: {
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  username: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.text,
  },
  flag: {
    fontSize: fontSizes.sm,
  },
  league: {
    fontSize: fontSizes.xs,
    marginTop: spacing.xs,
  },
  score: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
  },
  emptyText: {
    fontSize: fontSizes.lg,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
});
