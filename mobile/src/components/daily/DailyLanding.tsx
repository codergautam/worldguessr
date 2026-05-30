import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../shared/locale';
import { formatCountdown, msUntilLocalMidnight } from './dailyDate';
import DailyStreakBadge from './DailyStreakBadge';
import DailyLeaderboardPanel from './DailyLeaderboardPanel';
import PersonalRecordsCard from './PersonalRecordsCard';
import DailyHistoryBars14 from './DailyHistoryBars14';
import DailyBackground from './DailyBackground';
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
  const [countdown, setCountdown] = useState(() => msUntilLocalMidnight());

  useEffect(() => {
    const id = setInterval(() => setCountdown(msUntilLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  const playedToday = userData?.playedToday;
  const graceDay = !!userData?.graceDay && !playedToday && (userData?.streak || 0) > 0;

  return (
    <View style={styles.root}>
      <DailyBackground style={StyleSheet.absoluteFill} />
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.headerBar}>
        <Pressable onPress={onClose} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
      </View>

      <StaggerSection delay={animateEntrance ? 0 : 0}>
        <Text style={styles.heroTitle}>{t('dailyLandingTitle')}</Text>

        <Pressable onPress={onStartChallenge} style={styles.cta}>
          <LinearGradient
            colors={playedToday ? ['#347a37', '#1f4f25'] : ['#5cba60', '#347a37']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.ctaInner}
          >
            <View style={styles.ctaTopRow}>
              {!playedToday && <Ionicons name="play" size={16} color="#fff" />}
              <Text style={styles.ctaText}>
                {playedToday
                  ? t('nextChallengeIn', { time: formatCountdown(countdown) })
                  : t('openTodaysChallenge')}
              </Text>
            </View>
            <Text style={styles.ctaSubtitle}>
              {playedToday
                ? t('alreadyPlayedViewResults')
                : t('nextChallengeIn', { time: formatCountdown(countdown) })}
            </Text>
          </LinearGradient>
        </Pressable>

        {graceDay && (
          <View style={styles.graceBanner}>
            <Text style={styles.graceText}>{t('dailyLandingGraceDay', { streak: userData?.streak })}</Text>
          </View>
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

      <StaggerSection delay={animateEntrance ? 80 : 0}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dailyLandingHowItWorks')}</Text>
          <View style={styles.steps}>
            <Step icon="calendar" text={t('dailyLandingStep1')} />
            <Step icon="time" text={t('dailyLandingStep2')} />
            <Step icon="trophy" text={t('dailyLandingStep3')} />
          </View>
        </View>
      </StaggerSection>

      <StaggerSection delay={animateEntrance ? 150 : 0}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('top10Today')}</Text>
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
        </View>
      </StaggerSection>

      <StaggerSection delay={animateEntrance ? 220 : 0}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dailyHistoryTitle')}</Text>
          <PersonalRecordsCard
            history={userData?.history || []}
            streakBest={userData?.streakBest || 0}
            personalBest={userData?.personalBest || 0}
          />
          {(userData?.history?.length || 0) > 0 && (
            <DailyHistoryBars14 history={userData?.history || []} today={today} />
          )}
        </View>
      </StaggerSection>
      </ScrollView>
    </View>
  );
}

function Step({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepIcon}>
        <Ionicons name={icon} size={18} color={dailyColors.green} />
      </View>
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
    fontFamily: 'Lexend-Bold',
    fontSize: 28,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 18,
  },
  cta: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
  },
  ctaInner: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  ctaTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaText: { color: '#fff', fontFamily: 'Lexend-Bold', fontSize: 18 },
  ctaSubtitle: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Lexend', fontSize: 12, marginTop: 4 },
  graceBanner: {
    backgroundColor: 'rgba(255,193,7,0.12)',
    borderColor: 'rgba(255,193,7,0.3)',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  graceText: { color: '#ffd27a', fontFamily: 'Lexend', fontSize: 13, textAlign: 'center' },
  userStats: { alignItems: 'center', gap: 10, marginBottom: 8 },
  signinPrompt: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  signinPromptText: { color: 'rgba(255,255,255,0.8)', fontFamily: 'Lexend', fontSize: 13, textAlign: 'center' },
  signinBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: dailyColors.green, borderRadius: 10 },
  signinBtnText: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 13 },
  section: { marginTop: 24 },
  sectionTitle: {
    color: '#fff',
    fontFamily: 'Lexend-Bold',
    fontSize: 16,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  steps: { gap: 10 },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(76,175,80,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepText: { color: '#fff', fontFamily: 'Lexend', fontSize: 14, flex: 1 },
  empty: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Lexend',
    textAlign: 'center',
    paddingVertical: 16,
  },
});
