import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated';
import { withDelay, withTiming, withRepeat, withSequence } from './anims';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../shared/locale';
import { formatCountdown, msUntilLocalMidnight } from './dailyDate';
import DailyStreakBadge from './DailyStreakBadge';
import DailyLeaderboardPanel from './DailyLeaderboardPanel';
import PersonalRecordsCard from './PersonalRecordsCard';
import DailyHistoryBars14 from './DailyHistoryBars14';
import DailyBackground from './DailyBackground';
import DailySection from './DailySection';
import { dailyColors, dailyTimings } from './styles';

interface Props {
  today: string;
  todayTop10?: Array<{ rank: number; username: string; score: number }>;
  userData?: any;
  onStartChallenge: () => void;
  onSignIn?: () => void;
  onClose: () => void;
  isLoggedIn: boolean;
  animateEntrance?: boolean;
}

function StaggerSection({ delay, children }: { delay: number; children: React.ReactNode }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(24);
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: dailyTimings.landingEntrance, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withTiming(0, { duration: dailyTimings.landingEntrance, easing: Easing.out(Easing.cubic) }));
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function DailyLanding({
  today,
  todayTop10 = [],
  userData,
  onStartChallenge,
  onSignIn,
  onClose,
  isLoggedIn,
  animateEntrance = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [countdown, setCountdown] = useState(() => msUntilLocalMidnight());

  useEffect(() => {
    const id = setInterval(() => setCountdown(msUntilLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  // Grace banner pulse (web dailyLandingGracePulse, 2.4s).
  const gracePulse = useSharedValue(1);
  useEffect(() => {
    gracePulse.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);
  const graceStyle = useAnimatedStyle(() => ({ transform: [{ scale: gracePulse.value }] }));

  const playedToday = userData?.playedToday;
  const graceDay = !!userData?.graceDay && !playedToday && (userData?.streak || 0) > 0;
  const heroSize = Math.max(38, Math.min(46, Math.round(width * 0.115)));

  return (
    <View style={styles.root}>
      <DailyBackground style={StyleSheet.absoluteFill} />
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.headerBar}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
        </View>

        <StaggerSection delay={0}>
          <Text style={[styles.heroTitle, { fontSize: heroSize, lineHeight: heroSize * 1.05 }]}>
            {t('dailyLandingTitle')}
          </Text>

          <Pressable
            onPress={onStartChallenge}
            style={({ pressed }) => [styles.cta, playedToday ? styles.ctaPlayed : styles.ctaDefault, pressed && styles.ctaPressed]}
          >
            <View style={styles.ctaTopRow}>
              {!playedToday && <Ionicons name="play" size={15} color="#fff" style={{ marginRight: 8 }} />}
              <Text style={styles.ctaText}>
                {playedToday
                  ? t('nextChallengeIn', { time: formatCountdown(countdown) })
                  : t('openTodaysChallenge')}
              </Text>
            </View>
            <Text style={[styles.ctaSubtitle, playedToday && styles.ctaSubtitlePlayed]}>
              {playedToday
                ? t('alreadyPlayedViewResults')
                : t('nextChallengeIn', { time: formatCountdown(countdown) })}
            </Text>
          </Pressable>

          {graceDay && (
            <Animated.View style={[styles.graceBanner, graceStyle]}>
              <Text style={styles.graceText}>{t('dailyLandingGraceDay', { streak: userData?.streak })}</Text>
            </Animated.View>
          )}

          <View style={styles.userStats}>
            {(userData?.streak || 0) > 0 && (
              <DailyStreakBadge
                streak={userData.streak}
                size="lg"
                variant={graceDay ? 'at-risk' : playedToday ? 'done' : 'pulsing'}
              />
            )}
            {!isLoggedIn && (
              <View style={styles.signinPrompt}>
                <Text style={styles.signinPromptText}>
                  {(userData?.streak || 0) > 0
                    ? t('dailyLandingLockInStreak', { streak: userData?.streak })
                    : t('dailyLandingLoggedOutPrompt')}
                </Text>
                {onSignIn && (
                  <Pressable onPress={onSignIn} style={styles.signinBtn}>
                    <Text style={styles.signinBtnText}>{t('signIn')}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </StaggerSection>

        <StaggerSection delay={80}>
          <DailySection title={t('dailyLandingHowItWorks')} style={styles.sectionGap}>
            <View style={styles.steps}>
              <Step icon="calendar" text={t('dailyLandingStep1')} />
              <Step icon="time" text={t('dailyLandingStep2')} />
              <Step icon="trophy" text={t('dailyLandingStep3')} />
            </View>
          </DailySection>
        </StaggerSection>

        <StaggerSection delay={150}>
          <DailySection title={t('top10Today')} style={styles.sectionGap}>
            {todayTop10.length > 0 ? (
              <DailyLeaderboardPanel
                top10={todayTop10}
                userRank={userData?.ownRank ?? null}
                userScore={userData?.ownScore ?? null}
                isLoggedIn={isLoggedIn}
                username={userData?.username}
                onSignIn={onSignIn}
              />
            ) : (
              <Text style={styles.empty}>{t('dailyLandingNoWinnersYet')}</Text>
            )}
          </DailySection>
        </StaggerSection>

        <StaggerSection delay={220}>
          <DailySection title={t('dailyHistoryTitle')} style={styles.sectionGap}>
            <PersonalRecordsCard
              history={userData?.history || []}
              streakBest={userData?.streakBest || 0}
              personalBest={userData?.personalBest || 0}
            />
            {(userData?.history?.length || 0) > 0 && (
              <DailyHistoryBars14 history={userData?.history || []} today={today} />
            )}
          </DailySection>
        </StaggerSection>
      </ScrollView>
    </View>
  );
}

function Step({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.step}>
      <Ionicons name={icon} size={20} color="#ffd700" />
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: dailyColors.bgBottom },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 18, paddingBottom: 40 },
  headerBar: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 8 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    color: '#fff',
    fontFamily: 'JockeyOne',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 20,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 8,
  },
  // CTA — mirrors web .daily-landing-cta (solid primary + dark border).
  cta: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1.4,
  },
  ctaDefault: { backgroundColor: '#245734', borderColor: '#112b18' },
  ctaPlayed: { backgroundColor: 'rgba(76,175,80,0.9)', borderColor: 'rgba(76,175,80,0.85)' },
  ctaPressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },
  ctaTopRow: { flexDirection: 'row', alignItems: 'center' },
  ctaText: { color: '#fff', fontFamily: 'Lexend-Medium', fontSize: 18 },
  ctaSubtitle: { color: 'rgba(255,255,255,0.75)', fontFamily: 'Lexend', fontSize: 13, marginTop: 4 },
  ctaSubtitlePlayed: { color: '#e8f7ea', fontFamily: 'Lexend-Medium' },
  graceBanner: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,152,0,0.16)',
    borderColor: 'rgba(255,152,0,0.55)',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    marginBottom: 12,
  },
  graceText: { color: '#ffd28a', fontFamily: 'Lexend-SemiBold', fontSize: 13, textAlign: 'center' },
  userStats: { alignItems: 'center', gap: 10, marginBottom: 8 },
  signinPrompt: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  signinPromptText: { color: 'rgba(255,255,255,0.8)', fontFamily: 'Lexend', fontSize: 13, textAlign: 'center' },
  signinBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: dailyColors.green, borderRadius: 10 },
  signinBtnText: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 13 },
  sectionGap: { marginTop: 20 },
  steps: { gap: 8 },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
  },
  stepText: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Lexend', fontSize: 14, flex: 1 },
  empty: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Lexend',
    textAlign: 'center',
    paddingVertical: 16,
  },
});
