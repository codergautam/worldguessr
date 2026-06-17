import { useEffect } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { withTiming, withSpring } from './daily/anims';
import { LinearGradient } from 'expo-linear-gradient';
import { t } from '../shared';
import { STORE_URL } from '../services/forceUpdate';

/**
 * Hard, non-dismissible update gate. Shown when the installed build is below the
 * platform's published minimum supported version (see useForceUpdate). Styled to
 * match WhatsNewModal so it feels native to the app, but deliberately has NO way
 * out — no overlay-tap close, no back-button close (onRequestClose is a no-op),
 * no secondary button. The only action is "Update Now" → the store.
 */
export default function ForceUpdateModal({ visible }: { visible: boolean }) {
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.92);

  useEffect(() => {
    if (visible) {
      cardOpacity.value = 0;
      cardScale.value = 0.92;
      cardOpacity.value = withTiming(1, { duration: 220 });
      cardScale.value = withSpring(1, { damping: 14, stiffness: 180 });
    }
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      {/* Plain View, not a Pressable — tapping the backdrop must NOT dismiss. */}
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={styles.icon}>🚀</Text>
          <Text style={styles.title}>
            {t('updateRequiredTitle', undefined, 'Update Required')}
          </Text>
          <Text style={styles.message}>
            {t(
              'updateRequiredMessage',
              undefined,
              'A new version of WorldGuessr is available. Please update to the latest version to keep playing.',
            )}
          </Text>

          <Pressable
            onPress={() => Linking.openURL(STORE_URL).catch(() => {})}
            style={styles.primaryBtn}
          >
            <LinearGradient
              colors={['#5cba60', '#347a37']}
              style={styles.primaryBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            >
              <Text style={styles.primaryBtnText}>
                {t('updateNow', undefined, 'Update Now')}
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: 'rgba(12,32,20,0.97)',
    borderRadius: 22,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  icon: {
    fontSize: 44,
    marginBottom: 10,
  },
  title: {
    color: '#4CAF50',
    fontFamily: 'Lexend-Bold',
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: 'Lexend',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 22,
  },
  primaryBtn: { width: '100%', borderRadius: 12, overflow: 'hidden' },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.7)',
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: 'Lexend-Bold',
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
