import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated';
import { withRepeat, withSequence, withTiming } from './anims';
import { LinearGradient } from 'expo-linear-gradient';
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

// "NEW BEST" badge — pulses (web dailyRecordNewPulse: scale 1↔1.06 + glow, 1.8s).
function NewBadge() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <Text style={styles.newBadge}>{t('newBest')}</Text>
    </Animated.View>
  );
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

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={['rgba(255,215,0,0.10)', 'rgba(255,122,26,0.06)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Text style={styles.title}>{t('personalRecords')}</Text>
      {daysPlayed === 0 ? (
        <Text style={styles.empty}>{t('dailyStartOfJourney')}</Text>
      ) : (
        <View style={styles.grid}>
          <View style={styles.row}>
            <Text style={styles.icon}>🏆</Text>
            <Text style={styles.label}>{t('bestScore')}</Text>
            <View style={styles.valueWrap}>
              <Text style={styles.value}>
                {Math.round(Math.max(personalBest, (todayScore as number) || 0)).toLocaleString()}
              </Text>
              {todayBroke && <NewBadge />}
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,215,0,0.22)',
    overflow: 'hidden',
  },
  title: {
    color: '#ffd700',
    fontFamily: 'JockeyOne',
    fontSize: 19,
    marginBottom: 12,
    letterSpacing: 1,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  empty: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Lexend',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  grid: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
  },
  icon: { fontSize: 18, width: 24 },
  label: { color: 'rgba(255,255,255,0.82)', fontFamily: 'Lexend', fontSize: 13, flex: 1 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { color: '#fff', fontFamily: 'Lexend-Bold', fontSize: 14 },
  newBadge: {
    color: '#1a0a00',
    fontFamily: 'Lexend-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: dailyColors.gold,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
