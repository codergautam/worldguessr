import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ImageBackground,
  useWindowDimensions,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { getFlagEmoji, ProgressionEntry } from './shared';
import ProfileTab from './ProfileTab';
import EloTab from './EloTab';
import GameHistoryTab from './GameHistoryTab';
import FriendsTab from './FriendsTab';
import ModerationTab from './ModerationTab';
import CountrySelectorModal from './CountrySelectorModal';

type TabKey = 'profile' | 'history' | 'elo' | 'friends' | 'moderation';

interface Tab {
  key: TabKey;
  label: string;
  icon: string;
}

const OWN_TABS: Tab[] = [
  { key: 'profile', label: 'Profile', icon: '👤' },
  { key: 'history', label: 'History', icon: '📜' },
  { key: 'elo', label: 'ELO', icon: '🏆' },
  { key: 'friends', label: 'Friends', icon: '👥' },
  { key: 'moderation', label: 'Moderation', icon: '⚖️' },
];

const PUBLIC_TABS: Tab[] = [
  { key: 'profile', label: 'Profile', icon: '👤' },
  { key: 'elo', label: 'ELO', icon: '🏆' },
];

interface ProfileData {
  username: string;
  elo: number;
  totalXp: number;
  gamesPlayed?: number;
  gamesLen?: number;
  createdAt?: string;
  profileViews?: number;
  countryCode?: string;
  supporter?: boolean;
  rank?: number;
  canChangeUsername?: boolean;
  daysUntilNameChange?: number;
  recentChange?: boolean;
  duelStats?: {
    wins: number;
    losses: number;
    ties: number;
    winRate: number;
  };
}

interface EloData {
  elo: number;
  rank: number;
  duels_wins: number;
  duels_losses: number;
  duels_tied: number;
  win_rate: number;
}

interface ProfileViewProps {
  isOwnProfile: boolean;
  secret?: string;
  user?: {
    username: string;
    elo?: number;
    totalXp?: number;
    totalGamesPlayed?: number;
    countryCode?: string;
    supporter?: boolean;
    staff?: boolean;
  };
  onLogout?: () => void;
  onRefreshUser?: () => void;
  // Public profile
  username?: string;
  // Navigation
  onBack?: () => void;
  onNavigateToUser?: (username: string) => void;
}

