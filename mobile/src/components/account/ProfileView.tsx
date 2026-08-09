import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import SiteBackground from '../SiteBackground';
import { Pressable } from '../ui/SfxPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../../services/api';
import { t, STARTING_ELO } from '../../shared';
import { ProgressionEntry } from './shared';
import PlayerName from '../PlayerName';
import ProfileTab from './ProfileTab';
import EloTab from './EloTab';
import GameHistoryTab from './GameHistoryTab';
import FriendsTab from './FriendsTab';
import ModerationTab from './ModerationTab';
import CountrySelectorModal from './CountrySelectorModal';

type TabKey = 'profile' | 'history' | 'elo' | 'friends' | 'moderation';

// NO MIGRATION MARKER LIVES HERE ANY MORE.
//
// This file used to render a Season1MilestoneNote card under the chart, mirroring
// the dashed gold rule the web chart drew in-canvas. Both existed for one reason:
// the migration granted up to ~2.35M XP as a single UserStats row, so totalXp
// leapt in one step and the chart had to explain itself.
//
// That XP grant was cut before it shipped, so there is no step left to explain.
// Ratings never needed one either: api/userProgression.js converts pre-migration
// points onto the v2 scale server-side, so the elo curve has no seam at all.

interface Tab {
  key: TabKey;
  // Store the locale KEY (not a resolved string) so we can call t() at render
  // time — t() reads the language table set after module load, so resolving here
  // at module scope would capture English permanently.
  labelKey: string;
  icon: string;
}

const OWN_TABS: Tab[] = [
  { key: 'profile', labelKey: 'profile', icon: '👤' },
  { key: 'history', labelKey: 'history', icon: '📜' },
  { key: 'elo', labelKey: 'elo', icon: '🏆' },
  { key: 'friends', labelKey: 'friendsText', icon: '👥' },
  { key: 'moderation', labelKey: 'moderation', icon: '⚖️' },
];

const PUBLIC_TABS: Tab[] = [
  { key: 'profile', labelKey: 'profile', icon: '👤' },
  { key: 'elo', labelKey: 'elo', icon: '🏆' },
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
  rank?: number;
  canChangeUsername?: boolean;
  daysUntilNameChange?: number;
  recentChange?: boolean;
  pendingNameChange?: boolean;
  pendingNameChangePublicNote?: string;
  duelStats?: {
    wins: number;
    losses: number;
    ties: number;
    winRate: number;
  };
  /**
   * Equipped cosmetics, as api/publicProfile.js and api/publicAccount.js both
   * return them. Only `nameGlow` is public — nothing else about an inventory
   * leaves the server on this route.
   */
  cosmetics?: { equipped?: { nameGlow?: string | null } };
  /**
   * Season 0 record, feeding the OG badge in <ProfileTab> (see the prop docs
   * there). Both fetch paths carry them: the public one passes the payload
   * straight through, the own-profile one maps them by hand.
   */
  seasonPeakElo?: number | null;
  seasonPeakLeague?: string | null;
  season0Elo?: number | null;
  season0Rank?: number | null;
  ogAccount?: boolean;
}

interface EloData {
  elo: number;
  rank: number;
  /**
   * Whole league object from api/eloRank.js. Declared here so it SURVIVES the
   * hop into <EloTab>, which prefers it over the local cutoff table — the
   * server already knows the tier for this rating, and trusting it means a
   * seasonal re-anchor needs no store release.
   */
  league?: { name?: string; min?: number; max?: number; emoji?: string; color?: string; light?: string };
  duels_wins: number;
  duels_losses: number;
  duels_tied: number;
  win_rate: number;
}

