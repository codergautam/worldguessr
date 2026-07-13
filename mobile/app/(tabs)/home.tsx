import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Animated,
  Easing,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Pressable } from '../../src/components/ui/SfxPressable';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, getLeague, t, formatCompact } from '../../src/shared';
import { useAuthStore } from '../../src/store/authStore';
import { useMultiplayerStore } from '../../src/store/multiplayerStore';
import { api } from '../../src/services/api';
import { haptics } from '../../src/services/haptics';
import { spacing, borderRadius } from '../../src/styles/theme';
import AccountSelectSheet from '../../src/components/auth/AccountSelectSheet';
import { useLoginPrompt } from '../../src/hooks/useGoogleSignIn';
import WhatsNewModal from '../../src/components/WhatsNewModal';
import PlayerName from '../../src/components/PlayerName';
import { useOnboardingStore } from '../../src/store/onboardingStore';
import { onboardingAnalytics } from '../../src/services/onboardingAnalytics';
import { SINGLEPLAYER_DEFAULT_MODE_KEY } from '../../src/hooks/useCountryGuesserGame';
import { prefetchDailyStatus } from '../../src/components/daily/prefetchDailyStatus';
import DailyStreakBadge from '../../src/components/daily/DailyStreakBadge';
import { useDailyMenuStatus } from '../../src/components/daily/useDailyMenuStatus';
import { maybeShowGameInterstitial, runGameInterstitial } from '../../src/services/ads';
import { dismissAllSafe } from '../../src/utils/navigation';
import { TEAM_SUPPORT } from '../../src/services/websocketConfig';

type GameMode = 'singleplayer' | 'dailyChallenge' | 'rankedDuel' | 'unrankedDuel' | '2v2' | 'createGame' | 'joinGame' | 'communityMaps';

interface MenuButtonProps {
  label: string;
  onPress: () => void;
  delay: number;
  /** Start the entrance only once auth is settled, so conditional items (e.g.
   * Ranked Duel) that mount when login resolves still animate IN SEQUENCE with
   * the rest instead of a beat later. */
  ready: boolean;
  /** Optional trailing accessory rendered next to the label (e.g. the daily
   * streak pill on the Daily Challenge entry, mirroring web's DailyMenuItem). */
  accessory?: React.ReactNode;
}

/**
 * Shared left-to-right entrance for every row in the home menu — the mode
 * buttons AND the divider rules between groups. Slides the element in from the
 * left while fading it up, starting once `ready` flips true (auth settled) plus
 * `delay`, and only ever once (guarded by a ref so it never replays on a
 * re-render). Returns the animated style to spread onto an Animated.View.
 *
 * Centralising this is what keeps the dividers in lock-step with the buttons:
 * every menu row reveals as one staggered wave instead of the dividers painting
 * statically at full opacity before the buttons (and jumping as the post-auth
 * layout settles). Mirrors web, where `.g2_nav_ui > *` runs `nav_slide_in` on
 * ALL nav children, the `.g2_nav_hr` dividers included.
 */
function useMenuEntrance(delay: number, ready: boolean) {
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!ready || hasAnimated.current) return;
    hasAnimated.current = true;
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
  }, [ready, delay, slideAnim, opacityAnim]);

  return { transform: [{ translateX: slideAnim }], opacity: opacityAnim };
}

