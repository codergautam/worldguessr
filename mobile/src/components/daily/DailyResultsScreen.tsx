import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Share,
  Platform,
  useWindowDimensions,
  Animated as RNAnimated,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated';
import { withTiming, withRepeat, withSequence } from './anims';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { t } from '../../shared/locale';
import { haptics, hapticForScore } from '../../services/haptics';
import { formatCountdown, msUntilLocalMidnight, challengeNumber as computeChallengeNumber } from './dailyDate';
import { quipKey } from './motivationalQuips';
import Stars from './Stars';
import Shine from './Shine';
import RoundBadges from './RoundBadges';
import ScoreDistributionChart from './ScoreDistributionChart';
import StreakFlameBurst from './StreakFlameBurst';
import { dailyColors } from './styles';
import { MAX_PER_ROUND, TOTAL_MAX } from '@shared/daily/constants';
import { derivePercentile } from '@shared/daily/percentile';

interface Round {
  score: number;
  distance?: number | null;
  timeMs?: number | null;
  guessLat?: number | null;
  guessLng?: number | null;
  country?: string | null;
}

interface Props {
  date: string;
  rounds: Round[];
  locations?: Array<{ lat: number; long: number }>;
  totalScore: number;
  submitResponse?: any;
  results?: any;
  loadingResults?: boolean;
  isLoggedIn: boolean;
  disqualified?: boolean;
  onClose: () => void;
}

function useAnimatedNumber(target: number, duration = 1200): [number, boolean] {
  const [display, setDisplay] = useState(0);
  const [animating, setAnimating] = useState(false);
  const rafRef = useRef<number | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof target !== 'number' || !Number.isFinite(target)) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (settleRef.current) clearTimeout(settleRef.current);
    startRef.current = null;
    fromRef.current = display;
    setAnimating(true);

    const step = (t: number) => {
      if (!startRef.current) startRef.current = t;
      const elapsed = t - startRef.current;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = fromRef.current + (target - fromRef.current) * eased;
      setDisplay(value);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        // Keep the glow for a beat after the count lands (web parity).
        settleRef.current = setTimeout(() => setAnimating(false), 300);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, [target]);

  return [display, animating];
}

