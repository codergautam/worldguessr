import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { t } from '../../shared/locale';
import { dailyColors } from './styles';

export default function SubmittingOverlay() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <ActivityIndicator color={dailyColors.green} size="large" />
        <Text style={styles.title}>{t('dailySubmittingScore')}</Text>
        <Text style={styles.hint}>{t('dailySubmittingHint')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08120d',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  },
  title: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 18 },
  hint: { color: 'rgba(255,255,255,0.6)', fontFamily: 'Lexend', fontSize: 14 },
});
