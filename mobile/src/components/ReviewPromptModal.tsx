import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  BackHandler,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Pressable } from './ui/SfxPressable';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  Easing,
  FadeIn,
  FadeInRight,
  FadeOut,
  FadeOutLeft,
  LinearTransition,
  ReduceMotion,
  useReducedMotion,
} from 'react-native-reanimated';
import { withTiming, withSpring, withSequence, withDelay } from './daily/anims';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { t } from '../shared/locale';
import { haptics } from '../services/haptics';
import ConfettiBurst from './onboarding/ConfettiBurst';

/**
 * Frictionless "rate us" prompt shown on the results screen. One tap on a star
 * rates: 5 stars fires a short confetti burst over the card — no text step —
 * while the parent dispatches the native store flow with this card still on
 * screen; 1–4 slides to an optional in-app feedback box so a low rating never
 * leaves the app. The celebration beat means a 5-star tap always gets a
 * visible acknowledgement — important in dev/test builds where the native
 * store sheet can't appear — and it parks the user's fingers, so a stray tap
 * can't land on Apple's sheet while it animates in (a tap there dismisses the
 * sheet instantly). Styled to match DailyConfirmStartModal (dark glass card,
 * gradient button).
 *
 * INLINE OVERLAY — NOT A NATIVE <Modal>, ON PURPOSE (Aug 23): on iOS, RN's
 * Modal is a real presented UIViewController, and Apple silently discards a
 * requestReview() that arrives during (or right after) such a transition;
 * Fabric also never emits onDismiss when a Modal unmounts with its screen,
 * which stranded the old deferred-request workaround and killed nearly every
 * iOS sheet (the 800-vs-30 Android/iOS review split). As a plain absolutely-
 * positioned view, nothing native ever presents or dismisses here, so the
 * parent dispatches the store request onto a static scene with this card
 * still visible. Do NOT convert this back to a native Modal. Android hardware
 * back is a BackHandler subscription (the onRequestClose replacement).
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
  /** Dismissed without rating ("Maybe later" / Android back on the stars step). */
  onDismiss: () => void;
}

const GOLD = '#FFD700';
const STAR_EMPTY = 'rgba(255,255,255,0.32)';
/** Brief pause after a tap so the fill animation is seen before resolving. */
const RESOLVE_DELAY_MS = 320;
/**
 * How long the 5★ thank-you + confetti beat runs before the native store
 * request dispatches. TWO jobs now:
 *  • finger-lift guard (the original job, still the floor): a tap landing
 *    on Apple's sheet while it animates in dismisses it and burns a yearly
 *    quota slot (Apple forum 74869), so never go below ~350ms from the tap;
 *  • reading time (user ruling Aug 23, SUPERSEDES the old "must NOT be
 *    longer" rule): the card now says thank you before Apple asks again —
 *    being hit with a second rating request instantly feels like rating
 *    twice, so the message must actually LAND first. 1300ms reads eight
 *    words comfortably without turning into dead air.
 * Builds with no native sheet get their celebration time from the parent
 * instead (performRate holds the card up on the 'unavailable' path).
 */
const STORE_DISPATCH_DELAY_MS = 1300;
/**
 * The "Maybe later" exit fades in after this beat, so the first moment with
 * the modal is stars-only and a reflex dismissal has nothing to land on.
 * Deliberately NOT a trap: the exit always arrives, and Android's hardware
 * back declines instantly throughout — an inescapable ask converts "not now"
 * users into spite one-stars and burns their single lifetime prompt.
 * The button reserves NO space until then: its wrapper animates from height 0
 * to LATER_BTN_HEIGHT, so the card visibly (and smoothly) grows to admit it
 * instead of opening with a blank slot at the bottom.
 */
