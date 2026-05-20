import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Share,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { t } from '../../shared/locale';
import { formatCountdown, msUntilLocalMidnight, challengeNumber as computeChallengeNumber } from './dailyDate';
import { quipKey } from './motivationalQuips';
import Stars from './Stars';
import RoundBadges from './RoundBadges';
import ScoreDistributionChart from './ScoreDistributionChart';
import StreakFlameBurst from './StreakFlameBurst';
import { dailyColors } from './styles';

const MAX_PER_ROUND = 5000;
const TOTAL_MAX = 3 * MAX_PER_ROUND;

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

function useAnimatedNumber(target: number, duration = 1200) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof target !== 'number' || !Number.isFinite(target)) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    fromRef.current = display;

    const step = (t: number) => {
      if (!startRef.current) startRef.current = t;
      const elapsed = t - startRef.current;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = fromRef.current + (target - fromRef.current) * eased;
      setDisplay(value);
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return display;
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
  const displayScore = useAnimatedNumber(totalScore);

  const rank = submitResponse?.rank ?? results?.user?.ownRank ?? null;
  const totalPlays = submitResponse?.totalPlays ?? results?.distribution?.totalPlays ?? 0;
  const percentile =
    typeof submitResponse?.percentile === 'number'
      ? submitResponse.percentile
      : typeof rank === 'number' && totalPlays > 1
      ? Math.round(Math.max(0, Math.min(100, ((totalPlays - rank) / (totalPlays - 1)) * 100)))
      : null;
  const displayPercentile = useAnimatedNumber(percentile ?? 0);

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
    const timer = setTimeout(() => setShowFlame(true), 500);
    return () => clearTimeout(timer);
  }, [submitResponse, disqualified]);

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

  // Card entrance.
  const cardScale = useSharedValue(0.96);
  const cardOpacity = useSharedValue(0);
  useEffect(() => {
    cardOpacity.value = withTiming(1, { duration: 400 });
    cardScale.value = withSpring(1, { damping: 14, stiffness: 110 });
  }, []);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

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
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch {
      try {
        await Clipboard.setStringAsync(shareText);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      } catch {
        /* clipboard blocked */
      }
    }
  };

  return (
    <View style={styles.backdrop}>
      {showFlame && <StreakFlameBurst streak={streak} onDone={() => setShowFlame(false)} />}
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <Animated.View style={[styles.card, cardStyle]}>
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
                <Text style={styles.pbRibbonText}>{t('newPersonalBest')}</Text>
              </View>
            )}

            <Text style={styles.headerScore}>
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

          <View style={styles.actions}>
            <Animated.View style={[styles.shareWrap, !shareCopied && sharePulseStyle]}>
              <Pressable onPress={handleShare} style={styles.shareBtn}>
                <LinearGradient
                  colors={shareCopied ? ['#347a37', '#1f4f25'] : ['#2ecc71', '#16864a']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.shareBtnInner}
                >
                  <Ionicons name={shareCopied ? 'checkmark' : 'share-social'} size={18} color="#fff" />
                  <Text style={styles.shareBtnText}>{shareCopied ? t('shareCopied') : t('share')}</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
            <Pressable onPress={onClose} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={16} color="#fff" />
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
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  scrollContent: { paddingHorizontal: 16 },
  card: {
    backgroundColor: 'rgba(12,32,20,0.95)',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxWidth: 720,
    alignSelf: 'stretch',
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
    backgroundColor: 'rgba(255,215,0,0.18)',
    borderColor: 'rgba(255,215,0,0.4)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginVertical: 4,
  },
  pbRibbonText: { color: '#ffd700', fontFamily: 'Lexend-Bold', fontSize: 12 },
  headerScore: {
    color: dailyColors.green,
    fontFamily: 'JockeyOne',
    fontSize: 56,
    lineHeight: 60,
    marginTop: 4,
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
  shareWrap: { flex: 1 },
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
