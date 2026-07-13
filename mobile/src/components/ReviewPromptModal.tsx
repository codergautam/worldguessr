import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Pressable } from './ui/SfxPressable';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated';
import { withTiming, withSpring, withSequence } from './daily/anims';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { t } from '../shared/locale';
import { haptics } from '../services/haptics';

/**
 * Frictionless "rate us" prompt shown on the results screen. One tap on a star
 * rates: 5 stars slides to a short thank-you step (and the parent fires the native
 * store sheet when they tap through), 1–4 slides to an optional in-app feedback box
 * so a low rating never leaves the app. The thank-you step also means a 5-star tap
 * always gets a visible acknowledgement — important in dev/test builds where the
 * native store sheet can't appear (Expo Go / rate-limited), so it no longer looks
 * like the modal just vanished. Styled to match DailyConfirmStartModal (dark glass
 * card, gradient button).
 *
 * The component is "dumb": it reports the user's choice via onRate/onDismiss and
 * the parent (useReviewPrompt) owns persistence, the native call, and analytics.
 */

interface Props {
  visible: boolean;
  /**
   * stars 1–5. For 1–4, `opts.sendFeedback` is true only when the user tapped
   * "Send" (so the parent submits the comment); tapping "Close" skips the send.
   */
  onRate: (stars: number, opts?: { comment?: string; sendFeedback?: boolean }) => void;
  /** Dismissed without rating ("Maybe later" / backdrop on the stars step). */
  onDismiss: () => void;
}

const GOLD = '#FFD700';
const STAR_EMPTY = 'rgba(255,255,255,0.32)';
/** Brief pause after a tap so the fill animation is seen before resolving. */
const RESOLVE_DELAY_MS = 320;
/** How long the 5★ "thank you" shows before the native store sheet auto-opens. */
const THANKS_DELAY_MS = 1500;

function Star({
  index,
  filled,
  onPress,
}: {
  index: number;
  filled: boolean;
  onPress: (index: number) => void;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      hitSlop={8}
      style={styles.starBtn}
      onPress={() => {
        scale.value = withSequence(
          withTiming(1.3, { duration: 110, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 8, stiffness: 220 }),
        );
        onPress(index);
      }}
    >
      <Animated.View style={style}>
        <Ionicons name={filled ? 'star' : 'star-outline'} size={42} color={filled ? GOLD : STAR_EMPTY} />
      </Animated.View>
    </Pressable>
  );
}

