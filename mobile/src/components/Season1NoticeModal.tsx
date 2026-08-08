import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable } from './ui/SfxPressable';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { withTiming, withSpring } from './daily/anims';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, formatNumber, t } from '../shared';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '../constants/config';
import { fetchWithTimeout } from '../services/fetchWithTimeout';
import { haptics } from '../services/haptics';

/**
 * SEASON 1 FIRST-LOGIN NOTICE (native)
 *
 * The native twin of components/season1NoticeModal.js. Same copy (both platforms
 * read public/locales/en/common.json through the @locales alias, so the strings
 * are literally the same file), same beat schedule, same single dismissal.
 * This is deliberately a MIRROR and not a second design: the web timings below
 * are copied constant-for-constant so a player who sees it on phone and a player
 * who sees it in a browser experience the same moment.
 *
 * DISPLAY ONLY. Every Stamp shown here was already applied by the migration
 * script. This component reads numbers and stamps a date.
 *
 * THE MIGRATION GRANTS NO XP. It used to pay up to 2.35M per account, and this
 * modal had a second gift tile for it. That was cut because it redefined what XP
 * means and put a vertical cliff through every veteran's XP graph. If the tile is
 * ever wanted back, the grant has to come back first.
 */

export interface EloNotice {
  /** Season 0 closing rating (`elo_s0`). */
  oldElo: number;
  /** Season 0 career high (`seasonPeakElo`). DIFFERENT from oldElo, and higher. */
  peakElo: number;
  /** The Season 1 rating the migration wrote. */
  newElo: number;
  /** Server-computed tier name for newElo. */
  league?: string | null;
  stampsGranted: number;
  ogBadge?: boolean;
}

/** Post-mount grace before the card appears. Mirrors web ENTER_DELAY_MS. */
const ENTER_DELAY_MS = 1100;

// Beat schedule, measured from the card appearing. Identical to web.
const BEAT_PEAK_MS = 350;
const BEAT_RATING_MS = 1500;
const BEAT_GIFTS_MS = 3300;
const BEAT_TAIL_MS = 4200;

const PEAK_COUNT_MS = 1000;
const RATING_COUNT_MS = 1600;
const GIFT_COUNT_MS = 900;

const GOLD = '#FFD700';

/** Ease-out cubic — the curve web's roundOverScreen counts with. */
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

/**
 * Accounts dismissed in THIS process. The server is the real once-per-account
 * latch (it stops sending eloNotice after the ack), but the in-memory user
 * object keeps its copy for the life of the app session, so without this a
 * remount of the home screen would replay the modal. Deliberately NOT persisted:
 * if the ack request failed, the next cold start SHOULD show it again and retry.
 */
const dismissedThisSession = new Set<string>();

/** House count-up: 30Hz interval, not per-frame. Matches EloChangeDisplay. */
function useCountUp(from: number, to: number, durationMs: number, active: boolean) {
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (!active) {
      setValue(from);
      return;
    }
    if (from === to) {
      setValue(to);
      return;
    }
    const startTime = Date.now();
    const id = setInterval(() => {
      const progress = Math.min((Date.now() - startTime) / durationMs, 1);
      setValue(Math.round(from + (to - from) * easeOutCubic(progress)));
      if (progress >= 1) {
        clearInterval(id);
        setValue(to);
      }
    }, 33);
    return () => clearInterval(id);
  }, [from, to, durationMs, active]);

  return value;
}

interface Props {
  /** Force it open for design review (long-press affordances, dev only). */
  forceNotice?: EloNotice;
}