interface ProfileViewProps {
  isOwnProfile: boolean;
  secret?: string;
  user?: {
    accountId?: string;
    username: string;
    elo?: number;
    totalXp?: number;
    totalGamesPlayed?: number;
    countryCode?: string;
    staff?: boolean;
    banned?: boolean;
    banType?: string;
    banExpiresAt?: string;
    banPublicNote?: string;
    pendingNameChange?: boolean;
    pendingNameChangePublicNote?: string;
    canChangeUsername?: boolean;
    daysUntilNameChange?: number;
    recentChange?: boolean;
    pendingDeletion?: boolean;
    scheduledDeletionAt?: string;
  };
  onLogout?: () => void;
  onRefreshUser?: () => void | Promise<void>;
  // Public profile
  username?: string;
  // Navigation
  onBack?: () => void;
  onNavigateToUser?: (username: string) => void;
  /** Optional initial tab to preselect (e.g. via a route param). Falls back to 'profile'. */
  initialTab?: TabKey;
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
  initialTab,
}: ProfileViewProps) {
  const resolvedUsername = isOwnProfile ? user?.username : publicUsername;
  const accountId = isOwnProfile ? user?.accountId : undefined;
  const tabs = isOwnProfile ? OWN_TABS : PUBLIC_TABS;

  // Honor an `initialTab` request only if it's actually offered by the current tab set.
  const safeInitialTab: TabKey = initialTab && tabs.some((tab) => tab.key === initialTab)
    ? initialTab
    : 'profile';
  const [activeTab, setActiveTab] = useState<TabKey>(safeInitialTab);

  // If the caller swaps `initialTab` while mounted (deep link from a different screen),
  // honor that and switch tabs — but don't loop on every render.
  const lastInitialTabRef = useRef<TabKey | undefined>(initialTab);
  useEffect(() => {
    if (initialTab && initialTab !== lastInitialTabRef.current
      && tabs.some((tab) => tab.key === initialTab)) {
      lastInitialTabRef.current = initialTab;
      setActiveTab(initialTab);
    }
  }, [initialTab, tabs]);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [eloData, setEloData] = useState<EloData | null>(null);
  const [progression, setProgression] = useState<ProgressionEntry[]>([]);
  const [progressionLoading, setProgressionLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);

  // Live totals from the auth store. For the OWN profile these are kept current
  // by optimistic game-end updates (singleplayer/daily/duel), so the XP and
  // games-played stats update instantly without an app reload — instead of being
  // frozen at whatever the one-time publicAccount fetch returned. The server's
  // publicAccount is cached ~20s, so the store (optimistic) is often fresher.
  const liveTotalXp = useAuthStore((s) => s.user?.totalXp);
  const liveGamesPlayed = useAuthStore((s) => s.user?.totalGamesPlayed);
  const refreshAccount = useAuthStore((s) => s.refreshAccount);

  const setScrollEnabled = useCallback((enabled: boolean) => {
    scrollViewRef.current?.setNativeProps({ scrollEnabled: enabled });
  }, []);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (isOwnProfile && accountId) {
        // Own profile: use publicAccount (by ID, not username) like web does
        const [account, elo] = await Promise.allSettled([
          api.publicAccount(accountId),
          resolvedUsername ? api.eloRank(resolvedUsername) : Promise.reject('no username'),
        ]);

        if (account.status === 'rejected') {
          setError(t('failedToLoadProfile'));
          setLoading(false);
          return;
        }

        const accountVal = account.value;
        setProfileData({
          username: accountVal.username,
          elo: user?.elo ?? STARTING_ELO,
          totalXp: accountVal.totalXp,
          gamesLen: accountVal.gamesLen,
          createdAt: accountVal.createdAt,
          countryCode: accountVal.countryCode ?? user?.countryCode,
          canChangeUsername: accountVal.canChangeUsername,
          daysUntilNameChange: accountVal.daysUntilNameChange,
          recentChange: accountVal.recentChange,
          pendingNameChange: user?.pendingNameChange,
          pendingNameChangePublicNote: user?.pendingNameChangePublicNote,
          // Season 0 record. This mapping is hand-written field by field, so a
          // field the API adds is invisible here until it is listed — which is
          // exactly how a veteran ended up being the one person who could not
          // see their own OG badge. api/publicAccount.js carries all four.
          seasonPeakElo: accountVal.seasonPeakElo,
          seasonPeakLeague: accountVal.seasonPeakLeague,
          season0Elo: accountVal.season0Elo,
          season0Rank: accountVal.season0Rank,
          ogAccount: accountVal.ogAccount,
        });

        if (elo.status === 'fulfilled') {
          setEloData(elo.value);
        } else {
          setEloData({
            elo: user?.elo || STARTING_ELO,
            rank: 0,
            duels_wins: 0,
            duels_losses: 0,
            duels_tied: 0,
            win_rate: 0,
          });
        }
      } else {
        // Public profile: use publicProfile (by username)
        if (!resolvedUsername) return;

        const [profile, elo] = await Promise.allSettled([
          api.publicProfile(resolvedUsername),
          api.eloRank(resolvedUsername),
        ]);

        if (profile.status === 'rejected') {
          setError(t('friendReqNotFound'));
          setLoading(false);
          return;
        }

        const profileVal = profile.value;
        setProfileData(profileVal);

        if (elo.status === 'fulfilled') {
          setEloData(elo.value);
        } else {
          setEloData({
            elo: profileVal.elo || STARTING_ELO,
            rank: profileVal.rank || 0,
            duels_wins: profileVal.duelStats?.wins || 0,
            duels_losses: profileVal.duelStats?.losses || 0,
            duels_tied: profileVal.duelStats?.ties || 0,
            win_rate: profileVal.duelStats?.winRate || 0,
          });
        }
      }
    } catch (e) {
      setError(t('failedToLoadProfile'));
    } finally {
      setLoading(false);
    }
  }, [accountId, resolvedUsername, isOwnProfile, user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Reconcile authoritative totals from the server whenever the profile regains
  // focus (e.g. returning to the Account tab after finishing a game). The tab
  // stays mounted across navigation, so without this the one-time mount fetch
  // would never refresh. refreshAccount() never regresses an optimistic value.
  useFocusEffect(
    useCallback(() => {
      if (isOwnProfile) refreshAccount();
    }, [isOwnProfile, refreshAccount]),
  );

  // Fetch progression data
  useEffect(() => {
    const identifier = isOwnProfile && accountId
      ? { userId: accountId }
      : resolvedUsername
        ? { username: resolvedUsername }
        : null;
    if (!identifier) return;
    setProgressionLoading(true);
    api
      .userProgression(identifier)
      .then((res) => setProgression(res.progression || []))
      .catch(() => setProgression([]))
      .finally(() => setProgressionLoading(false));
  }, [isOwnProfile, accountId, resolvedUsername]);

  const handleCountrySelect = (code: string) => {
    if (profileData) {
      setProfileData({ ...profileData, countryCode: code || undefined });
    }
    onRefreshUser?.();
  };

  const handleUsernameChanged = async () => {
    // Refresh auth store first (updates user.username), then re-fetch profile by accountId
    await onRefreshUser?.();
    fetchProfile();
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

  // For the own profile, prefer the live store totals (kept fresh by optimistic
  // game-end updates + focus reconcile) over the one-time fetched snapshot.
  const displayProfileData = profileData && isOwnProfile
    ? {
        ...profileData,
        totalXp: liveTotalXp ?? profileData.totalXp,
        gamesLen: liveGamesPlayed ?? profileData.gamesLen,
      }
    : profileData;

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <ProfileTab
            profileData={displayProfileData}
            isOwnProfile={isOwnProfile}
            secret={secret}
            onLogout={onLogout}
            onChangeFlag={() => setCountryModalVisible(true)}
            onUsernameChanged={handleUsernameChanged}
            progression={progression}
            progressionLoading={progressionLoading}
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
            onScrollEnable={setScrollEnabled}
          />
        );
      case 'friends':
        return <FriendsTab />;
      case 'moderation':
        return (
          <ModerationTab
            secret={secret!}
            banned={user?.banned}
            banType={user?.banType}
            banExpiresAt={user?.banExpiresAt}
            banPublicNote={user?.banPublicNote}
            pendingNameChange={user?.pendingNameChange}
            pendingNameChangePublicNote={user?.pendingNameChangePublicNote}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Background Image */}
      <SiteBackground style={StyleSheet.absoluteFillObject}/>

      {/* Dark overlay keeps the street2 backdrop subtle, matching the rest of the app */}
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
        {/* Initial-load spinner ONLY. On a re-open / focus refetch we already hold
            profileData, so we keep it on screen (stale-while-revalidate) and let the
            fresh data swap in place. Gating on `loading` alone would drop the existing
            profile for this full-screen spinner on every refetch — the jarring
            "stale → refreshing → identical UI" flicker we're killing here.
            (refreshAccount() rebuilds the auth-store user object on every focus, which
            churns fetchProfile's identity and re-fires it — see fetchProfile deps.) */}
        {loading && !profileData && (
          <View style={styles.centered}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>{t('loadingProfile')}</Text>
            </View>
          </View>
        )}

        {/* Error screen ONLY when there's nothing to show. A failed BACKGROUND refetch
            keeps the existing profile up instead of flashing a full-screen error. */}
        {error && !profileData && (
          <View style={styles.centered}>
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>{error}</Text>
              <Text style={styles.errorSubtext}>{t('profileCouldNotLoad')}</Text>
              <View style={styles.errorActions}>
                <Pressable
                  style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.8 }]}
                  onPress={fetchProfile}
                >
                  <Text style={styles.retryButtonText}>{t('retry')}</Text>
                </Pressable>
                {onBack && (
                  <Pressable
                    style={({ pressed }) => [styles.closeModalButton, pressed && { opacity: 0.8 }]}
                    onPress={onBack}
                  >
                    <Text style={styles.closeModalButtonText}>{t('close')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Profile content stays mounted through background refetches — intentionally
            NOT gated on `loading`/`error` — so a re-open updates the data in place
            with no flicker. displayProfileData already merges the live store totals,
            so the visible stats are fresh even before the refetch resolves. */}
        {profileData && (
          <View style={styles.profileContainer}>
            {/* Sticky Header */}
            <View style={styles.header}>
              {onBack && (
                <Pressable
                  style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
                  onPress={onBack}
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </Pressable>
              )}
              <View style={styles.usernameRow}>
                <PlayerName
                  name={profileData.username}
                  countryCode={profileData.countryCode}
                  // ANIMATED: one name, on the screen a player links people to
                  // when they want the thing they bought to be seen.
                  glow={profileData.cosmetics?.equipped?.nameGlow}
                  flagSize={24}
                  gap={10}
                  numberOfLines={0}
                  textStyle={styles.usernameText}
                />
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
                    {t(tab.labelKey)}
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
    backgroundColor: '#112b18',
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
