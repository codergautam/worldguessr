import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ImageBackground,
  Animated,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, getLeague } from '../../src/shared';
import { useAuthStore } from '../../src/store/authStore';
import { useGoogleAuth } from '../../src/hooks/useGoogleAuth';
import { api } from '../../src/services/api';
import { spacing, borderRadius } from '../../src/styles/theme';
import SetUsernameModal from '../../src/components/SetUsernameModal';
import CountryFlag from '../../src/components/CountryFlag';

type GameMode = 'singleplayer' | 'rankedDuel' | 'unrankedDuel' | 'createGame' | 'joinGame' | 'communityMaps';

interface MenuButtonProps {
  label: string;
  onPress: () => void;
  delay: number;
}

function MenuButton({ label, onPress, delay }: MenuButtonProps) {
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 350,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        transform: [{ translateX: slideAnim }],
        opacity: opacityAnim,
      }}
    >
      <Pressable
        style={({ pressed }) => [
          styles.menuButton,
          pressed && styles.menuButtonPressed,
        ]}
        onPress={onPress}
      >
        <Text style={styles.menuButtonText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function OutlinedTitle({ children }: { children: string }) {
  const offsets = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];

  return (
    <View>
      {offsets.map((offset, i) => (
        <Text
          key={i}
          style={[
            styles.title,
            styles.titleStroke,
            { left: offset.x, top: offset.y },
          ]}
        >
          {children}
        </Text>
      ))}
      <Text style={[styles.title, styles.titleShadow]}>{children}</Text>
      <Text style={styles.title}>{children}</Text>
    </View>
  );
}

