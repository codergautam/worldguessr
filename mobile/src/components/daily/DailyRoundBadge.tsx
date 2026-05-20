import { View, Text, StyleSheet } from 'react-native';
import { t } from '../../shared/locale';
import { dailyColors } from './styles';

interface Props {
  round: number;
  total: number;
}

export default function DailyRoundBadge({ round, total }: Props) {
  const dots = [];
  for (let i = 0; i < total; i++) {
    const status = i < round - 1 ? 'done' : i === round - 1 ? 'current' : 'upcoming';
    dots.push(
      <View
        key={i}
        style={[
          styles.dot,
          status === 'done' && styles.dotDone,
          status === 'current' && styles.dotCurrent,
        ]}
      />,
    );
  }
  return (
    <View style={styles.badge}>
      <Text style={styles.emoji}>🗓</Text>
      <Text style={styles.label}>{t('dailyRoundBadge', { round, total })}</Text>
      <View style={styles.dotRow}>{dots}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 8,
  },
  emoji: {
    fontSize: 14,
  },
  label: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 13,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotDone: {
    backgroundColor: dailyColors.green,
  },
  dotCurrent: {
    backgroundColor: '#fff',
  },
});