export default function DailyResultsScreen({
  date,
  rounds,
  locations = [],
  totalScore,
  submitResponse,
  results,
  loadingResults,
  isLoggedIn,
  disqualified = false,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const stackActions = width < 380;
  const [displayScore, scoreAnimating] = useAnimatedNumber(totalScore);

  const rank = submitResponse?.rank ?? results?.user?.ownRank ?? null;
  const totalPlays = submitResponse?.totalPlays ?? results?.distribution?.totalPlays ?? 0;
  const percentile =
    typeof submitResponse?.percentile === 'number'
      ? submitResponse.percentile
      : derivePercentile(rank, totalPlays);
  const [displayPercentile] = useAnimatedNumber(percentile ?? 0);

  const [shareCopied, setShareCopied] = useState(false);
  const [countdown, setCountdown] = useState(() => msUntilLocalMidnight());

  useEffect(() => {
    const id = setInterval(() => setCountdown(msUntilLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  // Confetti via Reanimated particle burst on PB / perfect round.
  const showConfetti = useMemo(() => {
    return !!submitResponse?.newPersonalBest || (rounds?.length && rounds.some((r) => r.score >= 4850));
  }, [submitResponse, rounds]);

  // Flame burst on streak start/extend.
  const [showFlame, setShowFlame] = useState(false);
  const flameShownRef = useRef(false);
  useEffect(() => {
    if (flameShownRef.current) return;
    if (disqualified) return;
    if (!submitResponse || !(submitResponse.streak > 0)) return;
    flameShownRef.current = true;
    const timer = setTimeout(() => {
      setShowFlame(true);
      haptics.success(); // celebratory streak buzz as the flame bursts in
    }, 500);
    return () => clearTimeout(timer);
  }, [submitResponse, disqualified]);

  // Score-graded buzz the moment the headline counter finishes counting up.
  // Normalize the daily total onto the per-guess 0–5000 scale so it maps onto
  // the same intensity tiers as a single great/poor guess.
  const scoreLandedRef = useRef(false);
  const prevScoreAnimating = useRef(false);
  useEffect(() => {
    if (prevScoreAnimating.current && !scoreAnimating && !scoreLandedRef.current) {
      scoreLandedRef.current = true;
      if (!disqualified && totalScore > 0) {
        hapticForScore((totalScore / TOTAL_MAX) * 5000);
      }
    }
    prevScoreAnimating.current = scoreAnimating;
  }, [scoreAnimating, totalScore, disqualified]);

  const chNum = useMemo(() => computeChallengeNumber(date), [date]);
  const dateLabel = useMemo(() => {
    try {
      const d = new Date(`${date}T00:00:00`);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return date;
    }
  }, [date]);

  const streak = submitResponse?.streak ?? results?.user?.streak ?? 0;
  const newPB = submitResponse?.newPersonalBest;
  const graceUsed = submitResponse?.graceUsed;
  const quip = t(quipKey(totalScore, date));
  const distribution = results?.distribution;

  // Backdrop crossfade — fades the blurred translucent backdrop in over the
  // still-mounted final-round Street View (mirrors web's
  // dailyResultsBackdropFadeIn), so results appear smoothly instead of
  // snapping to black.
  // Core Animated (not Reanimated) so the entrance ALWAYS plays — Reanimated
  // honours OS "Reduce Motion" and was snapping the modal in with no transition.
  // Snappy (~160ms) to match the app's screen transitions.
  const backdropOpacity = useRef(new RNAnimated.Value(0)).current;
  const cardScale = useRef(new RNAnimated.Value(0.96)).current;
  const cardOpacity = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(backdropOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      RNAnimated.timing(cardOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      RNAnimated.spring(cardScale, { toValue: 1, friction: 8, tension: 180, useNativeDriver: true }),
    ]).start();
  }, []);
  const backdropStyle = { opacity: backdropOpacity };
  const cardStyle = { opacity: cardOpacity, transform: [{ scale: cardScale }] };

  // Share button idle pulse.
  const sharePulse = useSharedValue(1);
  useEffect(() => {
    sharePulse.value = withRepeat(
      withSequence(
        withTiming(1.025, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);
  const sharePulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: sharePulse.value }] }));

  const handleShare = async () => {
    haptics.light();
    const cleanDate = (dateLabel || '').replace(/[‎‏‪-‮]/g, '');
    const title = t('dailyShareTitleDate', { date: cleanDate });
    const maxScore = (rounds?.length || 3) * MAX_PER_ROUND;
    const scoreLine =
      typeof percentile === 'number'
        ? t('dailyShareScoreLinePct', { score: Math.round(totalScore), max: maxScore, pct: percentile })
        : t('dailyShareAnonLine', { score: Math.round(totalScore), max: maxScore });
    const emojis = (rounds || [])
      .map((r) => {
        if (r.score >= 3000) return '🟢';
        if (r.score >= 1500) return '🟡';
        return '🔴';
      })
      .join('');
    const url = 'https://worldguessr.com/daily';
    const shareText = `${title}\n${scoreLine}\n${emojis}\n${url}`;

    try {
      const result = await Share.share({ message: shareText });
      if (result.action === Share.dismissedAction) {
        await Clipboard.setStringAsync(shareText);
        haptics.success();
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch {
      try {
        await Clipboard.setStringAsync(shareText);
        haptics.success();
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      } catch {
        /* clipboard blocked */
      }
    }
  };

  return (
    <RNAnimated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="auto">
      <BlurView
        intensity={Platform.OS === 'android' ? 24 : 40}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      {/* Translucent tint over the blur — keeps the design legible even if
          Android blur degrades, matching web's rgba(0,0,0,0.45) backdrop. */}
      <View style={styles.tintScrim} pointerEvents="none" />
      {showFlame && <StreakFlameBurst streak={streak} onDone={() => setShowFlame(false)} />}
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <RNAnimated.View style={[styles.card, cardStyle]}>
          <LinearGradient
            colors={['rgba(36,87,52,0.20)', 'rgba(36,87,52,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>

          <View style={styles.heroSection}>
            <Text style={styles.headerLabel}>
              {t('challengeNumber', { num: chNum })} · {dateLabel}
            </Text>

            {disqualified && (
              <View style={styles.dqRibbon}>
                <Text style={styles.dqRibbonText}>{t('dailyDisqualifiedRibbon')}</Text>
              </View>
            )}

            {!disqualified && newPB && (
              <View style={styles.pbRibbon}>
                <LinearGradient
                  colors={['#ffd700', '#ffb300', '#ffd700']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
                <Shine duration={2500} intensity={0.7} />
                <Text style={styles.pbRibbonText}>{t('newPersonalBest')}</Text>
              </View>
            )}

            <Text style={[styles.headerScore, scoreAnimating && styles.headerScoreGlow]}>
              {Math.round(displayScore).toLocaleString()}
              <Text style={styles.headerScoreMax}> / {TOTAL_MAX.toLocaleString()}</Text>
            </Text>

            <Stars score={totalScore} />

            {!!quip && <Text style={styles.quip}>&ldquo;{quip}&rdquo;</Text>}

            <View style={styles.streakRow}>
              {streak > 0 && (
                <Text style={styles.streakRowText}>
                  🔥 {t('streakDay', { count: streak })}
                </Text>
              )}
              {graceUsed && (
                <Text style={styles.graceUsed}>· {t('streakGraceUsed')}</Text>
              )}
            </View>
          </View>

          {submitResponse?.alreadySubmitted && (
            <Text style={styles.alreadyPlayed}>{t('alreadyPlayedToday')}</Text>
          )}

          <RoundBadges
            rounds={rounds}
            roundAverages={distribution?.roundAverages || []}
            locations={locations}
            allowMapLinks
          />

          <View style={styles.statCard}>
            <Text style={styles.statTitle}>{t('dailyScoreDistribution')}</Text>
            {(distribution?.totalPlays || 0) >= 10 ? (
              <ScoreDistributionChart
                buckets={distribution?.buckets || []}
                totalPlays={distribution?.totalPlays || 0}
                userScore={totalScore}
              />
            ) : (
              <Text style={styles.distEmpty}>{t('tooFewPlaysForChart')}</Text>
            )}
            <View style={styles.distMeta}>
              <Text style={styles.distMetaText}>
                {t('averageScoreToday', { avg: distribution?.avgScore || 0 })}
              </Text>
              <Text style={styles.distMetaText}>
                {t('sampleSize', { count: (distribution?.totalPlays || 0).toLocaleString() })}
              </Text>
            </View>
            {typeof percentile === 'number' && typeof rank === 'number' && (distribution?.totalPlays || 0) > 1 && percentile >= 20 && (
              <View style={styles.distStanding}>
                <Text style={styles.distStandingPct}>
                  {t('beatPctPlayers', { pct: Math.round(displayPercentile) })}
                </Text>
                <Text style={styles.distStandingRank}>
                  {t('rankOfTotal', { rank, total: (distribution?.totalPlays || totalPlays).toLocaleString() })}
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.actions, stackActions && styles.actionsStacked]}>
            <Animated.View
              style={[stackActions ? styles.shareWrapStacked : styles.shareWrap, !shareCopied && sharePulseStyle]}
            >
              <Pressable onPress={handleShare} style={styles.shareBtn}>
                <LinearGradient
                  colors={shareCopied ? ['#1f9d55', '#15703a'] : ['#2ecc71', '#1f9d55', '#16864a']}
                  locations={shareCopied ? [0, 1] : [0, 0.55, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.shareBtnInner}
                >
                  <Ionicons name={shareCopied ? 'checkmark' : 'share-social'} size={18} color="#fff" />
                  <Text style={styles.shareBtnText}>{shareCopied ? t('shareCopied') : t('share')}</Text>
                </LinearGradient>
                {!shareCopied && <Shine duration={3400} intensity={0.4} />}
              </Pressable>
            </Animated.View>
            <Pressable onPress={onClose} style={[styles.backBtn, stackActions && styles.backBtnStacked]}>
              <Ionicons name="close" size={16} color="#fff" />
              <Text style={styles.backBtnText}>{t('backToHome')}</Text>
            </Pressable>
          </View>

          <Text style={styles.countdown}>
            {countdown > 0
              ? t('nextChallengeIn', { time: formatCountdown(countdown) })
              : t('newChallengeReady')}
          </Text>

          {loadingResults && (
            <Text style={styles.loadingDots}>…</Text>
          )}
        </RNAnimated.View>
      </ScrollView>
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  tintScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  scroll: { flex: 1 },
  // Top-aligned (not centered): the results card is tall and must stay fully
  // scrollable — centering a card taller than the viewport clips its top.
  scrollContent: { paddingHorizontal: 16 },
  card: {
    backgroundColor: 'rgba(8,20,13,0.90)',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  heroSection: { alignItems: 'center', marginTop: 4 },
  headerLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  dqRibbon: {
    backgroundColor: dailyColors.errorBg,
    borderColor: dailyColors.errorBorder,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginVertical: 4,
  },
  dqRibbonText: { color: '#ff7b7b', fontFamily: 'Lexend-SemiBold', fontSize: 12 },
  pbRibbon: {
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    marginVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pbRibbonText: {
    color: '#1a0a00',
    fontFamily: 'Lexend-Bold',
    fontSize: 12,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(255,255,255,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  headerScore: {
    color: dailyColors.green,
    fontFamily: 'JockeyOne',
    fontSize: 56,
    lineHeight: 60,
    marginTop: 4,
  },
  headerScoreGlow: {
    textShadowColor: 'rgba(76,175,80,0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  headerScoreMax: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'JockeyOne',
    fontSize: 22,
  },
  quip: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Lexend',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  streakRowText: { color: '#ffb060', fontFamily: 'Lexend-SemiBold', fontSize: 14 },
  graceUsed: { color: '#ffd27a', fontFamily: 'Lexend', fontSize: 12 },
  alreadyPlayed: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    fontFamily: 'Lexend',
    fontSize: 12,
    marginTop: 4,
  },
  statCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginTop: 6,
  },
  statTitle: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 13, marginBottom: 8, letterSpacing: 0.5 },
  distEmpty: { color: 'rgba(255,255,255,0.5)', fontFamily: 'Lexend', fontSize: 12, paddingVertical: 18, textAlign: 'center' },
  distMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  distMetaText: { color: 'rgba(255,255,255,0.55)', fontFamily: 'Lexend', fontSize: 11 },
  distStanding: { marginTop: 12, alignItems: 'center', gap: 4 },
  distStandingPct: { color: dailyColors.gold, fontFamily: 'Lexend-Bold', fontSize: 16 },
  distStandingRank: { color: 'rgba(255,255,255,0.7)', fontFamily: 'Lexend', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18, alignItems: 'center' },
  actionsStacked: { flexDirection: 'column', alignItems: 'stretch' },
  shareWrap: { flex: 1 },
  shareWrapStacked: { alignSelf: 'stretch' },
  shareBtn: { borderRadius: 12, overflow: 'hidden' },
  shareBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  shareBtnText: { color: '#fff', fontFamily: 'Lexend-Bold', fontSize: 15 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  backBtnStacked: { justifyContent: 'center' },
  backBtnText: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 13 },
  countdown: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'Lexend',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
  },
  loadingDots: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 6 },
});