export default function Season1NoticeModal({ forceNotice }: Props) {
  const secret = useAuthStore((s) => s.secret);
  const accountId = useAuthStore((s) => s.user?.accountId);
  const storeNotice = useAuthStore((s) => s.user?.eloNotice as EloNotice | undefined);

  const notice = forceNotice || storeNotice || null;
  const latchKey = accountId || secret || '';
  const alreadyDismissed = !forceNotice && !!latchKey && dismissedThisSession.has(latchKey);
  const hasNotice = !!notice && !alreadyDismissed;

  const [visible, setVisible] = useState(false);
  const [beat, setBeat] = useState(0);
  const dismissedRef = useRef(false);

  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.92);

  const oldElo = Number(notice?.oldElo ?? 0);
  const peakElo = Number(notice?.peakElo ?? 0);
  const newElo = Number(notice?.newElo ?? 0);
  const stampsGranted = Number(notice?.stampsGranted ?? 0);

  // Delayed entrance + beat schedule. One effect owns every timer.
  useEffect(() => {
    if (!hasNotice) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        setVisible(true);
        cardOpacity.value = 0;
        cardScale.value = 0.92;
        cardOpacity.value = withTiming(1, { duration: 220 });
        cardScale.value = withSpring(1, { damping: 14, stiffness: 180 });
        setBeat(1);
        timers.push(setTimeout(() => setBeat(2), BEAT_PEAK_MS));
        timers.push(setTimeout(() => setBeat(3), BEAT_RATING_MS));
        timers.push(setTimeout(() => setBeat(4), BEAT_GIFTS_MS));
        timers.push(setTimeout(() => setBeat(5), BEAT_TAIL_MS));
      }, ENTER_DELAY_MS),
    );

    return () => timers.forEach(clearTimeout);
  }, [hasNotice]);

  // Peak counts UP from zero (a trophy, earned on screen). The Season 1 rating
  // counts DOWN from the Season 0 close, because that transition IS the message:
  // 1,600 on its own reads as a bug, 20,000 becoming 1,600 reads as a conversion.
  const peakDisplay = useCountUp(0, peakElo, PEAK_COUNT_MS, beat >= 2);
  const ratingDisplay = useCountUp(oldElo, newElo, RATING_COUNT_MS, beat >= 3);
  const stampsDisplay = useCountUp(0, stampsGranted, GIFT_COUNT_MS, beat >= 4);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const handleDismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    haptics.light();

    // Close FIRST, always. A failed ack must never trap the user on this screen.
    setVisible(false);
    if (latchKey) dismissedThisSession.add(latchKey);

    if (forceNotice || !secret) return;

    fetchWithTimeout(`${API_URL}/api/eloNoticeAck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: secret }),
    })
      .then((res) => {
        // Nothing to persist on success: the SERVER stops sending eloNotice from
        // here on, which is what makes this once-per-account rather than
        // once-per-device. On failure we persist nothing either, so the next
        // cold start shows it again and retries rather than losing it.
        if (!res.ok) throw new Error(`ack failed: ${res.status}`);
      })
      .catch((err) => {
        console.warn('[season1] notice ack failed, will retry next login', err);
      });
  };

  if (!hasNotice || !visible) return null;

  // Stamps are the only gift: the migration grants no XP. See the file header.
  const showGifts = stampsGranted > 0;

  return (
    // No onRequestClose dismissal and no backdrop press: one way out, the button.
    // Android hardware back is swallowed by the empty handler for the same reason.
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, cardStyle]}>
          <SafeAreaView edges={['bottom']} style={styles.safe}>
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.block, beat >= 1 && styles.blockIn]}>
                <Text style={styles.title}>{t('season1NoticeTitle')}</Text>
                <Text style={styles.body}>{t('season1NoticeIntro')}</Text>
              </View>

              <View style={[styles.stat, beat >= 2 && styles.blockIn]}>
                <Text style={styles.label}>{t('season1NoticePeakLabel')}</Text>
                <Text style={[styles.number, styles.numberPeak]}>{formatNumber(peakDisplay)}</Text>
                <Text style={styles.note}>{t('season1NoticePeakNote')}</Text>
              </View>

              <View style={[styles.stat, beat >= 3 && styles.blockIn]}>
                <Text style={styles.label}>{t('season1NoticeNewLabel')}</Text>
                <View style={styles.numberRow}>
                  <Text style={styles.number}>{formatNumber(ratingDisplay)}</Text>
                  {!!notice?.league && beat >= 4 && (
                    <View style={styles.leaguePill}>
                      <Text style={styles.leagueText}>{notice.league}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.note}>{t('season1NoticeNewNote')}</Text>
              </View>

              {showGifts && (
                <View style={[styles.gifts, beat >= 4 && styles.blockIn]}>
                  <View style={styles.gift}>
                    <Text style={styles.giftValue}>
                      +{formatNumber(stampsDisplay)}{' '}
                      <Text style={styles.giftUnit}>{t('season1NoticeStampsUnit')}</Text>
                    </Text>
                    <Text style={styles.note}>{t('season1NoticeStampsNote')}</Text>
                  </View>
                </View>
              )}

              {!!notice?.ogBadge && (
                <View style={[styles.og, beat >= 5 && styles.blockIn]}>
                  <View style={styles.ogTag}>
                    <Text style={styles.ogTagText}>OG</Text>
                  </View>
                  <Text style={styles.ogText}>{t('season1NoticeOg')}</Text>
                </View>
              )}

              <Text style={[styles.legend, beat >= 5 && styles.blockIn]}>
                {t('season1NoticeLegend')}
              </Text>
            </ScrollView>

            <Pressable onPress={handleDismiss} style={styles.primaryBtn}>
              <LinearGradient
                colors={['#5cba60', '#347a37']}
                style={styles.primaryBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              >
                <Text style={styles.primaryBtnText}>{t('season1NoticeContinue')}</Text>
              </LinearGradient>
            </Pressable>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  card: {
    backgroundColor: 'rgba(12,32,20,0.97)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    width: '100%',
    maxWidth: 440,
    maxHeight: '92%',
    paddingTop: 24,
    paddingHorizontal: 22,
    paddingBottom: 16,
  },
  // SafeAreaView inside the card (not around the overlay): the card is already
  // inset by the overlay padding, so only the BOTTOM edge can collide with the
  // home indicator, and only when the card grows to its 92% cap.
  safe: { flexShrink: 1 },
  bodyScroll: { alignSelf: 'stretch', flexGrow: 0, marginBottom: 16 },
  bodyContent: { paddingBottom: 4, gap: 16 },

  // Beat reveal. RN has no CSS transition, so the staged blocks are simply
  // opacity 0 until their beat. Kept as plain style objects rather than a
  // reanimated value per block: five shared values driving five fades is more
  // machinery than a one-shot reveal is worth, and it keeps the JSX readable.
  block: { opacity: 0 },
  blockIn: { opacity: 1 },

  title: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: 22,
    lineHeight: 29,
    marginBottom: 8,
  },
  body: {
    color: 'rgba(255,255,255,0.82)',
    fontFamily: 'Lexend',
    fontSize: 14,
    lineHeight: 21,
  },

  stat: {
    opacity: 0,
    backgroundColor: colors.primaryTransparent,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  label: {
    color: 'rgba(255,255,255,0.62)',
    fontFamily: 'Lexend',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  numberRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  number: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: 34,
    lineHeight: 41,
  },
  numberPeak: { color: GOLD },
  leaguePill: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  leagueText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Lexend',
    fontSize: 13,
  },
  note: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Lexend',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },

  gifts: { opacity: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gift: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 170,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  giftValue: {
    color: colors.success,
    fontFamily: 'Lexend-Bold',
    fontSize: 20,
  },
  giftUnit: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Lexend',
    fontSize: 15,
  },

  og: {
    opacity: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
    backgroundColor: 'rgba(255,215,0,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ogTag: {
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.5)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ogTagText: {
    color: GOLD,
    fontFamily: 'Lexend-Bold',
    fontSize: 12,
    letterSpacing: 1.2,
  },
  ogText: {
    flex: 1,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Lexend',
    fontSize: 13,
    lineHeight: 19,
  },

  legend: {
    opacity: 0,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Lexend',
    fontSize: 13,
    lineHeight: 19,
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
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