const LATER_DELAY_MS = 1600;
/** Fixed height of the "Maybe later" row — the animated-height target. */
const LATER_BTN_HEIGHT = 44;
/** Exit fade for the whole overlay — a plain view fade, no native dismissal. */
const CLOSE_FADE_MS = 180;

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
  const [step, setStep] = useState<'stars' | 'feedback'>('stars');
  // 5★ picked: the card stays fully intact (all five stars filled), confetti
  // flies, and the store dispatch timer runs. Nothing fades early — the one
  // exit fade takes card, stars, copy AND confetti out together (user ruling).
  const [celebrating, setCelebrating] = useState(false);
  const [selected, setSelected] = useState(0);
  const [comment, setComment] = useState('');
  const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the 5★ finalise so the auto-timer and a backdrop tap can't both fire it.
  const finishedRef = useRef(false);
  // Gates "Maybe later" presses while its fade-in is pending — opacity 0 alone
  // would still be tappable.
  const [laterReady, setLaterReady] = useState(false);
  const laterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stays mounted through the exit fade, then leaves the tree entirely.
  const [rendered, setRendered] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const overlayOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.92);
  const iconScale = useSharedValue(0.6);
  const laterOpacity = useSharedValue(0);
  // "Maybe later" reserves no space until it appears: its wrapper animates
  // 0 → LATER_BTN_HEIGHT so the card smoothly grows to admit it.
  const laterHeight = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setRendered(true);
      // Reset to a clean stars step on every open.
      setStep('stars');
      setCelebrating(false);
      setSelected(0);
      setComment('');
      finishedRef.current = false;
      overlayOpacity.value = withTiming(1, { duration: 220 });
      cardOpacity.value = 0;
      cardScale.value = 0.92;
      iconScale.value = 0.6;
      cardOpacity.value = withTiming(1, { duration: 220 });
      cardScale.value = withSpring(1, { damping: 14, stiffness: 180 });
      iconScale.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.6)) });
      setLaterReady(false);
      laterOpacity.value = 0;
      laterHeight.value = 0;
      if (laterTimer.current) clearTimeout(laterTimer.current);
      laterTimer.current = setTimeout(() => {
        laterTimer.current = null;
        setLaterReady(true);
        // Grow the card first, then fade the label into the new space — the
        // staggered pair reads as the card making room, not a pop-in.
        laterHeight.value = withTiming(LATER_BTN_HEIGHT, {
          duration: 260,
          easing: Easing.out(Easing.cubic),
        });
        laterOpacity.value = withDelay(120, withTiming(1, { duration: 220 }));
      }, LATER_DELAY_MS);
    } else {
      // Exit: fade the overlay out in place, then unmount. A plain view fade —
      // deliberately NOT a native dismissal (see header). While fading, the
      // overlay keeps swallowing taps so a stray press can't hit the screen
      // beneath or knock down Apple's sheet mid-presentation. No-op on the
      // initial mount: every value is already 0 and rendered is false.
      overlayOpacity.value = withTiming(0, { duration: CLOSE_FADE_MS });
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        setRendered(false);
      }, CLOSE_FADE_MS + 20);
    }
    return () => {
      if (resolveTimer.current) clearTimeout(resolveTimer.current);
      if (laterTimer.current) clearTimeout(laterTimer.current);
    };
  }, [visible]);

  // Unmount-only safety net for the exit timer.
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));
  const laterStyle = useAnimatedStyle(() => ({
    opacity: laterOpacity.value,
    height: laterHeight.value,
  }));

  // 5★ celebration: the card stays EXACTLY as it looks — no step swap, and
  // deliberately nothing fades early (user ruling: a partial fade before the
  // close read as broken). It gives a happy pop, full-screen confetti mounts,
  // and later the single exit fade takes card and confetti out together. The
  // native store flow fires while all of this is still up (finishFiveStar →
  // parent), so the user always sees an acknowledgement and their fingers are
  // at rest when the sheet lands. "Maybe later" freezes in whatever state it
  // is in: laterReady goes false so it can't be pressed (a dismiss after a
  // rating would corrupt the store), and its arrival timer is cancelled so it
  // can't fade in mid-celebration either.
  const startCelebration = () => {
    setCelebrating(true);
    haptics.success();
    if (laterTimer.current) {
      clearTimeout(laterTimer.current);
      laterTimer.current = null;
    }
    setLaterReady(false);
    cardScale.value = withSequence(
      withTiming(1.04, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 10, stiffness: 220 }),
    );
  };

  // Step hand-off: stars -> feedback (1-4) and stars -> thanks (5★). Travel
  // is one-way (the overlay closes from either destination). Same recipe as
  // AccountSelectSheet's step slide: outgoing content fades left fast,
  // incoming slides in from the right, and the card's height glides between
  // the two sizes via the layout transition on the card below. Reduce Motion
  // crossfades instead. Exiting is attached ONLY to the stars view and
  // entering ONLY to the destination views: an entering on stars would
  // replay over the card's own entrance the first time the overlay opens.
  const reduceMotion = useReducedMotion();
  const NO_RM = ReduceMotion.Never;
  const stepExit = reduceMotion
    ? FadeOut.duration(120)
    : FadeOutLeft.duration(140).reduceMotion(NO_RM);
  const stepEnter = reduceMotion
    ? FadeIn.duration(150)
    : FadeInRight.duration(240).reduceMotion(NO_RM);

  const handleStar = (stars: number) => {
    // Ignore taps while a resolve is pending, and every tap once celebrating
    // (the stars are sliding out to the thank-you step by then).
    if (resolveTimer.current || celebrating) return;
    haptics.light();
    setSelected(stars);
    resolveTimer.current = setTimeout(() => {
      resolveTimer.current = null;
      if (stars === 5) {
        startCelebration();
      } else {
        setStep('feedback');
      }
    }, RESOLVE_DELAY_MS);
  };

  // Feedback step (1–4): "Send" submits the comment to the server; "Close" just
  // finalises the rating locally without sending anything.
  const sendFeedback = () => onRate(selected, { comment, sendFeedback: true });
  const skipFeedback = () => onRate(selected, { sendFeedback: false });

  // 5★ finalise: the parent fires the native store flow with this card (and
  // the confetti) still visible, then hides it.
  // Guarded so the auto-timer below and a stray backdrop tap can't fire it twice.
  const finishFiveStar = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onRate(5);
  };

  // The celebration dispatches the native store flow after the short
  // finger-lift guard — the sheet animates in over the still-visible card and
  // confetti, so a happy user reaches the store about a second after the tap,
  // no extra tap needed.
  useEffect(() => {
    if (!celebrating) return;
    const timer = setTimeout(finishFiveStar, STORE_DISPATCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [celebrating]);

  // Hardware back (Android): a deliberate dismissal. On the stars step it's a
  // decline; celebrating or on the feedback step they've already rated, so
  // finalise instead.
  const handleRequestClose = () => {
    if (resolveTimer.current) return;
    if (celebrating) finishFiveStar();
    else if (step === 'feedback') skipFeedback();
    else onDismiss();
  };

  // Android back button — replaces the native Modal's onRequestClose this used
  // to ride on. Kept separate from handleBackdropPress on purpose. Subscribes
  // per render so the handler closure is never stale.
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleRequestClose();
      return true;
    });
    return () => sub.remove();
  });

  // Backdrop tap: on a busy results screen these are often reflex taps, and a
  // decline burns one of only three auto-ask budget slots — so on the stars
  // step it no longer dismisses. The card pulses to point at the explicit
  // choices (a star or "Maybe later") instead. Celebrating / feedback have
  // already rated, so a backdrop tap there just finalises as before.
  const handleBackdropPress = () => {
    if (resolveTimer.current) return;
    if (celebrating) finishFiveStar();
    else if (step === 'feedback') skipFeedback();
    else {
      haptics.light();
      cardScale.value = withSequence(
        withTiming(1.035, { duration: 90, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 12, stiffness: 260 }),
      );
    }
  };

  if (!rendered) return null;

  return (
    <Animated.View style={[styles.root, overlayStyle]} accessibilityViewIsModal>
      {/* "padding" on BOTH platforms: as an inline overlay this sits on the
          activity window, where edge-to-edge kills Android adjustResize (the
          old native Modal's dialog window resized itself) — same recipe as
          the other inline input overlays (AccountSelectSheet, SetUsernameModal). */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <Pressable sfx="none" style={styles.overlay} onPress={handleBackdropPress}>
          <Animated.View
            style={[styles.card, cardStyle]}
            layout={LinearTransition.duration(240).reduceMotion(NO_RM)}
          >
            {/* Inner Pressable swallows taps so pressing the card doesn't close it. */}
            <Pressable sfx="none" onPress={() => {}} style={styles.inner}>
              {celebrating ? (
                /* 5★: the stars slide out and a plain thank-you takes the
                   card — heading/subheading in the SAME title/tagline styles
                   as every other step (user ruling: no bespoke type) — while
                   the confetti bursts above and STORE_DISPATCH_DELAY_MS gives
                   it time to be READ before Apple's sheet arrives. */
                <Animated.View key="thanks" entering={stepEnter} style={styles.stepBody}>
                  <Animated.View style={[styles.iconWrap, iconStyle]}>
                    <Ionicons name="heart" size={28} color={GOLD} />
                  </Animated.View>
                  <Text style={styles.title}>{t('rateUsFiveTitle')}</Text>
                  <Text style={styles.tagline}>{t('rateUsFiveSubtitle')}</Text>
                </Animated.View>
              ) : step === 'stars' ? (
                <Animated.View key="stars" exiting={stepExit} style={styles.stepBody}>
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
                  <Animated.View style={[styles.laterWrap, laterStyle]}>
                    <Pressable
                      onPress={onDismiss}
                      style={styles.laterBtn}
                      hitSlop={6}
                      disabled={!laterReady}
                    >
                      <Text style={styles.laterText}>{t('rateUsMaybeLater')}</Text>
                    </Pressable>
                  </Animated.View>
                </Animated.View>
              ) : (
                <Animated.View key="feedback" entering={stepEnter} style={styles.stepBody}>
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
                </Animated.View>
              )}
            </Pressable>
          </Animated.View>
        </Pressable>
      </KeyboardAvoidingView>
      {/* Full-screen burst over the card (same component as onboarding
          complete); pointerEvents "none" inside, so backdrop/card taps — and
          the incoming native sheet — are untouched. Mounted fresh per
          celebration, so a constant trigger is fine. */}
      {celebrating && <ConfettiBurst trigger={1} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
  },
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
  // The step wrapper repeats inner's recipe so wrapping the steps for the
  // hand-off animation changed no child's layout.
  stepBody: { width: '100%', alignItems: 'center' },
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
  // Clips the "Maybe later" row while its height animates 0 → LATER_BTN_HEIGHT.
  laterWrap: { alignSelf: 'stretch', overflow: 'hidden' },
  // Fixed height (not padding-derived) so the animated wrapper's target is
  // exact — also used by the feedback step's skip, which is the same row.
  laterBtn: { alignSelf: 'stretch', height: LATER_BTN_HEIGHT, justifyContent: 'center' },
  laterText: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Lexend',
    fontSize: 14,
    textAlign: 'center',
  },
});
