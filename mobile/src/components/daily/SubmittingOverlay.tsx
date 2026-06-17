import { View, Text, ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { t } from '../../shared/locale';
import { dailyColors } from './styles';
import DailyBackground from './DailyBackground';

interface Props {
  /** Passed by the controller so this can overlay the still-mounted game surface. */
  style?: StyleProp<ViewStyle>;
}

export default function SubmittingOverlay({ style }: Props) {
  return (
    <Animated.View entering={FadeIn.duration(320).reduceMotion(ReduceMotion.Never)} style={[styles.container, style]} pointerEvents="auto">
      {/* Translucent warm-green wash over the live Street View — mirrors web's
          .daily-submitting (a soft crossfade, never a hard cut to black). */}
      <DailyBackground variant="overlay" style={StyleSheet.absoluteFill} />
      <View style={styles.card}>
        <ActivityIndicator color={dailyColors.green} size="large" />
        <Text style={styles.title}>{t('dailySubmittingScore')}</Text>
        <Text style={styles.hint}>{t('dailySubmittingHint')}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 32,
    paddingVertical: 28,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  title: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 18, textAlign: 'center' },
  hint: { color: 'rgba(255,255,255,0.6)', fontFamily: 'Lexend', fontSize: 14, textAlign: 'center' },
});
