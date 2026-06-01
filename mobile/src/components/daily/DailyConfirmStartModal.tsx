import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated';
import { withTiming, withSpring } from './anims';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { t } from '../../shared/locale';
import { dailyColors } from './styles';

interface Props {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DailyConfirmStartModal({ visible, onConfirm, onCancel }: Props) {
  const iconScale = useSharedValue(0.6);
  const iconRotate = useSharedValue(-8);
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.92);

  useEffect(() => {
    if (visible) {
      iconScale.value = 0.6;
      iconRotate.value = -8;
      cardOpacity.value = 0;
      cardScale.value = 0.92;
      cardOpacity.value = withTiming(1, { duration: 220 });
      cardScale.value = withSpring(1, { damping: 14, stiffness: 180 });
      iconScale.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.5)) });
      iconRotate.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.back(1.5)) });
    }
  }, [visible]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }, { rotate: `${iconRotate.value}deg` }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Animated.View style={[styles.card, cardStyle]}>
          {/* Inner wrapper swallows taps so pressing the card doesn't close the
              modal. It must fill the card width so the content + buttons center
              (was shrink-wrapping → left-aligned buttons). */}
          <Pressable onPress={() => {}} style={styles.inner}>
            <Animated.View style={[styles.iconWrap, iconStyle]}>
              <Ionicons name="calendar" size={32} color="#ffe27a" />
            </Animated.View>
            <Text style={styles.title}>{t('dailyChallenge')}</Text>
            <Text style={styles.tagline}>{t('confirmStartDaily')}</Text>
            <View style={styles.warning}>
              <Ionicons name="warning" size={16} color="#ffc107" style={styles.warningIcon} />
              <Text style={styles.warningText}>{t('confirmStartDailyWarning')}</Text>
            </View>
            <Pressable onPress={onConfirm} style={styles.primaryBtn}>
              <LinearGradient
                colors={['#5cba60', '#347a37']}
                style={styles.primaryBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              >
                <Text style={styles.primaryBtnText}>{t('startDailyChallenge')}</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </LinearGradient>
            </Pressable>
            <Pressable onPress={onCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
            </Pressable>
          </Pressable>
        </Animated.View>
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
    borderRadius: 22,
    paddingTop: 30,
    paddingHorizontal: 26,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    alignItems: 'center',
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(76,175,80,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#fff',
    fontFamily: 'Lexend-Bold',
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 6,
  },
  tagline: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Lexend',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: dailyColors.warningBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: dailyColors.warningBorder,
    marginBottom: 22,
  },
  warningIcon: { marginTop: 1 },
  warningText: {
    color: dailyColors.warningText,
    fontFamily: 'Lexend',
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  primaryBtn: { width: '100%', borderRadius: 12, overflow: 'hidden' },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.7)',
  },
  primaryBtnText: { color: '#fff', fontFamily: 'Lexend-Bold', fontSize: 16, letterSpacing: 0.3 },
  cancelBtn: { alignSelf: 'stretch', paddingVertical: 12, marginTop: 4 },
  cancelBtnText: { color: 'rgba(255,255,255,0.6)', fontFamily: 'Lexend', fontSize: 14, textAlign: 'center' },
});
