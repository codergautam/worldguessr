import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/shared';
import { commonStyles, spacing, fontSizes, borderRadius } from '../../src/styles/theme';

interface RoundResult {
  guessLat: number;
  guessLong: number;
  actualLat?: number;
  actualLong?: number;
  points: number;
  distance: number;
  timeTaken?: number;
}

export default function GameResultsScreen() {
  const { totalScore, rounds } = useLocalSearchParams<{
    totalScore: string;
    rounds: string;
  }>();
  const router = useRouter();

  const parsedRounds: RoundResult[] = rounds ? JSON.parse(rounds) : [];
  const score = parseInt(totalScore ?? '0', 10);
  const maxScore = parsedRounds.length * 5000;
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  const getScoreColor = () => {
    if (percentage >= 80) return colors.success;
    if (percentage >= 50) return colors.warning;
    return colors.error;
  };

  const formatDistance = (km: number): string => {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  };

  const handlePlayAgain = () => {
    router.replace({
      pathname: '/game/[id]',
      params: {
        id: 'singleplayer',
        map: 'all',
        rounds: '5',
        time: '60',
      },
    });
  };

  const handleGoHome = () => {
    router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Game Complete!</Text>
        </View>

        {/* Score Card */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreCircle}>
            <Text style={[styles.scoreValue, { color: getScoreColor() }]}>
              {score.toLocaleString()}
            </Text>
            <Text style={styles.scoreMax}>/ {maxScore.toLocaleString()}</Text>
          </View>
          <Text style={styles.scorePercentage}>{percentage}% accuracy</Text>
        </View>

        {/* Round Breakdown */}
        <Text style={styles.sectionTitle}>Round Breakdown</Text>
        <View style={styles.roundsList}>
          {parsedRounds.map((round, index) => (
            <View key={index} style={styles.roundCard}>
              <View style={styles.roundHeader}>
                <Text style={styles.roundNumber}>Round {index + 1}</Text>
                <Text style={[
                  styles.roundPoints,
                  { color: round.points >= 4000 ? colors.success : round.points >= 2000 ? colors.warning : colors.error }
                ]}>
                  {round.points.toLocaleString()} pts
                </Text>
              </View>
              <Text style={styles.roundDistance}>
                {formatDistance(round.distance)} away
              </Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && { opacity: 0.8 },
            ]}
            onPress={handlePlayAgain}
          >
            <Ionicons name="refresh" size={20} color={colors.white} />
            <Text style={styles.primaryButtonText}>Play Again</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleGoHome}
          >
            <Ionicons name="home" size={20} color={colors.text} />
            <Text style={styles.secondaryButtonText}>Home</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing['2xl'],
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  title: {
    fontSize: fontSizes['3xl'],
    fontWeight: 'bold',
    color: colors.text,
  },
  scoreCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing['2xl'],
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  scoreCircle: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  scoreMax: {
    fontSize: fontSizes.lg,
    color: colors.textMuted,
  },
  scorePercentage: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  roundsList: {
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  roundCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  roundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  roundNumber: {
    fontSize: fontSizes.md,
    fontWeight: '500',
    color: colors.text,
  },
  roundPoints: {
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  roundDistance: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  actions: {
    gap: spacing.md,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  primaryButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.white,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  secondaryButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '500',
    color: colors.text,
  },
});
