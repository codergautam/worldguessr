import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '../../shared/locale';
import { dailyColors } from './styles';

interface Props {
  visible: boolean;
  alreadyDone?: boolean;
  onClose: () => void;
}

export default function DailyDisqualifiedModal({ visible, alreadyDone = false, onClose }: Props) {
  const title = alreadyDone ? t('dailyAlreadyDisqualifiedTitle') : t('dailyDisqualifiedTitle');
  const desc = alreadyDone ? t('dailyAlreadyDisqualifiedDesc') : t('dailyDisqualifiedDesc');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="warning" size={28} color="#ffb060" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.desc}>{desc}</Text>
          <Pressable onPress={onClose} style={styles.btn}>
            <Text style={styles.btnText}>{t('gotIt')}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: 'rgba(12,32,20,0.95)',
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: dailyColors.errorBorder,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,176,96,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { color: '#fff', fontFamily: 'Lexend-Bold', fontSize: 18, textAlign: 'center', marginBottom: 8 },
  desc: { color: 'rgba(255,255,255,0.75)', fontFamily: 'Lexend', fontSize: 13, textAlign: 'center', marginBottom: 18 },
  btn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: dailyColors.green,
    borderRadius: 10,
  },
  btnText: { color: '#fff', fontFamily: 'Lexend-Bold', fontSize: 14 },
});