function MenuButton({ label, onPress, delay, ready, accessory }: MenuButtonProps) {
  const entranceStyle = useMenuEntrance(delay, ready);

  return (
    <Animated.View style={entranceStyle}>
      <Pressable
        // Home main-menu scope plays ui_click, not click_2 (web .g2_nav_ui
        // parity via the delegated listener) — every MenuButton inherits it.
        sfx="ui"
        style={({ pressed }) => [
          styles.menuButton,
          pressed && styles.menuButtonPressed,
        ]}
        onPress={onPress}
      >
        <View style={styles.menuButtonRow}>
          <Text style={styles.menuButtonText}>{label}</Text>
          {accessory}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Gold "NEW" sticker on a fresh menu entry (web `.g2_nav_new_sticker`, minus
 * the star clip-path — a tilted gold chip reads the same at menu-row size).
 */
function NewSticker() {
  return (
    <View style={styles.newSticker}>
      <Text style={styles.newStickerText}>{t('newSticker')}</Text>
    </View>
  );
}

/**
 * The horizontal rule between menu groups. Shares the menu entrance so the lines
 * slide in alongside the buttons rather than painting at full opacity on the
 * first frame — that static early paint, at the pre-auth (compact) layout, was
 * the "white line flashing higher than where it belongs" before the menu
 * animated in. Web parity: `.g2_nav_hr` is a `.g2_nav_ui > *` child and rides
 * the same `nav_slide_in`.
 */
function MenuDivider({ delay, ready }: { delay: number; ready: boolean }) {
  const entranceStyle = useMenuEntrance(delay, ready);
  return <Animated.View style={[styles.divider, entranceStyle]} />;
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

/**
 * Bottom-right "X online" badge. Kept ALWAYS MOUNTED (not conditionally
 * rendered) so it can animate OUT as well as in: it slides off to the right +
 * fades when `visible` goes false (disconnect, login/logout socket swap, or
 * count→0) and slides back in from the right when it returns. The last positive
 * count is latched so the text never blinks to "0 online" mid-slide-out.
 */
function OnlineCountBadge({
  visible,
  count,
  fontSize,
  style,
}: {
  visible: boolean;
  count: number;
  fontSize: number;
  style: StyleProp<ViewStyle>;
}) {
  const SLIDE = 80; // px off-screen to the right when hidden
  const translateX = useRef(new Animated.Value(SLIDE)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [shownCount, setShownCount] = useState(count);

  // Latch the live count while it's meaningful; keep showing it during exit.
  useEffect(() => {
    if (count > 0) setShownCount(count);
  }, [count]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: visible ? 0 : SLIDE,
        duration: visible ? 420 : 300,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 360 : 240,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, translateX, opacity]);

  return (
    <Animated.View
      style={[style, { opacity, transform: [{ translateX }] }]}
      pointerEvents="none"
    >
      <Text style={[styles.onlineCount, { fontSize }]}>
        {t('onlineCnt', { cnt: formatCompact(shownCount) })}
      </Text>
    </Animated.View>
  );
}

// Module-level flags so moderation popup only shows once per app session
let modPopupDismissedBan = false;
let modPopupDismissedNameChange = false;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated, isLoading: authLoading, secret } = useAuthStore();
  const updateUser = useAuthStore((s) => s.updateUser);

  // Daily streak status for the home menu pill (mirrors web's DailyMenuItem).
  const dailyStatus = useDailyMenuStatus(secret ?? null);

  // ELO data fetching & animation (matches web home.js:298-367)
  const [eloData, setEloData] = useState<{ elo: number; rank: number; league: ReturnType<typeof getLeague> } | null>(null);
  const [animatedElo, setAnimatedElo] = useState(0);
  const [accountSheetVisible, setAccountSheetVisible] = useState(false);
  // When a guest taps an account-gated mode (Ranked / 2v2), the sheet opens
  // with that mode's pitch instead of the generic sign-in copy.
  const [loginUpsell, setLoginUpsell] = useState<'2v2' | 'ranked' | null>(null);
  // Android signs in with Google directly (single provider — no chooser
  // sheet); iOS opens the sheet. The platform fork lives in useLoginPrompt.
  const handleLogin = useLoginPrompt(() => {
    setLoginUpsell(null);
    setAccountSheetVisible(true);
  });
  const [whatsNewDemo, setWhatsNewDemo] = useState(false);
  const [restoringAccount, setRestoringAccount] = useState(false);
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

  // Warm the Daily Challenge cache once the session resolves, so opening
  // /daily has no layout shift (mirrors web's home-rendered DailyMenuItem).
  // Gated on !authLoading so a logged-in user prefetches with their secret,
  // not as a guest; re-runs if the secret changes (login/logout).
  useEffect(() => {
    if (authLoading) return;
    prefetchDailyStatus(secret);
  }, [authLoading, secret]);

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

  // Instant ELO update after a ranked match (web home.js:1835 `type:"elo"` handler).
  // The multiplayerStore `elo` handler writes the new rating into authStore on
  // duel end; re-derive eloData from user.elo here so the pill (and its animated
  // counter) updates immediately without a refetch or app reopen.
  useEffect(() => {
    if (!isAuthenticated || user?.elo === undefined) return;
    setEloData((prev) =>
      prev && prev.elo === user.elo
        ? prev
        : { elo: user.elo, rank: prev?.rank ?? 0, league: getLeague(user.elo) },
    );
  }, [isAuthenticated, user?.elo]);

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

  // Restore an account that's within its 30-day deletion grace period. Explicit
  // user action (we never auto-cancel on login) — see api/cancelDeletion.js.
  const handleRestoreAccount = useCallback(() => {
    if (!secret || restoringAccount) return;
    Alert.alert(
      t('restoreAccount', undefined, 'Restore Account'),
      t('restoreAccountConfirm', undefined, 'Cancel the scheduled deletion and keep your account?'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('restoreAccount', undefined, 'Restore'),
          onPress: async () => {
            try {
              setRestoringAccount(true);
              await api.cancelDeletion(secret);
              updateUser({ pendingDeletion: false, scheduledDeletionAt: undefined });
              Alert.alert(
                t('accountRestoredTitle', undefined, 'Account Restored'),
                t('accountRestoredBody', undefined, 'Your account is no longer scheduled for deletion.'),
              );
            } catch (e: any) {
              Alert.alert(t('error', undefined, 'Error'), e?.message || String(e));
            } finally {
              setRestoringAccount(false);
            }
          },
        },
      ],
    );
  }, [secret, restoringAccount, updateUser]);

  // First-launch routing happens in app/index.tsx — it waits for the
  // onboarding flag to load and redirects to /onboarding/play directly,
  // so this screen never has to redirect itself.

  // Multiplayer state
  const gameQueued = useMultiplayerStore((s) => s.gameQueued);
  const inGame = useMultiplayerStore((s) => s.inGame);
  const gameState = useMultiplayerStore((s) => s.gameData?.state);
  const gamePublic = useMultiplayerStore((s) => s.gameData?.public);
  const playerCount = useMultiplayerStore((s) => s.playerCount);
  const connected = useMultiplayerStore((s) => s.connected);
  const nextGameQueued = useMultiplayerStore((s) => s.nextGameQueued);
  const nextGameType = useMultiplayerStore((s) => s.nextGameType);

  // ── 2v2 navigation owner ──────────────────────────────────────────────────
  // The 2v2 pipeline is the one flow where the store swaps between "in a game"
  // (lobby/match on /game/[id]) and "queued with NO game" (stage-2 opponent
  // search on /queue) several times per session. This effect owns BOTH
  // directions of that /game/[id] ⇄ /queue toggle with router.replace, so the
  // stack keeps exactly one of the two mounted (canonical shapes:
  // [tabs, game], [tabs, queue], [tabs, game, results]) and repeated
  // find/cancel/play-again cycles can't grow a tower of dead screens.
  // The generic auto-nav effect below handles every OTHER entry into the game
  // screen (it runs after this one — declaration order — and skips when this
  // effect already navigated via the shared hasAutoNavigated ref).
  //
  // Covered transition rows (see mobile-team-parity-plan.md §3):
  //   3. stage-2 enter (gameData wiped)          game/lobby → /queue   (replace)
  //   4. match found (game snapshot, team2v2)    /queue → /game/[id]   (replace)
  //   5. stage-2 cancel (lobby snapshot returns) /queue → /game/[id]   (replace)
  //   6. auto-demotion (fresh lobby + stage-1)   /queue → /game/[id]   (replace)
  //  10. play-again queue-bound burst            results → /queue      (dismiss+push)
  // Rows 1/2/7/8 are pure re-renders (no navigation); row 9 (duelEnd→results)
  // is owned by [id].tsx; rows 11/12 ride the same snapshots as 5/6.
  const hasAutoNavigated = useRef(false);
  const queueStage = useMultiplayerStore((s) => s.queueStage);
  const is2v2Context = useMultiplayerStore(
    (s) => !!(s.gameData?.is2v2Lobby || s.gameData?.team2v2),
  );
  const pathname = usePathname();
  // Read the live pathname inside effects without re-running them on every
  // route change — navigation is driven by STORE transitions, not the route.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const on2v2Queue = gameQueued === '2v2' && queueStage === 'opponents' && !inGame;
  useEffect(() => {
    // game → queue (rows 3/10): whenever we're opponent-searching with no game
    // mounted, the queue screen must be the top route.
    if (on2v2Queue) {
      const path = pathnameRef.current;
      if (path.startsWith('/queue')) return;
      if (path.startsWith('/game/results')) {
        // Play-again burst: unwind results + the finished game, then queue.
        // The push waits one macrotask so expo-router drains the POP_TO_TOP
        // first (same two-beat shape as the 1v1 play-again results→home→queue
        // hop; dismissAllSafe's action queue is NOT synchronous). Re-check the
        // live store at fire time: a match `game` snapshot can land in the
        // same burst (instant match against a waiting duo), and a stale push
        // would stack a dead /queue over the freshly mounted game.
        dismissAllSafe();
        setTimeout(() => {
          const s = useMultiplayerStore.getState();
          if (s.gameQueued === '2v2' && s.queueStage === 'opponents' && !s.inGame) {
            router.push('/queue');
          }
        }, 0);
      } else if (path.startsWith('/game/')) {
        // Stage-2 enter from the staging lobby. [id].tsx's beforeRemove guard
        // passes (inGame already false) and its !inGame dismiss effect is
        // gated on !gameQueued, so this replace is the only navigation.
        router.replace('/queue');
      } else {
        // Reconnect re-synced us into a queue while elsewhere (e.g. home).
        router.push('/queue');
      }
      return;
    }
    // queue → game (rows 4/5/6): a game snapshot (match, restored lobby, or
    // demotion lobby) arrived while the queue screen is up. Replace so the
    // queue doesn't linger under the game and cycles can't stack.
    if (inGame && is2v2Context && pathnameRef.current.startsWith('/queue')) {
      hasAutoNavigated.current = true;
      router.replace({ pathname: '/game/[id]', params: { id: 'multiplayer' } });
    }
  }, [on2v2Queue, inGame, is2v2Context]);

  // Single owner of "enter the unified multiplayer screen". Fires for ANY
  // in-game state (waiting lobby, duel match, game start, reconnect, accepted
  // invite). The entry screens (create/join/queue) no longer navigate to the
  // game themselves, so there's no double-push race.
  useEffect(() => {
    if (!inGame || !gameState) {
      hasAutoNavigated.current = false;
      return;
    }
    // A PUBLIC duel sits in `waiting` while matchmaking finds an opponent — keep
    // the queue ("finding game") on screen and DON'T open the game screen yet,
    // which would render MultiplayerLobby (the "party" UI). That brief render was
    // the "flash of my party" the user saw right after pressing a duel. Only
    // PRIVATE games show the lobby during waiting; public games navigate once the
    // round actually starts (state → getready).
    if (gameState === 'waiting' && gamePublic) return;
    if (hasAutoNavigated.current) return;
    // 2v2 queue → game transitions are owned by the effect above (replace, not
    // push). It runs first (declaration order) and marks hasAutoNavigated; this
    // guard covers the edge where THIS effect's deps fire on a later commit.
    if (is2v2Context && pathnameRef.current.startsWith('/queue')) return;
    hasAutoNavigated.current = true;
    router.push({
      pathname: '/game/[id]',
      params: { id: 'multiplayer' },
    });
  }, [inGame, gameState, gamePublic, is2v2Context]);

  // Handle auto re-queue after gameCancelled (opponent left before start).
  // Preserve the original queue type so unranked players re-queue into the
  // unranked queue, not ranked (mirrors web home.js:2251-2260).
  useEffect(() => {
    if (nextGameQueued && connected && !inGame && !gameQueued) {
      const isUnranked = nextGameType === 'unranked';
      const queueType = isUnranked ? 'unrankedDuel' : 'publicDuel';
      useMultiplayerStore.setState({ nextGameQueued: false, nextGameType: null });
      useMultiplayerStore.getState().joinQueue(queueType);
      router.push('/queue');
    }
  }, [nextGameQueued, connected, inGame, gameQueued, nextGameType]);

  // Guest tapped an account-gated mode: open the real login sheet with that
  // mode's pitch (web SuggestAccountModal locked variants) instead of a native
  // Alert — actual provider buttons convert better than a text-only prompt.
  // Deliberately NOT useLoginPrompt: the sheet opens on BOTH platforms here
  // (Android's sheet is Google-only; iOS shows Apple + Google).
  const promptLoginUpsell = (variant: '2v2' | 'ranked') => {
    setLoginUpsell(variant);
    setAccountSheetVisible(true);
  };

  const handleModePress = async (mode: GameMode) => {
    // ui_click rides MenuButton's SfxPressable (sfx="ui").
    haptics.light(); // tap on any main menu mode button
    // Account-gated modes mirror web's button order: guest upsell BEFORE the
    // connection check (a guest doesn't need a live socket to see the prompt).
    if (mode === '2v2' && !isAuthenticated) {
      promptLoginUpsell('2v2');
      return;
    }
    if (mode === 'rankedDuel' && !isAuthenticated) {
      promptLoginUpsell('ranked');
      return;
    }
    const needsConnection = mode === 'rankedDuel' || mode === 'unrankedDuel' || mode === '2v2' || mode === 'createGame' || mode === 'joinGame';
    if (needsConnection && !connected) {
      Alert.alert(
        t('multiplayerNotConnected'),
        t('notConnectedReopenApp', undefined, 'You are not connected to the server. Closing and re-opening the app can help.'),
        [{ text: t('ok') }],
      );
      return;
    }

    switch (mode) {
      case 'singleplayer':
        maybeShowGameInterstitial('singleplayer');
        const defaultMode = await AsyncStorage.getItem(SINGLEPLAYER_DEFAULT_MODE_KEY).catch(() => null);
        router.push({
          pathname: '/game/[id]',
          params: {
            id: 'singleplayer',
            map: 'all',
            rounds: defaultMode === 'countryGuesser' || defaultMode === 'continentGuesser' ? '10' : '5',
            mode: defaultMode || 'world',
          },
        });
        break;
      case 'rankedDuel':
        // Wait for the interstitial to be dismissed before joining the queue —
        // otherwise the server can match us and start the round behind the ad.
        await runGameInterstitial('rankedDuel');
        useMultiplayerStore.getState().joinQueue('publicDuel');
        router.push('/queue');
        break;
      case 'unrankedDuel':
        await runGameInterstitial('unrankedDuel');
        useMultiplayerStore.getState().joinQueue('unrankedDuel');
        router.push('/queue');
        break;
      case '2v2':
        // Lobby-first (binding ruling — never instant-queue): reuse the party
        // create route — its skeleton shell paints instantly while the server
        // builds the staging lobby, and the auto-nav effect swaps in
        // /game/[id] when the snapshot arrives (exact createGame flow). No
        // interstitial here (web parity: lobby creation is ad-free); the ad
        // runs at Find Match, the actual queue entry.
        router.push({ pathname: '/party/create', params: { mode: '2v2' } });
        break;
      case 'createGame':
        router.push('/party/create');
        break;
      case 'joinGame':
        router.push('/party/join');
        break;
      case 'communityMaps':
        router.navigate('/(tabs)/maps');
        break;
      case 'dailyChallenge':
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push('/daily' as any);
        break;
    }
  };

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const shortestSide = Math.min(width, height);

  const headerActionMetrics =
    shortestSide >= 768
      ? {
          accountPaddingHorizontal: spacing.xl,
          accountPaddingVertical: spacing.md,
          accountFontSize: 20,
          accountLineHeight: 24,
          accountGap: spacing.md,
          friendSize: 44,
          friendIconSize: 26,
          rowGap: 8,
          flagSize: 20,
          leagueMarginTop: 8,
          leaguePaddingHorizontal: 12,
          leaguePaddingVertical: 7,
          leagueFontSize: 15,
        }
      : shortestSide >= 430
        ? {
            accountPaddingHorizontal: spacing.xl,
            accountPaddingVertical: spacing.md,
            accountFontSize: 18,
            accountLineHeight: 22,
            accountGap: spacing.sm,
            friendSize: 40,
            friendIconSize: 24,
            rowGap: 7,
            flagSize: 18,
            leagueMarginTop: 7,
            leaguePaddingHorizontal: 11,
            leaguePaddingVertical: 6,
            leagueFontSize: 14,
          }
        : {
            accountPaddingHorizontal: spacing.lg,
            accountPaddingVertical: spacing.sm,
            accountFontSize: 17,
            accountLineHeight: 20,
            accountGap: spacing.sm,
            friendSize: 36,
            friendIconSize: 22,
            rowGap: 6,
            flagSize: 18,
            leagueMarginTop: 6,
            leaguePaddingHorizontal: 10,
            leaguePaddingVertical: 5,
            leagueFontSize: 13,
          };

  let buttonIndex = 0;
  const getDelay = () => {
    buttonIndex++;
    return 150 + buttonIndex * 60;
  };

  const loggedIn = isAuthenticated && !!user?.username;
  // Authenticated but hasn't picked a username yet — the forced SetUsernameModal
  // is covering the screen, so don't render the misleading "Login" button behind it.
  const awaitingUsername = isAuthenticated && !user?.username;

  // Pill data for the league badge, derived the instant we know the user is
  // logged in (every account has an ELO) instead of waiting for the async
  // `eloData` fetch. The in-flow header placeholder renders the pill from this
  // so it reserves the pill's height immediately — otherwise the header grows a
  // frame after login (when `eloData` resolves) and shoves the whole menu, with
  // its freshly revealed dividers, downward. `eloData` still supplies the
  // authoritative rank + animated counter once the request returns.
  const eloForLayout =
    eloData ??
    (loggedIn && user?.elo
      ? { elo: user.elo, rank: 0, league: getLeague(user.elo) }
      : null);

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
        <View
          style={[
            styles.headerActionsOverlay,
            {
              top: insets.top + spacing.md,
              right: Math.max(insets.right, spacing.xl),
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.headerActionsOverlayInner} pointerEvents="box-none">
            <View style={styles.headerRight}>
              {awaitingUsername ? null : loggedIn ? (
                <>
                  <View style={styles.loggedInRow}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.accountBtn,
                        {
                          paddingHorizontal: headerActionMetrics.accountPaddingHorizontal,
                          paddingVertical: headerActionMetrics.accountPaddingVertical,
                        },
                        pressed && styles.accountBtnPressed,
                      ]}
                      onPress={() => router.navigate('/(tabs)/account')}
                    >
                      <PlayerName
                        name={user.username}
                        countryCode={user.countryCode}
                        flagSize={headerActionMetrics.flagSize}
                        gap={headerActionMetrics.accountGap}
                        style={styles.accountBtnContent}
                        textStyle={[
                          styles.accountBtnText,
                          {
                            fontSize: headerActionMetrics.accountFontSize,
                            lineHeight: headerActionMetrics.accountLineHeight,
                          },
                        ]}
                      />
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.friendBtn,
                        {
                          width: headerActionMetrics.friendSize,
                          height: headerActionMetrics.friendSize,
                        },
                        pressed && styles.friendBtnPressed,
                      ]}
                      onPress={() =>
                        router.push({ pathname: '/(tabs)/account', params: { tab: 'friends' } })
                      }
                    >
                      <Ionicons name="people" size={headerActionMetrics.friendIconSize} color={colors.white} />
                    </Pressable>
                  </View>

                  {eloForLayout && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.leagueBtn,
                        {
                          marginTop: headerActionMetrics.leagueMarginTop,
                          paddingHorizontal: headerActionMetrics.leaguePaddingHorizontal,
                          paddingVertical: headerActionMetrics.leaguePaddingVertical,
                        },
                        { backgroundColor: eloForLayout.league.color },
                        pressed && styles.leagueBtnPressed,
                      ]}
                      onPress={() => router.navigate('/(tabs)/account')}
                    >
                      <Text style={[styles.leagueBtnText, { fontSize: headerActionMetrics.leagueFontSize }]}>
                        {animatedElo} {t('elo')} {eloForLayout.league.emoji}
                      </Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.accountBtn,
                    {
                      paddingHorizontal: headerActionMetrics.accountPaddingHorizontal,
                      paddingVertical: headerActionMetrics.accountPaddingVertical,
                    },
                    pressed && styles.accountBtnPressed,
                    authLoading && styles.accountBtnDisabled,
                  ]}
                  onPress={handleLogin}
                  disabled={authLoading}
                >
                  <View style={[styles.accountBtnContent, { gap: headerActionMetrics.accountGap }]}>
                    {authLoading ? (
                      <>
                        <Text
                          style={[
                            styles.accountBtnText,
                            {
                              fontSize: headerActionMetrics.accountFontSize,
                              lineHeight: headerActionMetrics.accountLineHeight,
                            },
                          ]}
                        >
                          {t('login')}
                        </Text>
                        <ActivityIndicator size="small" color={colors.white} />
                      </>
                    ) : (
                      <>
                        <Ionicons name="person-circle" size={16} color={colors.white} />
                        <Text
                          style={[
                            styles.accountBtnText,
                            {
                              fontSize: headerActionMetrics.accountFontSize,
                              lineHeight: headerActionMetrics.accountLineHeight,
                            },
                          ]}
                        >
                          {t('login')}
                        </Text>
                      </>
                    )}
                  </View>
                </Pressable>
              )}
            </View>
          </View>
        </View>

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
              <Pressable
                onLongPress={async () => {
                  // Hidden replay path so the tutorial can be tested repeatedly
                  // without reinstalling the app. Long-press lasts ~500ms which
                  // keeps it out of accidental-tap territory.
                  await useOnboardingStore.getState().reset();
                  router.push('/onboarding/play');
                }}
                delayLongPress={500}
              >
                <OutlinedTitle>WorldGuessr</OutlinedTitle>
              </Pressable>
            </Animated.View>

            {/* Right side: account area */}
            <View
              style={[styles.headerRight, styles.headerRightPlaceholder]}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {loggedIn ? (
                <>
                  <View style={styles.loggedInRow}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.accountBtn,
                        {
                          paddingHorizontal: headerActionMetrics.accountPaddingHorizontal,
                          paddingVertical: headerActionMetrics.accountPaddingVertical,
                        },
                        pressed && styles.accountBtnPressed,
                      ]}
                      onPress={() => router.navigate('/(tabs)/account')}
                    >
                      <PlayerName
                        name={user.username}
                        countryCode={user.countryCode}
                        flagSize={headerActionMetrics.flagSize}
                        gap={headerActionMetrics.accountGap}
                        style={styles.accountBtnContent}
                        textStyle={[
                          styles.accountBtnText,
                          {
                            fontSize: headerActionMetrics.accountFontSize,
                            lineHeight: headerActionMetrics.accountLineHeight,
                          },
                        ]}
                      />
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.friendBtn,
                        {
                          width: headerActionMetrics.friendSize,
                          height: headerActionMetrics.friendSize,
                        },
                        pressed && styles.friendBtnPressed,
                      ]}
                      onPress={() =>
                        router.push({ pathname: '/(tabs)/account', params: { tab: 'friends' } })
                      }
                    >
                      <Ionicons name="people" size={headerActionMetrics.friendIconSize} color={colors.white} />
                    </Pressable>
                  </View>

                  {eloForLayout && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.leagueBtn,
                        {
                          marginTop: headerActionMetrics.leagueMarginTop,
                          paddingHorizontal: headerActionMetrics.leaguePaddingHorizontal,
                          paddingVertical: headerActionMetrics.leaguePaddingVertical,
                        },
                        { backgroundColor: eloForLayout.league.color },
                        pressed && styles.leagueBtnPressed,
                      ]}
                      onPress={() => router.navigate('/(tabs)/account')}
                    >
                      <Text style={[styles.leagueBtnText, { fontSize: headerActionMetrics.leagueFontSize }]}>
                        {animatedElo} {t('elo')} {eloForLayout.league.emoji}
                      </Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.accountBtn,
                    {
                      paddingHorizontal: headerActionMetrics.accountPaddingHorizontal,
                      paddingVertical: headerActionMetrics.accountPaddingVertical,
                    },
                    pressed && styles.accountBtnPressed,
                    authLoading && styles.accountBtnDisabled,
                  ]}
                  onPress={handleLogin}
                  disabled={authLoading}
                >
                  <View style={[styles.accountBtnContent, { gap: headerActionMetrics.accountGap }]}>
                    {authLoading ? (
                      <>
                        <Text
                          style={[
                            styles.accountBtnText,
                            {
                              fontSize: headerActionMetrics.accountFontSize,
                              lineHeight: headerActionMetrics.accountLineHeight,
                            },
                          ]}
                        >
                          {t('login')}
                        </Text>
                        <ActivityIndicator size="small" color={colors.white} />
                      </>
                    ) : (
                      <>
                        <Ionicons name="person-circle" size={16} color={colors.white} />
                        <Text
                          style={[
                            styles.accountBtnText,
                            {
                              fontSize: headerActionMetrics.accountFontSize,
                              lineHeight: headerActionMetrics.accountLineHeight,
                            },
                          ]}
                        >
                          {t('login')}
                        </Text>
                      </>
                    )}
                  </View>
                </Pressable>
              )}
            </View>
          </View>

          {/* Menu */}
          <View style={styles.menu}>
            {/* Pending-deletion restore banner — shown when the account is inside
                its 30-day deletion grace window. Tapping prompts to cancel deletion
                (explicit Restore, never auto-cancel on login). */}
            {isAuthenticated && user?.pendingDeletion && (
              <Pressable
                style={({ pressed }) => [
                  styles.modBanner,
                  styles.modBannerError,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={handleRestoreAccount}
                disabled={restoringAccount}
              >
                <Text style={styles.modBannerEmoji}>🗑️</Text>
                <View style={styles.modBannerTextWrap}>
                  <Text style={[styles.modBannerTitle, { color: '#f44336' }]} numberOfLines={2}>
                    {user?.scheduledDeletionAt
                      ? t('accountScheduledForDeletion', { date: new Date(user.scheduledDeletionAt).toLocaleDateString() }, 'Your account is scheduled for deletion on {{date}}.')
                      : t('accountScheduledForDeletionShort', undefined, 'Your account is scheduled for deletion.')}
                  </Text>
                  <Text style={styles.modBannerAction} numberOfLines={1}>
                    {restoringAccount
                      ? t('loading', undefined, 'Loading…')
                      : t('restoreAccount', undefined, 'Restore Account')}
                  </Text>
                </View>
                {restoringAccount ? (
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
                )}
              </Pressable>
            )}

            {/* Persistent moderation banner — always visible while a mod action
                is pending, even after the popup is dismissed. Tapping it opens
                the account screen where full details live. */}
            {isAuthenticated && (user?.pendingNameChange || user?.banned) && (
              <Pressable
                style={({ pressed }) => [
                  styles.modBanner,
                  user?.pendingNameChange ? styles.modBannerWarning : styles.modBannerError,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => router.navigate('/(tabs)/account')}
              >
                <Text style={styles.modBannerEmoji}>
                  {user?.pendingNameChange ? '⚠️' : '⛔'}
                </Text>
                <View style={styles.modBannerTextWrap}>
                  <Text
                    style={[
                      styles.modBannerTitle,
                      { color: user?.pendingNameChange ? '#ff9800' : '#f44336' },
                    ]}
                    numberOfLines={1}
                  >
                    {user?.pendingNameChange
                      ? t('usernameChangeRequired')
                      : t(user?.banType === 'temporary' ? 'accountTempSuspended' : 'accountSuspended')}
                  </Text>
                  <Text style={styles.modBannerAction} numberOfLines={1}>
                    {user?.pendingNameChange ? t('changeName') : t('viewDetails')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
              </Pressable>
            )}

            <MenuDivider delay={getDelay()} ready={!authLoading} />

            <View style={styles.menuGroup}>
              <MenuButton
                label={t('singleplayer')}
                onPress={() => handleModePress('singleplayer')}
                delay={getDelay()}
                ready={!authLoading}
              />
              <MenuButton
                label={t('dailyChallenge')}
                onPress={() => handleModePress('dailyChallenge')}
                delay={getDelay()}
                ready={!authLoading}
                accessory={
                  dailyStatus.streak > 0 ? (
                    <DailyStreakBadge streak={dailyStatus.streak} variant={dailyStatus.variant} />
                  ) : null
                }
              />
              {/* Visible to GUESTS too (web parity — a hidden button is a lost
                  conversion funnel): a guest tap opens the link-Google prompt
                  instead of the queue. */}
              <MenuButton
                label={t('rankedDuel')}
                onPress={() => handleModePress('rankedDuel')}
                delay={getDelay()}
                ready={!authLoading}
              />
              <MenuButton
                label={isAuthenticated ? t('unrankedDuel') : t('findDuel')}
                onPress={() => handleModePress('unrankedDuel')}
                delay={getDelay()}
                ready={!authLoading}
              />
              {/* Gated on the SAME rollout switch as the verify flag: a build
                  that doesn't announce teamSupport gets server-rejected from
                  every team surface, so the entry must not exist either. */}
              {TEAM_SUPPORT && (
                <MenuButton
                  label={t('twovtwo')}
                  onPress={() => handleModePress('2v2')}
                  delay={getDelay()}
                  ready={!authLoading}
                  accessory={<NewSticker />}
                />
              )}
            </View>

            <MenuDivider delay={getDelay()} ready={!authLoading} />

            <View style={styles.menuGroup}>
              <MenuButton
                label={t('createGame')}
                onPress={() => handleModePress('createGame')}
                delay={getDelay()}
                ready={!authLoading}
              />
              <MenuButton
                label={t('joinGame')}
                onPress={() => handleModePress('joinGame')}
                delay={getDelay()}
                ready={!authLoading}
              />
            </View>

            <MenuDivider delay={getDelay()} ready={!authLoading} />

            <View style={styles.menuGroup}>
              <MenuButton
                label={t('communityMaps')}
                onPress={() => handleModePress('communityMaps')}
                delay={getDelay()}
                ready={!authLoading}
              />
            </View>
          </View>

          {/* Bottom Icons */}
          <View style={[styles.bottomIcons, isLandscape && styles.bottomIconsLandscape]}>
            <Pressable
              style={({ pressed }) => [styles.iconButton, styles.iconButtonDiscord, pressed && styles.iconButtonDiscordPressed]}
              onPress={() => Linking.openURL('https://discord.gg/ADw47GAyS5')}
            >
              <Ionicons name="logo-discord" size={24} color="rgba(255,255,255,0.95)" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.iconButton, styles.iconButtonYoutube, pressed && styles.iconButtonYoutubePressed]}
              onPress={() => Linking.openURL('https://www.youtube.com/@worldguessr?sub_confirmation=1')}
            >
              <Ionicons name="logo-youtube" size={24} color="rgba(255,255,255,0.95)" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              onPress={() => router.navigate('/(tabs)/leaderboard')}
            >
              <Ionicons name="trophy" size={24} color="rgba(255,255,255,0.85)" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
              onPress={() => router.push('/settings')}
              onLongPress={() => setWhatsNewDemo(true)}
              delayLongPress={500}
            >
              <Ionicons name="settings-outline" size={24} color="rgba(255,255,255,0.85)" />
            </Pressable>
          </View>
        </ScrollView>

        {/* Online player count — bottom right. Always mounted so it can slide
            in/out (see OnlineCountBadge); visibility drives the animation. */}
        <OnlineCountBadge
          visible={connected && playerCount > 0}
          count={playerCount}
          fontSize={shortestSide >= 768 ? 20 : shortestSide >= 430 ? 17 : 15}
          style={[
            styles.onlineCountContainer,
            // Raise to align vertically with the bottom footer icon row
            // (footer: paddingBottom spacing.xl + ~half of the 44px icons).
            { bottom: Math.max(insets.bottom, spacing.lg) + spacing.xl + 10, right: Math.max(insets.right, spacing.xl) },
          ]}
        />
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
                  {t('usernameChangeRequired')}
                </Text>
                {user.pendingNameChangePublicNote && (
                  <View style={styles.modPopupReasonBox}>
                    <Text style={styles.modPopupReasonLabel}>{t('reason')}</Text>
                    <Text style={styles.modPopupReasonText}>
                      {user.pendingNameChangePublicNote}
                    </Text>
                  </View>
                )}
                <Text style={styles.modPopupDesc}>
                  {t('usernameChangeExplanation')}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.modPopupActionBtn, { backgroundColor: '#ff9800' }, pressed && { opacity: 0.8 }]}
                  onPress={() => {
                    { modPopupDismissedNameChange = true; setDismissedNameChangeBanner(true); };
                    router.navigate('/(tabs)/account');
                  }}
                >
                  <Text style={[styles.modPopupActionBtnText, { color: '#000' }]}>{t('changeName')}</Text>
                </Pressable>
              </>
            )}

            {/* Account Banned */}
            {user?.banned && !user?.pendingNameChange && (
              <>
                <Text style={styles.modPopupEmoji}>⛔</Text>
                <Text style={[styles.modPopupTitle, { color: '#f44336' }]}>
                  {t(user.banType === 'temporary' ? 'accountTempSuspended' : 'accountSuspended')}
                </Text>
                {user.banType === 'temporary' && user.banExpiresAt && (
                  <Text style={styles.modPopupExpires}>
                    {t('expires')}: {new Date(user.banExpiresAt).toLocaleString()}
                  </Text>
                )}
                {user.banPublicNote && (
                  <View style={styles.modPopupReasonBox}>
                    <Text style={styles.modPopupReasonLabel}>{t('reason')}</Text>
                    <Text style={styles.modPopupReasonText}>{user.banPublicNote}</Text>
                  </View>
                )}
                <Text style={styles.modPopupDesc}>
                  {t(user.banType === 'temporary'
                    ? 'suspensionExplanationTemp'
                    : 'suspensionExplanationPerm')}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.modPopupActionBtn, { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }, pressed && { opacity: 0.8 }]}
                  onPress={() => {
                    { modPopupDismissedBan = true; setDismissedBanBanner(true); };
                    router.navigate('/(tabs)/account');
                  }}
                >
                  <Text style={styles.modPopupActionBtnText}>{t('viewDetails')}</Text>
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
              <Text style={styles.modPopupDismissBtnText}>{t('dismiss', undefined, 'Dismiss')}</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}

      <AccountSelectSheet
        visible={accountSheetVisible}
        onClose={() => setAccountSheetVisible(false)}
        // Android's sheet is Google-only, so the web "Link Google…" headline
        // stays accurate (and translated) there; iOS offers Apple too, so it
        // gets a provider-neutral title. The pitch line is provider-neutral in
        // every language, shared verbatim with web.
        title={loginUpsell
          ? (Platform.OS === 'ios'
            ? t(loginUpsell === '2v2' ? 'signInToPlay2v2' : 'signInToPlayRanked')
            : t(loginUpsell === '2v2' ? 'linkGoogle2v2Title' : 'linkGoogleRankedTitle'))
          : undefined}
        subtitle={loginUpsell
          ? t(loginUpsell === '2v2' ? 'linkGoogle2v2Desc' : 'linkGoogleRankedDesc')
          : undefined}
      />

      {/* What's New — auto-shows for logged-in users on version bump.
          Long-press the settings gear to preview it on demand (demo). */}
      <WhatsNewModal forceOpen={whatsNewDemo} onForceClose={() => setWhatsNewDemo(false)} />

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
  headerActionsOverlay: {
    position: 'absolute',
    zIndex: 10,
  },
  headerActionsOverlayInner: {
    alignItems: 'flex-end',
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
  headerRightPlaceholder: {
    opacity: 0,
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
  onlineCountContainer: {
    position: 'absolute',
  },
  onlineCount: {
    // Match web #g2_playerCount: full white, font-weight 500 (Lexend-Medium).
    color: '#fff',
    fontFamily: 'Lexend-Medium',
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
  menuButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  // Gold "NEW" chip (web .g2_nav_new_sticker palette: #ffd700→#ffb300 on #1a0a00).
  newSticker: {
    backgroundColor: '#ffc400',
    borderRadius: borderRadius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    transform: [{ rotate: '8deg' }],
    shadowColor: '#ffd700',
    shadowOpacity: 0.55,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  newStickerText: {
    color: '#1a0a00',
    fontSize: 10,
    fontFamily: 'Lexend-Bold',
    letterSpacing: 0.3,
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
  iconButtonDiscord: {
    backgroundColor: '#738adb',
  },
  iconButtonDiscordPressed: {
    backgroundColor: '#3e4970',
  },
  iconButtonYoutube: {
    backgroundColor: 'rgba(255, 0, 0, 0.5)',
  },
  iconButtonYoutubePressed: {
    backgroundColor: '#8b0000',
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
  modBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    marginBottom: 4,
  },
  modBannerWarning: {
    backgroundColor: 'rgba(255,152,0,0.15)',
    borderColor: '#ff9800',
  },
  modBannerError: {
    backgroundColor: 'rgba(244,67,54,0.15)',
    borderColor: '#f44336',
  },
  modBannerEmoji: {
    fontSize: 22,
  },
  modBannerTextWrap: {
    flex: 1,
  },
  modBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  modBannerAction: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
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