// Module-level flags so moderation popup only shows once per app session
let modPopupDismissedBan = false;
let modPopupDismissedNameChange = false;

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { promptAsync, isReady: googleReady } = useGoogleAuth();

  // ELO data fetching & animation (matches web home.js:298-367)
  const [eloData, setEloData] = useState<{ elo: number; rank: number; league: ReturnType<typeof getLeague> } | null>(null);
  const [animatedElo, setAnimatedElo] = useState(0);
  const [loginLoading, setLoginLoading] = useState(false);
  const [dismissedBanBanner, setDismissedBanBanner] = useState(modPopupDismissedBan);
  const [dismissedNameChangeBanner, setDismissedNameChangeBanner] = useState(modPopupDismissedNameChange);
  const [modPopupReady, setModPopupReady] = useState(false);
  const modPopupAnim = useRef(new Animated.Value(0)).current;

  const titleAnim = useRef(new Animated.Value(0)).current;
  const titleSlide = useRef(new Animated.Value(-30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(titleAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(titleSlide, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Fetch fresh ELO data when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user?.username) return;

    // Use session data as initial fallback
    if (user.elo && !eloData) {
      setEloData({
        elo: user.elo,
        rank: 0,
        league: getLeague(user.elo),
      });
    }

    // Fetch fresh data
    api.eloRank(user.username)
      .then((data) => {
        if (data && data.elo !== undefined) {
          setEloData({
            elo: data.elo,
            rank: data.rank,
            league: getLeague(data.elo),
          });
        }
      })
      .catch(() => {});
  }, [isAuthenticated, user?.username]);

  // Animated ELO counter (matches web home.js:348-367)
  useEffect(() => {
    if (!eloData?.elo) return;

    const interval = setInterval(() => {
      setAnimatedElo((prev) => {
        const diff = eloData.elo - prev;
        const step = Math.ceil(Math.abs(diff) / 10) || 1;
        if (diff > 0) return Math.min(prev + step, eloData.elo);
        if (diff < 0) return Math.max(prev - step, eloData.elo);
        return prev;
      });
    }, 10);

    return () => clearInterval(interval);
  }, [eloData?.elo]);

  // Reset ELO state on logout
  useEffect(() => {
    if (!isAuthenticated) {
      setEloData(null);
      setAnimatedElo(0);
    }
  }, [isAuthenticated]);

  // Delay moderation popup to avoid flashbang on load
  const showModPopup = !!(
    (user?.pendingNameChange && !dismissedNameChangeBanner) ||
    (user?.banned && !user?.pendingNameChange && !dismissedBanBanner)
  );
  useEffect(() => {
    if (showModPopup && !modPopupReady) {
      const timer = setTimeout(() => {
        setModPopupReady(true);
        Animated.timing(modPopupAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }, 800);
      return () => clearTimeout(timer);
    }
    if (!showModPopup) {
      setModPopupReady(false);
      modPopupAnim.setValue(0);
    }
  }, [showModPopup]);

  const handleLogin = useCallback(async () => {
    if (loginLoading || authLoading) return;
    setLoginLoading(true);
    try {
      await promptAsync();
    } catch (e) {
      console.error('Google login error:', e);
    } finally {
      setLoginLoading(false);
    }
  }, [promptAsync, loginLoading, authLoading]);

  const handleModePress = (mode: GameMode) => {
    switch (mode) {
      case 'singleplayer':
        router.push({
          pathname: '/game/[id]',
          params: { id: 'singleplayer', map: 'all', rounds: '5' },
        });
        break;
      case 'rankedDuel':
        router.push({
          pathname: '/game/[id]',
          params: { id: 'ranked-duel', map: 'all', rounds: '5', time: '60' },
        });
        break;
      case 'unrankedDuel':
        router.push({
          pathname: '/game/[id]',
          params: { id: 'unranked-duel', map: 'all', rounds: '5', time: '60' },
        });
        break;
      case 'createGame':
        break;
      case 'joinGame':
        break;
      case 'communityMaps':
        router.navigate('/(tabs)/maps');
        break;
    }
  };

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  let buttonIndex = 0;
  const getDelay = () => {
    buttonIndex++;
    return 150 + buttonIndex * 60;
  };

  const loggedIn = isAuthenticated && !!user?.username;

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/street2.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      />
      <View style={styles.darkOverlay} />
      <LinearGradient
        colors={[
          'rgba(20, 65, 25, 0.95)',
          'rgba(20, 65, 25, 0.8)',
          'rgba(20, 65, 25, 0.5)',
          'rgba(20, 65, 25, 0.2)',
          'transparent',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradientOverlay}
      />

      <SafeAreaView style={styles.content} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          {/* Header */}
          <View style={styles.header}>
            <Animated.View
              style={{
                opacity: titleAnim,
                transform: [{ translateX: titleSlide }, { translateY: 30 }],
              }}
            >
              <OutlinedTitle>WorldGuessr</OutlinedTitle>
            </Animated.View>

            {/* Right side: account area */}
            <View style={styles.headerRight}>
              {loggedIn ? (
                <>
                  {/* Top row: Username + Friends button */}
                  <View style={styles.loggedInRow}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.accountBtn,
                        pressed && styles.accountBtnPressed,
                      ]}
                      onPress={() => router.navigate('/(tabs)/account')}
                    >
                      <View style={styles.accountBtnContent}>
                        <Text style={styles.accountBtnText}>{user.username}</Text>
                        {user.countryCode && (
                          <CountryFlag countryCode={user.countryCode} size={18} />
                        )}
                      </View>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.friendBtn,
                        pressed && styles.friendBtnPressed,
                      ]}
                      onPress={() => router.push('/friends')}
                    >
                      <Ionicons name="people" size={22} color={colors.white} />
                    </Pressable>
                  </View>

                  {/* ELO/League button below */}
                  {eloData && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.leagueBtn,
                        { backgroundColor: eloData.league.color },
                        pressed && styles.leagueBtnPressed,
                      ]}
                      onPress={() => router.navigate('/(tabs)/account')}
                    >
                      <Text style={styles.leagueBtnText}>
                        {animatedElo} ELO {eloData.league.emoji}
                      </Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.accountBtn,
                    pressed && styles.accountBtnPressed,
                    (loginLoading || authLoading) && styles.accountBtnDisabled,
                  ]}
                  onPress={handleLogin}
                  disabled={loginLoading || authLoading || !googleReady}
                >
                  <View style={styles.accountBtnContent}>
                    {loginLoading || authLoading ? (
                      <>
                        <Text style={styles.accountBtnText}>Login</Text>
                        <ActivityIndicator size="small" color={colors.white} />
                      </>
                    ) : (
                      <>
                        <Ionicons name="logo-google" size={14} color={colors.white} />
                        <Text style={styles.accountBtnText}>Login</Text>
                      </>
                    )}
                  </View>
                </Pressable>
              )}
            </View>
          </View>

          {/* Menu */}
          <View style={styles.menu}>
            <View style={styles.divider} />

            <View style={styles.menuGroup}>
              <MenuButton
                label="Singleplayer"
                onPress={() => handleModePress('singleplayer')}
                delay={getDelay()}
              />
              {isAuthenticated && (
                <MenuButton
                  label="Ranked Duel"
                  onPress={() => handleModePress('rankedDuel')}
                  delay={getDelay()}
                />
              )}
              <MenuButton
                label={isAuthenticated ? 'Unranked Duel' : 'Find Duel'}
                onPress={() => handleModePress('unrankedDuel')}
                delay={getDelay()}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.menuGroup}>
              <MenuButton
                label="Create Game"
                onPress={() => handleModePress('createGame')}
                delay={getDelay()}
              />
              <MenuButton
                label="Join Game"
                onPress={() => handleModePress('joinGame')}
                delay={getDelay()}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.menuGroup}>
              <MenuButton
                label="Community Maps"
                onPress={() => handleModePress('communityMaps')}
                delay={getDelay()}
              />
            </View>
          </View>

          {/* Bottom Icons */}
          <View style={[styles.bottomIcons, isLandscape && styles.bottomIconsLandscape]}>
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              onPress={() => router.navigate('/(tabs)/leaderboard')}
            >
              <Ionicons name="trophy" size={24} color="rgba(255,255,255,0.85)" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              onPress={() => {}}
            >
              <Ionicons name="settings-outline" size={24} color="rgba(255,255,255,0.85)" />
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Moderation Popup - animated in after delay */}
      {modPopupReady && (
        <Animated.View
          style={[styles.modPopupOverlay, { opacity: modPopupAnim }]}
          pointerEvents="auto"
        >
          <Animated.View
            style={[
              styles.modPopupCard,
              user?.pendingNameChange
                ? styles.modPopupCardWarning
                : styles.modPopupCardError,
              {
                opacity: modPopupAnim,
                transform: [{
                  scale: modPopupAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  }),
                }],
              },
            ]}
          >
            {/* Name Change Required */}
            {user?.pendingNameChange && (
              <>
                <Text style={styles.modPopupEmoji}>⚠️</Text>
                <Text style={[styles.modPopupTitle, { color: '#ff9800' }]}>
                  Username Change Required
                </Text>
                {user.pendingNameChangePublicNote && (
                  <View style={styles.modPopupReasonBox}>
                    <Text style={styles.modPopupReasonLabel}>REASON</Text>
                    <Text style={styles.modPopupReasonText}>
                      {user.pendingNameChangePublicNote}
                    </Text>
                  </View>
                )}
                <Text style={styles.modPopupDesc}>
                  Your username has been flagged as inappropriate. Please change it from your profile.
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.modPopupActionBtn, { backgroundColor: '#ff9800' }, pressed && { opacity: 0.8 }]}
                  onPress={() => {
                    { modPopupDismissedNameChange = true; setDismissedNameChangeBanner(true); };
                    router.navigate('/(tabs)/account');
                  }}
                >
                  <Text style={[styles.modPopupActionBtnText, { color: '#000' }]}>Change Name</Text>
                </Pressable>
              </>
            )}

            {/* Account Banned */}
            {user?.banned && !user?.pendingNameChange && (
              <>
                <Text style={styles.modPopupEmoji}>⛔</Text>
                <Text style={[styles.modPopupTitle, { color: '#f44336' }]}>
                  {user.banType === 'temporary' ? 'Account Temporarily Suspended' : 'Account Suspended'}
                </Text>
                {user.banType === 'temporary' && user.banExpiresAt && (
                  <Text style={styles.modPopupExpires}>
                    Expires: {new Date(user.banExpiresAt).toLocaleString()}
                  </Text>
                )}
                {user.banPublicNote && (
                  <View style={styles.modPopupReasonBox}>
                    <Text style={styles.modPopupReasonLabel}>REASON</Text>
                    <Text style={styles.modPopupReasonText}>{user.banPublicNote}</Text>
                  </View>
                )}
                <Text style={styles.modPopupDesc}>
                  {user.banType === 'temporary'
                    ? 'Your account has been temporarily suspended. You will regain access when the suspension expires.'
                    : 'Your account has been permanently suspended.'}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.modPopupActionBtn, { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }, pressed && { opacity: 0.8 }]}
                  onPress={() => {
                    { modPopupDismissedBan = true; setDismissedBanBanner(true); };
                    router.navigate('/(tabs)/account');
                  }}
                >
                  <Text style={styles.modPopupActionBtnText}>View Details</Text>
                </Pressable>
              </>
            )}

            {/* Dismiss button */}
            <Pressable
              style={({ pressed }) => [styles.modPopupDismissBtn, pressed && { opacity: 0.7 }]}
              onPress={() => {
                Animated.timing(modPopupAnim, {
                  toValue: 0,
                  duration: 200,
                  useNativeDriver: true,
                }).start(() => {
                  if (user?.pendingNameChange) { modPopupDismissedNameChange = true; setDismissedNameChangeBanner(true); }
                  else { modPopupDismissedBan = true; setDismissedBanBanner(true); }
                });
              }}
            >
              <Text style={styles.modPopupDismissBtnText}>Dismiss</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}

      {/* Set Username Modal for new signups */}
      <SetUsernameModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1a0c',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 42,
    fontFamily: 'JockeyOne',
    color: colors.white,
    letterSpacing: 0,
  },
  titleStroke: {
    position: 'absolute',
    color: 'black',
  },
  titleShadow: {
    position: 'absolute',
    color: 'black',
    left: 2,
    top: 2,
  },
  // Logged-in top row: [Username] [Friends]
  loggedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Account button
  accountBtn: {
    backgroundColor: 'rgba(36, 87, 52, 0.85)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  accountBtnPressed: {
    backgroundColor: 'rgba(36, 87, 52, 1)',
  },
  accountBtnDisabled: {
    opacity: 0.7,
  },
  accountBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accountBtnText: {
    color: colors.white,
    fontSize: 17,
    fontFamily: 'Lexend-Bold',
    lineHeight: 20,
  },
  // Friends button - square, next to username (matches web .friendBtnFixed)
  friendBtn: {
    backgroundColor: 'rgba(36, 87, 52, 0.85)',
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendBtnPressed: {
    backgroundColor: colors.primary,
  },
  // ELO/League button - below username row (matches web .leagueBtn)
  leagueBtn: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.md,
    alignSelf: 'flex-end',
  },
  leagueBtnPressed: {
    opacity: 0.8,
  },
  leagueBtnText: {
    color: colors.white,
    fontSize: 13,
    fontFamily: 'Lexend-Bold',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Menu
  menu: {
    flexGrow: 1,
    paddingTop: spacing.md,
    maxWidth: 300,
  },
  menuGroup: {
    gap: 0,
  },
  divider: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
    marginVertical: 8,
    width: '90%',
  },
  menuButton: {
    paddingVertical: 10,
  },
  menuButtonPressed: {
    opacity: 0.7,
  },
  menuButtonText: {
    fontSize: 24,
    fontFamily: 'Lexend',
    fontWeight: '400',
    color: colors.white,
  },
  // Bottom icons
  bottomIcons: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: spacing.xl,
    paddingTop: spacing.lg,
  },
  bottomIconsLandscape: {
    paddingBottom: spacing.md,
  },
  iconButton: {
    width: 50,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(20, 65, 25, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 7,
    elevation: 8,
  },
  iconButtonPressed: {
    backgroundColor: 'rgba(20, 65, 25, 0.75)',
  },
  // Moderation popup
  modPopupOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 9999,
  },
  modPopupCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  modPopupCardWarning: {
    backgroundColor: '#1a1a0a',
    borderWidth: 2,
    borderColor: '#ff9800',
  },
  modPopupCardError: {
    backgroundColor: '#1a0a0a',
    borderWidth: 2,
    borderColor: '#f44336',
  },
  modPopupEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  modPopupTitle: {
    fontSize: 20,
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  modPopupExpires: {
    color: '#ffd700',
    fontSize: 14,
    fontFamily: 'Lexend-Medium',
    marginBottom: 12,
  },
  modPopupReasonBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 12,
    width: '100%',
    marginBottom: 12,
  },
  modPopupReasonLabel: {
    color: '#888',
    fontSize: 10,
    fontFamily: 'Lexend-Medium',
    marginBottom: 4,
  },
  modPopupReasonText: {
    color: '#e0e0e0',
    fontSize: 14,
    fontFamily: 'Lexend',
    lineHeight: 20,
  },
  modPopupDesc: {
    color: '#999',
    fontSize: 13,
    fontFamily: 'Lexend',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  modPopupActionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 8,
  },
  modPopupActionBtnText: {
    color: '#fff',
    fontFamily: 'Lexend-Bold',
    fontSize: 14,
  },
  modPopupDismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  modPopupDismissBtnText: {
    color: '#666',
    fontFamily: 'Lexend',
    fontSize: 13,
  },
});