export default function ProfileView({
  isOwnProfile,
  secret,
  user,
  onLogout,
  onRefreshUser,
  username: publicUsername,
  onBack,
  onNavigateToUser,
}: ProfileViewProps) {
  const resolvedUsername = isOwnProfile ? user?.username : publicUsername;
  const tabs = isOwnProfile ? OWN_TABS : PUBLIC_TABS;

  const [activeTab, setActiveTab] = useState<TabKey>('profile');
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [eloData, setEloData] = useState<EloData | null>(null);
  const [progression, setProgression] = useState<ProgressionEntry[]>([]);
  const [progressionLoading, setProgressionLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();

  const setScrollEnabled = useCallback((enabled: boolean) => {
    scrollViewRef.current?.setNativeProps({ scrollEnabled: enabled });
  }, []);

  const fetchProfile = useCallback(async () => {
    if (!resolvedUsername) return;
    setLoading(true);
    setError(null);

    try {
      const [profile, elo] = await Promise.allSettled([
        api.publicProfile(resolvedUsername),
        api.eloRank(resolvedUsername),
      ]);

      if (profile.status === 'rejected') {
        setError('User not found');
        setLoading(false);
        return;
      }

      // For own profile, merge in account-specific fields from user object
      const profileVal = profile.value;
      if (isOwnProfile && user) {
        setProfileData({
          ...profileVal,
          countryCode: profileVal.countryCode ?? user.countryCode,
          supporter: profileVal.supporter ?? user.supporter,
        });
      } else {
        setProfileData(profileVal);
      }

      if (elo.status === 'fulfilled') {
        setEloData(elo.value);
      } else {
        setEloData({
          elo: profileVal.elo || 1000,
          rank: profileVal.rank || 0,
          duels_wins: profileVal.duelStats?.wins || 0,
          duels_losses: profileVal.duelStats?.losses || 0,
          duels_tied: profileVal.duelStats?.ties || 0,
          win_rate: profileVal.duelStats?.winRate || 0,
        });
      }
    } catch (e) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [resolvedUsername, isOwnProfile, user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Fetch progression data
  useEffect(() => {
    if (!resolvedUsername) return;
    setProgressionLoading(true);
    api
      .userProgression(resolvedUsername)
      .then((res) => setProgression(res.progression || []))
      .catch(() => setProgression([]))
      .finally(() => setProgressionLoading(false));
  }, [resolvedUsername]);

  const handleCountrySelect = (code: string) => {
    if (profileData) {
      setProfileData({ ...profileData, countryCode: code || undefined });
    }
    onRefreshUser?.();
  };

  const handleUsernameChanged = () => {
    fetchProfile();
    onRefreshUser?.();
  };

  const handleShareProfile = async () => {
    if (!profileData?.username) return;
    const url = `https://worldguessr.com/user?u=${encodeURIComponent(profileData.username)}`;
    try {
      await Share.share(Platform.OS === 'ios' ? { url } : { message: url });
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (e) {
      // ignore
    }
  };

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <ProfileTab
            profileData={profileData}
            isOwnProfile={isOwnProfile}
            secret={secret}
            onLogout={onLogout}
            onChangeFlag={() => setCountryModalVisible(true)}
            onUsernameChanged={handleUsernameChanged}
            progression={progression}
            progressionLoading={progressionLoading}
            screenWidth={screenWidth}
            onScrollEnable={setScrollEnabled}
            viewingPublicProfile={!isOwnProfile}
          />
        );
      case 'history':
        return (
          <GameHistoryTab
            secret={secret!}
            onNavigateToUser={onNavigateToUser}
          />
        );
      case 'elo':
        return (
          <EloTab
            eloData={eloData}
            progression={progression}
            progressionLoading={progressionLoading}
            screenWidth={screenWidth}
            onScrollEnable={setScrollEnabled}
          />
        );
      case 'friends':
        return <FriendsTab secret={secret!} />;
      case 'moderation':
        return <ModerationTab secret={secret!} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
      <LinearGradient
        colors={[
          'rgba(0, 0, 0, 0.9)',
          'rgba(0, 30, 15, 0.8)',
          'rgba(0, 0, 0, 0.9)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Loading */}
        {loading && (
          <View style={styles.centered}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>Loading profile...</Text>
            </View>
          </View>
        )}

        {/* Error */}
        {error && !loading && (
          <View style={styles.centered}>
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>{error}</Text>
              <Text style={styles.errorSubtext}>The profile could not be loaded.</Text>
              <View style={styles.errorActions}>
                <Pressable
                  style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.8 }]}
                  onPress={fetchProfile}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </Pressable>
                {onBack && (
                  <Pressable
                    style={({ pressed }) => [styles.closeModalButton, pressed && { opacity: 0.8 }]}
                    onPress={onBack}
                  >
                    <Text style={styles.closeModalButtonText}>Close</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Profile Content */}
        {!loading && !error && profileData && (
          <View style={styles.profileContainer}>
            {/* Sticky Header */}
            <View style={styles.header}>
              {onBack && (
                <Pressable
                  style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
                  onPress={onBack}
                >
                  <Ionicons name="arrow-back" size={22} color="#fff" />
                </Pressable>
              )}
              <View style={styles.usernameRow}>
                <Text style={styles.usernameText}>{profileData.username}</Text>
                {profileData.countryCode && (
                  <Text style={styles.flag}>{getFlagEmoji(profileData.countryCode)}</Text>
                )}
                {profileData.supporter && (
                  <LinearGradient
                    colors={['#ffd700', '#ffed4e']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.supporterBadge}
                  >
                    <Text style={styles.supporterText}>SUPPORTER</Text>
                  </LinearGradient>
                )}
                {/* Share Profile Link */}
                <Pressable
                  style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.7 }]}
                  onPress={handleShareProfile}
                >
                  <Ionicons
                    name={linkCopied ? 'checkmark' : 'link'}
                    size={18}
                    color={linkCopied ? '#4CAF50' : '#fff'}
                  />
                </Pressable>
              </View>
            </View>

            {/* Sticky Tab Navigation */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabBarScroll}
              contentContainerStyle={styles.tabBar}
            >
              {tabs.map((tab) => (
                <Pressable
                  key={tab.key}
                  style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={styles.tabIcon}>{tab.icon}</Text>
                  <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Scrollable Tab Content */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.tabContent}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              {renderTabContent()}
            </ScrollView>
          </View>
        )}
      </SafeAreaView>

      {/* Country Selector Modal */}
      {isOwnProfile && secret && (
        <CountrySelectorModal
          visible={countryModalVisible}
          onClose={() => setCountryModalVisible(false)}
          currentCountry={profileData?.countryCode || null}
          onSelect={handleCountrySelect}
          secret={secret}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  safeArea: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backButton: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(220, 53, 69, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 48,
    alignItems: 'center',
    gap: 20,
    maxWidth: 400,
    width: '100%',
  },
  loadingText: {
    fontSize: 18,
    fontFamily: 'Lexend-Medium',
    color: '#fff',
  },
  errorCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 32,
    alignItems: 'center',
    maxWidth: 500,
    width: '100%',
  },
  errorTitle: {
    fontSize: 22,
    fontFamily: 'Lexend-Bold',
    color: '#ffc107',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 16,
    fontFamily: 'Lexend',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 24,
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 123, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(0, 123, 255, 0.3)',
  },
  retryButtonText: {
    color: '#4dabf7',
    fontSize: 14,
    fontFamily: 'Lexend-Medium',
  },
  closeModalButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    backgroundColor: 'rgba(220, 53, 69, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(220, 53, 69, 0.3)',
  },
  closeModalButtonText: {
    color: '#dc3545',
    fontSize: 14,
    fontFamily: 'Lexend-Medium',
  },
  profileContainer: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 8,
  },
  header: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  usernameText: {
    fontSize: 22,
    fontFamily: 'Lexend-Bold',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  flag: {
    fontSize: 22,
  },
  supporterBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  supporterText: {
    color: '#000',
    fontSize: 11,
    fontFamily: 'Lexend-Bold',
  },
  shareButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBarScroll: {
    flexGrow: 0,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  tabButtonActive: {
    backgroundColor: '#245734',
    borderColor: '#245734',
    shadowColor: 'rgba(36, 87, 52, 0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 4,
  },
  tabIcon: {
    fontSize: 15,
  },
  tabLabel: {
    fontSize: 12,
    fontFamily: 'Lexend-Medium',
    color: '#fff',
  },
  tabLabelActive: {
    fontFamily: 'Lexend-SemiBold',
  },
  tabContent: {
    flex: 1,
  },
  bodyContent: {
    padding: 14,
    paddingBottom: 30,
  },
});
