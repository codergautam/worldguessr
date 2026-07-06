import { type ReactNode } from 'react';
import { View, Text, StyleSheet, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Glassmorphic section card — mirrors web `.daily-landing-section`
 * (`--gradLight` green-tinted gradient over rgba(0,0,0,0.25) + blur + radius 16
 * + shadow). `variant="records"` matches `.daily-records-card` (gold tint).
 */
interface Props {
  title?: string;
  /** Small accessory rendered on the title row's right edge (e.g. the
      landing's leaderboard button — mirrors web
      `.daily-landing-section-title-row`). */
  headerRight?: ReactNode;
  variant?: 'default' | 'records';
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export default function DailySection({ title, headerRight, variant = 'default', style, children }: Props) {
  const isRecords = variant === 'records';
  const grad = isRecords
    ? (['rgba(255,215,0,0.10)', 'rgba(255,122,26,0.06)'] as const)
    : (['rgba(36,87,52,0.34)', 'rgba(36,87,52,0.14)', 'rgba(36,87,52,0)'] as const);

  return (
    <View style={[styles.card, isRecords && styles.cardRecords, style]}>
      <LinearGradient
        colors={grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {title ? (
        headerRight ? (
          <View style={styles.titleRow}>
            <Text style={[styles.title, styles.titleInRow, isRecords && styles.titleRecords]}>{title}</Text>
            {headerRight}
          </View>
        ) : (
          <Text style={[styles.title, isRecords && styles.titleRecords]}>{title}</Text>
        )
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 6 },
    }),
  },
  cardRecords: {
    borderColor: 'rgba(255,215,0,0.22)',
  },
  title: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 18,
    letterSpacing: 0.4,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  titleInRow: {
    marginBottom: 0,
    flexShrink: 1,
  },
  titleRecords: {
    fontFamily: 'JockeyOne',
    fontSize: 21,
    color: '#ffd700',
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
