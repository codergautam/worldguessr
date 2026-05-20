import { View, Text, StyleSheet } from 'react-native';
import { t } from '../../shared/locale';
import { dailyColors } from './styles';

interface HistoryEntry {
  date: string;
  score: number;
}

interface Props {
  history?: HistoryEntry[];
  streakBest?: number;
  personalBest?: number;
  todayScore?: number | null;
}

export default function PersonalRecordsCard({
  history = [],
  streakBest = 0,
  personalBest = 0,
  todayScore = null,
}: Props) {
  const daysPlayed = history.length;
  const todayBroke =
    Number.isFinite(todayScore as number) && (todayScore as number) > 0 && (todayScore as number) >= personalBest;

  if (daysPlayed === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{t('personalRecords')}</Text>
        <Text style={styles.empty}>{t('dailyStartOfJourney')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('personalRecords')}</Text>
      <View style={styles.grid}>
        <View style={styles.row}>
          <Text style={styles.icon}>🏆</Text>
          <Text style={styles.label}>{t('bestScore')}</Text>
          <View style={styles.valueWrap}>
            <Text style={styles.value}>
              {Math.round(Math.max(personalBest, (todayScore as number) || 0)).toLocaleString()}
            </Text>
            {todayBroke && <Text style={styles.newBadge}>{t('newBest')}</Text>}
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.icon}>🔥</Text>
          <Text style={styles.label}>{t('bestStreakLabel')}</Text>
          <Text style={styles.value}>{t('streakDays', { count: streakBest || 0 })}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.icon}>📅</Text>
          <Text style={styles.label}>{t('daysPlayed')}</Text>
          <Text style={styles.value}>{daysPlayed.toLocaleString()}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 14,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  empty: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Lexend',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
  grid: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  icon: { fontSize: 16, width: 22 },
  label: { color: 'rgba(255,255,255,0.75)', fontFamily: 'Lexend', fontSize: 13, flex: 1 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 14 },
  newBadge: {
    color: dailyColors.gold,
    fontFamily: 'Lexend-Bold',
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderRadius: 6,
  },
});
