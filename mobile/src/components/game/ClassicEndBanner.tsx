import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../shared';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';

interface Props {
  round: number;
  totalRounds: number;
  points: number;
  xpEarned?: number;
  distance?: number | null;
  didGuess?: boolean;
  onNext: () => void;
  isFinal?: boolean;
  factText?: string;
  compact?: boolean;
}

function formatDistance(km?: number | null) {
  if (km == null) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

function getPointsColor(points: number) {
  if (points >= 4000) return colors.success;
  if (points >= 2000) return colors.warning;
  return colors.error;
}

export default function ClassicEndBanner({
  round,
  totalRounds,
  points,
  xpEarned = 0,
  distance,
  didGuess = true,
  onNext,
  isFinal,
  factText,
  compact,
}: Props) {
  const distanceText = !didGuess
    ? "You didn't guess"
    : distance != null
      ? `Your guess was ${formatDistance(distance)} away`
      : '';

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={styles.round}>
        Round {round}/{totalRounds}
      </Text>
      {distanceText ? <Text style={styles.distance}>{distanceText}</Text> : null}
      <Text style={[styles.points, { color: getPointsColor(points) }]}>
        {points.toLocaleString()} points
      </Text>
      {xpEarned > 0 ? (
        <View style={styles.xpChip}>
          <Text style={styles.xpChipText}>+{xpEarned} XP</Text>
        </View>
      ) : null}
      {factText ? <Text style={styles.fact}>{factText}</Text> : null}
      <Pressable onPress={onNext} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.nextBtn}
        >
          <Text style={styles.nextBtnText}>{isFinal ? 'View Results' : 'Next Round'}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(17, 43, 24, 0.92)',
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  wrapCompact: {
    paddingVertical: spacing.md,
  },
  round: {
    color: 'rgba(255,255,255,0.68)',
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.xs,
  },
  distance: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes.lg,
    textAlign: 'center',
  },
  points: {
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes['2xl'],
  },
  xpChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 193, 7, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.35)',
  },
  xpChipText: {
    color: colors.warning,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes.xs,
  },
  fact: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Lexend',
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  nextBtn: {
    marginTop: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    borderRadius: borderRadius.lg,
    minWidth: 180,
    alignItems: 'center',
  },
  nextBtnText: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes.md,
  },
});