export default function ReviewPromptModal({ visible, onRate, onDismiss }: Props) {
  const [step, setStep] = useState<'stars' | 'feedback' | 'thanks'>('stars');
  const [selected, setSelected] = useState(0);
  const [comment, setComment] = useState('');
  const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the 5★ finalise so the auto-timer and a backdrop tap can't both fire it.
  const finishedRef = useRef(false);

  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.92);
  const iconScale = useSharedValue(0.6);

  useEffect(() => {
    if (visible) {
      // Reset to a clean stars step on every open.
      setStep('stars');
      setSelected(0);
      setComment('');
      finishedRef.current = false;
      cardOpacity.value = 0;
      cardScale.value = 0.92;
      iconScale.value = 0.6;
      cardOpacity.value = withTiming(1, { duration: 220 });
      cardScale.value = withSpring(1, { damping: 14, stiffness: 180 });
      iconScale.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.6)) });
    }
    return () => {
      if (resolveTimer.current) clearTimeout(resolveTimer.current);
    };
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));

  const handleStar = (stars: number) => {
    if (resolveTimer.current) return; // ignore taps while a resolve is pending
    haptics.light();
    setSelected(stars);
    resolveTimer.current = setTimeout(() => {
      resolveTimer.current = null;
      if (stars === 5) {
        haptics.success();
        // Show a thank-you beat first; the native store sheet fires when the user
        // taps through (finishFiveStar) so they always see an acknowledgement.
        setStep('thanks');
      } else {
        setStep('feedback');
      }
    }, RESOLVE_DELAY_MS);
  };

  // Feedback step (1–4): "Send" submits the comment to the server; "Close" just
  // finalises the rating locally without sending anything.
  const sendFeedback = () => onRate(selected, { comment, sendFeedback: true });
  const skipFeedback = () => onRate(selected, { sendFeedback: false });

  // Thanks step (5★): finalise the rating; the parent fires the native store sheet.
  // Guarded so the auto-timer below and a stray backdrop tap can't fire it twice.
  const finishFiveStar = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onRate(5);
  };

  // 5★ thank-you auto-advances to the native store sheet after a short read beat,
  // so a happy user reaches the store without an extra tap.
  useEffect(() => {
    if (step !== 'thanks') return;
    const timer = setTimeout(finishFiveStar, THANKS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [step]);

  // Backdrop / hardware back: on the stars step it's a decline; on the feedback or
  // thanks step they've already rated, so finalise instead of declining.
  const handleBackdrop = () => {
    if (resolveTimer.current) return;
    if (step === 'feedback') skipFeedback();
    else if (step === 'thanks') finishFiveStar();
    else onDismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleBackdrop}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable sfx="none" style={styles.overlay} onPress={handleBackdrop}>
          <Animated.View style={[styles.card, cardStyle]}>
            {/* Inner Pressable swallows taps so pressing the card doesn't close it. */}
            <Pressable sfx="none" onPress={() => {}} style={styles.inner}>
              {step === 'stars' ? (
                <>
                  <Animated.View style={[styles.iconWrap, iconStyle]}>
                    <Ionicons name="star" size={30} color={GOLD} />
                  </Animated.View>
                  <Text style={styles.title}>{t('rateUsTitle')}</Text>
                  <Text style={styles.tagline}>{t('rateUsSubtitle')}</Text>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} index={i} filled={i <= selected} onPress={handleStar} />
                    ))}
                  </View>
                  <Pressable onPress={onDismiss} style={styles.laterBtn} hitSlop={6}>
                    <Text style={styles.laterText}>{t('rateUsMaybeLater')}</Text>
                  </Pressable>
                </>
              ) : step === 'feedback' ? (
                <>
                  <Animated.View style={[styles.iconWrap, iconStyle]}>
                    <Ionicons name="chatbubble-ellipses" size={28} color="#ffe27a" />
                  </Animated.View>
                  <Text style={styles.title}>{t('rateUsThanksTitle')}</Text>
                  <Text style={styles.tagline}>{t('rateUsThanksSubtitle')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('rateUsFeedbackPlaceholder')}
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={comment}
                    onChangeText={setComment}
                    multiline
                    maxLength={500}
                    textAlignVertical="top"
                  />
                  <Pressable onPress={sendFeedback} style={styles.primaryBtn}>
                    <LinearGradient
                      colors={['#5cba60', '#347a37']}
                      style={styles.primaryBtnGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                    >
                      <Text style={styles.primaryBtnText}>{t('rateUsSend')}</Text>
                      <Ionicons name="send" size={16} color="#fff" />
                    </LinearGradient>
                  </Pressable>
                  <Pressable onPress={skipFeedback} style={styles.laterBtn} hitSlop={6}>
                    <Text style={styles.laterText}>{t('rateUsSkip')}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Animated.View style={[styles.iconWrap, iconStyle]}>
                    <Ionicons name="heart" size={28} color={GOLD} />
                  </Animated.View>
                  <Text style={styles.title}>{t('rateUsFiveTitle')}</Text>
                  <Text style={styles.tagline}>{t('rateUsFiveSubtitle')}</Text>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Ionicons key={i} name="star" size={28} color={GOLD} style={styles.thanksStar} />
                    ))}
                  </View>
                </>
              )}
            </Pressable>
          </Animated.View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
    paddingTop: 28,
    paddingHorizontal: 26,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  inner: { width: '100%', alignItems: 'center' },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,215,0,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#fff',
    fontFamily: 'Lexend-Bold',
    fontSize: 21,
    textAlign: 'center',
    marginBottom: 6,
  },
  tagline: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Lexend',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 18,
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 14,
  },
  starBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  thanksStar: { marginHorizontal: 2 },
  input: {
    alignSelf: 'stretch',
    minHeight: 84,
    maxHeight: 140,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontFamily: 'Lexend',
    fontSize: 14,
    marginBottom: 16,
  },
  primaryBtn: { width: '100%', borderRadius: 12, overflow: 'hidden' },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.7)',
  },
  primaryBtnText: { color: '#fff', fontFamily: 'Lexend-Bold', fontSize: 16, letterSpacing: 0.3 },
  laterBtn: { alignSelf: 'stretch', paddingVertical: 12, marginTop: 2 },
  laterText: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Lexend',
    fontSize: 14,
    textAlign: 'center',
  },
});
