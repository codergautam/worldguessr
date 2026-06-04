import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '../../shared/locale';
import DailyStreakBadge from './DailyStreakBadge';
import { useDailyMenuStatus } from './useDailyMenuStatus';
import { dailyColors } from './styles';

interface Props {
  secret: string | null;
  onPress: () => void;
}

export default function DailyMenuItem({ secret, onPress }: Props) {
  const { streak, variant } = useDailyMenuStatus(secret);

  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      onPress={onPress}
    >
      <View style={styles.icon}>
        <Ionicons name="calendar" size={22} color="#fff" />
      </View>
      <View style={styles.middle}>
        <Text style={styles.label}>{t('dailyChallenge')}</Text>
        {streak > 0 && (
          <View style={styles.badgeRow}>
            <DailyStreakBadge streak={streak} variant={variant} />
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: 'rgba(76,175,80,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.4)',
    marginVertical: 6,
  },
  buttonPressed: { opacity: 0.7 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dailyColors.green,
    justifyContent: 'center',
    alignItems: 'center',
  },
  middle: { flex: 1 },
  label: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 16,
  },
  badgeRow: { marginTop: 4 },
});
