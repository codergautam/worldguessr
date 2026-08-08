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
import { colors, getLeague, resolveLeague, t, formatCompact } from '../../src/shared';
import StampsTile from '../../src/components/home/StampsTile';
import PlayerCard, {
  playerCardMetrics,
  CORNER_GAP,
  type PlayerCardMetrics,
} from '../../src/components/home/PlayerCard';
import PlayerSheet from '../../src/components/home/PlayerSheet';
import { useAuthStore } from '../../src/store/authStore';
import { useMultiplayerStore } from '../../src/store/multiplayerStore';
import { api } from '../../src/services/api';
import { haptics } from '../../src/services/haptics';
import { spacing, borderRadius } from '../../src/styles/theme';
import AccountSelectSheet from '../../src/components/auth/AccountSelectSheet';
import { useLoginPrompt } from '../../src/hooks/useGoogleSignIn';
import useCountUp from '../../src/hooks/useCountUp';
import WhatsNewModal from '../../src/components/WhatsNewModal';
import Season1NoticeModal from '../../src/components/Season1NoticeModal';
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
  /** Optional trailing accessory rendered next to the label (e.g. the daily
   * streak pill on the Daily Challenge entry, mirroring web's DailyMenuItem). */
  accessory?: React.ReactNode;
}

/**
 * Entrance for the home nav column — web verbatim: `.g2_nav_ui > *` plays the
 * SAME `nav_slide_in 0.3s ease-in-out` on every child at once (title,
 * dividers, button groups, footer), so the whole column glides in as ONE unit
 * the moment it mounts. No per-button stagger (a previous version staggered
 * each row 60ms apart from -80px — the "fly-in parade" — which web never
 * does), and no auth gating: the menu list is static (Ranked shows for guests
 * too, 2v2 is a compile-time flag), so there is nothing to wait for and the
 * wave starts immediately, underneath the native splash fade-out.
 *
 * One hook instance drives every block (the same Animated.Values are shared
 * across the header/menu/footer Animated.Views), exactly like one CSS
 * keyframe animating all children in lock-step.
 */
// Web slides each nav child from translateX(-100%); the mobile column
// (title ≈230px, menu maxWidth 300) starts fully offscreen-left the same way.
const NAV_SLIDE_FROM = -300;

function useNavEntrance() {
  const slide = useRef(new Animated.Value(NAV_SLIDE_FROM)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 300ms ease-in-out on both channels = web's `nav_slide_in 0.3s ease-in-out`.
    Animated.parallel([
      Animated.timing(slide, {
        toValue: 0,
        duration: 300,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [slide, opacity]);

  return { transform: [{ translateX: slide }], opacity };
}

function MenuButton({ label, onPress, accessory }: MenuButtonProps) {
  return (
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
  );
}

/** The horizontal rule between menu groups — rides the menu block's shared
 * entrance (web parity: `.g2_nav_hr` is a `.g2_nav_ui > *` child). */
function MenuDivider() {
  return <View style={styles.divider} />;
}

/* The header pill row is GONE. `HeaderPills` laid out [Stamps] [ELO/league]
   under a username button and a friends button — four controls in two rows,
   three of which opened tabs of the same screen. All four are one PlayerCard
   now (src/components/home/PlayerCard.tsx), which keeps every invariant that
   block documented and enforces them in one place instead of across a row:

     1. THE RESERVED HEIGHT. The header still renders a hidden clone to reserve
        its own height, and the guest state still has to reserve the SAME height
        or the menu jumps at login. The card does it with a `ghost` copy of
        itself rather than a hand-matched spacer, so the two cannot drift.
     2. NOTHING WAITS ON A SECOND ROUND TRIP — `stamps`, `stampsEnabled` and
        `elo` all arrive in the auth response.
     3. THE NUMBERS GROW LEFTWARD. The card is right-anchored and its numbers
        column is right-aligned, so a balance gaining a digit extends into empty
        space rather than shoving anything. */

/**
 * The top-right corner: the player card (or the login button) with the
 * Community Maps button under it.
 *
 * ONE component, rendered TWICE — by the interactive absolute overlay and by
 * the hidden in-flow clone that reserves the header's height. They must produce
 * identical layout, so they share this code rather than two hand-copied JSX
 * blocks that drift.
 *
 * MAPS SITS HERE, not in the menu below. It is not a game mode — the map picker
 * is reachable from Singleplayer already — and it is not account chrome either,
 * so it is neither a menu row nor a row inside the card. It is simply the next
 * item in the corner, which is exactly where the web build puts it.
 */
function HeaderCorner({
  variant,
  cardMetrics,
  loginMetrics,
  username,
  countryCode,
  nameGlow,
  elo,
  league,
  animatedElo,
  showStamps,
  stamps,
  animatedStamps,
  authLoading,
  onCardPress,
  onLogin,
  onMapsPress,
  onStampsPress,
}: {
  /** card = signed in · login = signed out · ghost = blank height reservation ·
   *  none = awaiting username, the forced modal is covering the screen */
  variant: 'card' | 'login' | 'ghost' | 'none';
  cardMetrics: PlayerCardMetrics;
  loginMetrics: { paddingHorizontal: number; paddingVertical: number; fontSize: number; lineHeight: number; gap: number };
  username: string;
  countryCode?: string | null;
  nameGlow?: string | null;
  elo: number | null;
  league: ReturnType<typeof resolveLeague> | null;
  animatedElo: number;
  showStamps: boolean;
  stamps: number;
  animatedStamps: number;
  authLoading: boolean;
  onCardPress?: () => void;
  onLogin?: () => void;
  onMapsPress?: () => void;
  onStampsPress?: () => void;
}) {
  const ghost = variant === 'ghost';
  return (
    <View style={styles.headerRight}>
      {variant === 'login' ? (
        <Pressable
          style={({ pressed }) => [
            styles.accountBtn,
            {
              paddingHorizontal: loginMetrics.paddingHorizontal,
              paddingVertical: loginMetrics.paddingVertical,
            },
            pressed && styles.accountBtnPressed,
            authLoading && styles.accountBtnDisabled,
          ]}
          onPress={onLogin}
          disabled={authLoading}
        >
          <View style={[styles.accountBtnContent, { gap: loginMetrics.gap }]}>
            {authLoading ? (
              <>
                <Text style={[styles.accountBtnText, { fontSize: loginMetrics.fontSize, lineHeight: loginMetrics.lineHeight }]}>
                  {t('login')}
                </Text>
                <ActivityIndicator size="small" color={colors.white} />
              </>
            ) : (
              <>
                <Ionicons name="person-circle" size={16} color={colors.white} />
                <Text style={[styles.accountBtnText, { fontSize: loginMetrics.fontSize, lineHeight: loginMetrics.lineHeight }]}>
                  {t('login')}
                </Text>
              </>
            )}
          </View>
        </Pressable>
      ) : variant === 'none' ? null : (
        <PlayerCard
          metrics={cardMetrics}
          username={username}
          countryCode={countryCode}
          nameGlow={nameGlow}
          elo={elo}
          league={league}
          animatedElo={animatedElo}
          onPress={onCardPress}
          ghost={ghost}
        />
      )}

      {/* The two small chips, side by side under the card: what you can spend,
          and where to go. They share a height and a skin so they read as a pair
          rather than as two more cards.

          THE GHOST RENDERS THE STAMPS TILE TOO. The clone's whole job is to
          reserve one header height for every auth state — if the tile only
          appeared once the flag arrived, signing in would grow the header and
          shove the menu down, which is exactly the jump the clone exists to
          prevent. */}
      <View style={styles.cornerChips}>
        <StampsTile
          visible={showStamps || ghost}
          stamps={stamps}
          animatedStamps={animatedStamps}
          fontSize={cardMetrics.chipFontSize}
          height={cardMetrics.chipHeight}
          onPress={onStampsPress}
          ghost={ghost}
        />
        <Pressable
          style={({ pressed }) => [styles.mapsBtn, { height: cardMetrics.chipHeight }, pressed && styles.mapsBtnPressed]}
          onPress={onMapsPress}
          disabled={!onMapsPress}
          accessibilityRole="button"
          accessibilityLabel={t('communityMaps')}
        >
          <Ionicons name="map" size={cardMetrics.chipFontSize * 1.05} color={colors.white} />
          <Text style={[styles.mapsBtnText, { fontSize: cardMetrics.chipFontSize }]}>{t('maps')}</Text>
        </Pressable>
      </View>
    </View>
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
  onWidth,
}: {
  visible: boolean;
  count: number;
  fontSize: number;
  style: StyleProp<ViewStyle>;
  onWidth?: (width: number) => void;
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
      // Transforms don't affect layout, so this reports the true text width
      // even mid-slide; the parent uses it for footer collision detection.
      onLayout={onWidth ? (e) => onWidth(e.nativeEvent.layout.width) : undefined}
    >
      <Text style={[styles.onlineCount, { fontSize }]}>
        {t('onlineCnt', { cnt: formatCompact(shownCount) })}
      </Text>
    </Animated.View>
  );
}

// Footer icon button height — shared by styles.iconButton and the online
// badge's raised position so the two can't drift apart.
const FOOTER_ICON_HEIGHT = 44;

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
  const [accountSheetVisible, setAccountSheetVisible] = useState(false);
  const [playerSheetOpen, setPlayerSheetOpen] = useState(false);
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

  // Opening wave: header, menu and footer all share this one entrance (web:
  // one keyframe on all `.g2_nav_ui` children). The header actions overlay
  // reuses only its opacity — a top-right element sliding in from the LEFT
  // would read wrong, and web's account corner doesn't slide either.
  const navEntrance = useNavEntrance();

  // The backdrop settles from a gentle zoom while the native splash dissolves
  // over it, so app-open reads as one continuous reveal instead of a hard cut.
  // Runs once per mount = once per app open (home stays mounted thereafter).
  const bgScale = useRef(new Animated.Value(1.05)).current;
  useEffect(() => {
    Animated.timing(bgScale, {
      toValue: 1,
      duration: 1400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [bgScale]);

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
        // Server-computed league beats the local cutoff table (a seasonal
        // re-anchor then needs no store release). authStore carries whatever
        // the auth response / ws `elo` message last said; resolveLeague falls
        // back to the local bucket when that is absent.
        league: resolveLeague(user.elo, user.league),
      });
    }

    // Fetch fresh data
    api.eloRank(user.username)
      .then((data) => {
        if (data && data.elo !== undefined) {
          setEloData({
            elo: data.elo,
            rank: data.rank,
            // api/eloRank.js returns the WHOLE league object — prefer it.
            league: resolveLeague(data.elo, data.league),
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
        : { elo: user.elo, rank: prev?.rank ?? 0, league: resolveLeague(user.elo, user.league) },
    );
  }, [isAuthenticated, user?.elo]);

  // Reset ELO state on logout. The counters rewind themselves once their
  // targets go away (useCountUp), so there is nothing to reset here but the
  // data.
  useEffect(() => {
    if (!isAuthenticated) {
      setEloData(null);
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
      t('restoreAccount'),
      t('restoreAccountConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('restoreAccount'),
          onPress: async () => {
            try {
              setRestoringAccount(true);
              await api.cancelDeletion(secret);
              updateUser({ pendingDeletion: false, scheduledDeletionAt: undefined });
              Alert.alert(
                t('accountRestoredTitle'),
                t('accountRestoredBody'),
              );
            } catch (e: any) {
              Alert.alert(t('error'), e?.message || String(e));
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
  // Badge on the card's Friends menu row. The friends button used to be a
  // permanent fixture of this corner; now that it is a row inside a sheet, a
  // pending request has to announce itself from outside the sheet or it is
  // invisible until you go looking. Already global here — web needed the ws
  // message lifted into its provider to get the same integer.
  const friendRequestCount = useMultiplayerStore((s) => s.receivedRequests.length);
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
        t('notConnectedReopenApp'),
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

  // The online badge (bottom-right, fixed) sits on the same line as the footer
  // icon row (bottom-left, scrolls). On narrow screens they can collide
  // horizontally, so measure both instead of guessing by breakpoint — the
  // badge width varies with count, locale, and font size. When there isn't
  // room on the footer's line, the badge hops just above the icon row.
  const [onlineBadgeWidth, setOnlineBadgeWidth] = useState(0);
  const [footerIconsRightEdge, setFooterIconsRightEdge] = useState(0);
  const onlineBadgeRight = Math.max(insets.right, spacing.xl);
  const safeAreaWidth = width - insets.left - insets.right;
  const onlineBadgeCollidesFooter =
    onlineBadgeWidth > 0 &&
    footerIconsRightEdge > 0 &&
    safeAreaWidth - onlineBadgeRight - onlineBadgeWidth <
      footerIconsRightEdge + spacing.md;

  const cardMetrics = playerCardMetrics(shortestSide);

  // The login button keeps the metrics it always had; it is not a card.
  const loginMetrics =
    shortestSide >= 768
      ? { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, fontSize: 20, lineHeight: 24, gap: spacing.md }
      : shortestSide >= 430
        ? { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, fontSize: 18, lineHeight: 22, gap: spacing.sm }
        : { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontSize: 17, lineHeight: 20, gap: spacing.sm };

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
      ? { elo: user.elo, rank: 0, league: resolveLeague(user.elo, user.league) }
      : null);

  // Stamps button, sibling of the league pill. FAILS CLOSED: `stampsEnabled` is
  // the server's kill switch and authStore coerces a missing field to false, so
  // a server predating the shop renders no button at all rather than an entry
  // into a screen whose every call 404s. Signed-out is covered twice over —
  // `loggedIn` here, and there is no user object to read a balance from.
  const showStampsBtn = loggedIn && user?.stampsEnabled === true;
  const stampsBalance = user?.stamps ?? 0;

  // Both pills count up from 0 on open, off the SAME hook so they cannot fall
  // out of step. The rating targets eloForLayout (known the instant login
  // resolves) rather than the async eloData, so the count starts on the frame
  // the pill appears instead of waiting on a round trip.
  const animatedElo = useCountUp(eloForLayout?.elo);
  const animatedStamps = useCountUp(showStampsBtn ? stampsBalance : null);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.backgroundImage, { transform: [{ scale: bgScale }] }]}>
        <ImageBackground
          source={require('../../assets/street2.jpg')}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      </Animated.View>
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
        <Animated.View
          style={[
            styles.headerActionsOverlay,
            { opacity: navEntrance.opacity },
            {
              top: insets.top + spacing.md,
              right: Math.max(insets.right, spacing.xl),
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.headerActionsOverlayInner} pointerEvents="box-none">
            <HeaderCorner
              variant={awaitingUsername ? 'none' : loggedIn ? 'card' : 'login'}
              cardMetrics={cardMetrics}
              loginMetrics={loginMetrics}
              username={user?.username ?? ''}
              countryCode={user?.countryCode}
              nameGlow={user?.cosmetics?.equipped?.nameGlow}
              elo={eloForLayout?.elo ?? null}
              league={eloForLayout?.league ?? null}
              animatedElo={animatedElo}
              showStamps={showStampsBtn}
              stamps={stampsBalance}
              animatedStamps={animatedStamps}
              authLoading={authLoading}
              onCardPress={() => setPlayerSheetOpen(true)}
              onLogin={handleLogin}
              onMapsPress={() => handleModePress('communityMaps')}
              onStampsPress={() => router.push('/shop')}
            />
          </View>
        </Animated.View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          {/* Header — rides the shared entrance wave */}
          <Animated.View style={[styles.header, navEntrance]}>
            <View style={{ transform: [{ translateY: 30 }] }}>
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
            </View>

            {/* THE MEASUREMENT CLONE. This hidden in-flow copy is what gives the
                header its height; the visible corner is the absolute overlay
                above. It renders the SAME HeaderCorner so the two cannot drift.

                IT IS ALWAYS THE CARD VARIANT, signed in or not. The menu below
                does not wait on auth, so the header has to reserve one height
                for both states or the whole column jumps the moment the session
                resolves. `ghost` is the card's own tree with the text blanked —
                height-exact by construction, which the hand-matched
                league-pill-sized spacer this replaces never quite was. */}
            <View
              style={[styles.headerRight, styles.headerRightPlaceholder]}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <HeaderCorner
                variant={loggedIn ? 'card' : 'ghost'}
                cardMetrics={cardMetrics}
                loginMetrics={loginMetrics}
                username={user?.username ?? ''}
                countryCode={user?.countryCode}
                nameGlow={user?.cosmetics?.equipped?.nameGlow}
                elo={eloForLayout?.elo ?? null}
                league={eloForLayout?.league ?? null}
                animatedElo={animatedElo}
                showStamps={showStampsBtn}
                stamps={stampsBalance}
                animatedStamps={animatedStamps}
                authLoading={authLoading}
              />
            </View>
          </Animated.View>

          {/* Menu — rides the shared entrance wave, one unit like web */}
          <Animated.View style={[styles.menu, navEntrance]}>
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
                      ? t('accountScheduledForDeletion', { date: new Date(user.scheduledDeletionAt).toLocaleDateString() })
                      : t('accountScheduledForDeletionShort')}
                  </Text>
                  <Text style={styles.modBannerAction} numberOfLines={1}>
                    {restoringAccount
                      ? t('loading')
                      : t('restoreAccount')}
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

            <MenuDivider />

            <View style={styles.menuGroup}>
              <MenuButton
                label={t('singleplayer')}
                onPress={() => handleModePress('singleplayer')}
              />
              <MenuButton
                label={t('dailyChallenge')}
                onPress={() => handleModePress('dailyChallenge')}
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
              />
              <MenuButton
                label={isAuthenticated ? t('unrankedDuel') : t('findDuel')}
                onPress={() => handleModePress('unrankedDuel')}
              />
              {/* Gated on the SAME rollout switch as the verify flag: a build
                  that doesn't announce teamSupport gets server-rejected from
                  every team surface, so the entry must not exist either. */}
              {TEAM_SUPPORT && (
                <MenuButton
                  label={t('twovtwo')}
                  onPress={() => handleModePress('2v2')}
                />
              )}
            </View>

            <MenuDivider />

            <View style={styles.menuGroup}>
              <MenuButton
                label={t('createGame')}
                onPress={() => handleModePress('createGame')}
              />
              <MenuButton
                label={t('joinGame')}
                onPress={() => handleModePress('joinGame')}
              />
            </View>

          </Animated.View>

          {/* Bottom Icons — rides the shared entrance wave. onLayout is safe
              here: transforms don't affect layout, so the measured right edge
              is the settled position even mid-slide. */}
          <Animated.View
            style={[styles.bottomIcons, isLandscape && styles.bottomIconsLandscape, navEntrance]}
            // Right edge in safe-area coords (the ScrollView spans the full
            // safe width), consumed by the online-badge collision check.
            onLayout={(e) => setFooterIconsRightEdge(e.nativeEvent.layout.x + e.nativeEvent.layout.width)}
          >
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
          </Animated.View>
        </ScrollView>

        {/* Online player count — bottom right. Always mounted so it can slide
            in/out (see OnlineCountBadge); visibility drives the animation. */}
        <OnlineCountBadge
          visible={connected && playerCount > 0}
          count={playerCount}
          fontSize={shortestSide >= 768 ? 20 : shortestSide >= 430 ? 17 : 15}
          onWidth={setOnlineBadgeWidth}
          style={[
            styles.onlineCountContainer,
            {
              // Default: align vertically with the footer icon row (footer:
              // paddingBottom spacing.xl + ~half of the icons). On screens too
              // narrow to share that line, sit just above the icons instead.
              bottom: onlineBadgeCollidesFooter
                ? Math.max(insets.bottom, spacing.lg) +
                  (isLandscape ? spacing.md : spacing.xl) +
                  FOOTER_ICON_HEIGHT +
                  spacing.sm
                : Math.max(insets.bottom, spacing.lg) + spacing.xl + 10,
              right: onlineBadgeRight,
            },
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
              <Text style={styles.modPopupDismissBtnText}>{t('dismiss')}</Text>
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

      {/* The player card's menu. Rows route into the account screen's own tabs
          and the shop — no new destinations, just doors that used to be four
          separate buttons in the corner. */}
      <PlayerSheet
        visible={playerSheetOpen}
        onClose={() => setPlayerSheetOpen(false)}
        showShop={showStampsBtn}
        friendRequests={friendRequestCount}
        onOpenElo={() => router.push({ pathname: '/(tabs)/account', params: { tab: 'elo' } })}
        onOpenShop={() => router.push('/shop')}
        onOpenProfile={() => router.navigate('/(tabs)/account')}
        onOpenFriends={() => router.push({ pathname: '/(tabs)/account', params: { tab: 'friends' } })}
      />

      {/* What's New — auto-shows for logged-in users on version bump.
          Long-press the settings gear to preview it on demand (demo). */}
      <WhatsNewModal forceOpen={whatsNewDemo} onForceClose={() => setWhatsNewDemo(false)} />

      {/* Season 1 migration notice, once per account. The SERVER decides whether
          (it stops sending `eloNotice` after the ack); the component decides when
          and self-delays past the app-open animation. Gated on `loggedIn` rather
          than `isAuthenticated` so it can never stack on the forced
          SetUsernameModal that covers the screen while a username is missing. */}
      {loggedIn && <Season1NoticeModal />}

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
  // THE CORNER COLUMN: card (or login button), then Community Maps. The gap is
  // the only vertical measurement left in this corner — everything used to be
  // absolutely placed and hand-offset against whatever sat above it.
  headerRight: {
    alignItems: 'flex-end',
    gap: CORNER_GAP,
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
  // The web build's .daily-community-maps-btn, in native terms: same green,
  // same 1.4px dark rim, same icon + label. It is a sibling of the card in the
  // corner column, so it needs no coordinates of its own.
  // The two chips under the card sit side by side, not stacked: they are the
  // small stuff, and a third and fourth full-width row down the corner is how
  // the clutter got here in the first place.
  cornerChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: CORNER_GAP,
  },
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.4,
    borderColor: colors.primaryDark,
    backgroundColor: Platform.OS === 'android' ? '#1a4423' : colors.primaryTransparent,
  },
  mapsBtnPressed: {
    backgroundColor: colors.primary,
  },
  mapsBtnText: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // (Removed) friendBtn / pillRow / leagueBtn* / stampsBtn* — the four controls
  // that used to live in this corner. Their layout invariants did NOT go with
  // them; they moved into src/components/home/PlayerCard.tsx: tabular figures
  // and a reserved width on both counters, one line box per row so the two
  // columns align, and no border on the balance cell.
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
  // Bottom icons
  bottomIcons: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: spacing.xl,
    paddingTop: spacing.lg,
    // Shrink-wrap (don't stretch) so onLayout reports the icons' true right
    // edge for the online-badge collision check. Visually identical.
    alignSelf: 'flex-start',
  },
  bottomIconsLandscape: {
    paddingBottom: spacing.md,
  },
  iconButton: {
    width: 50,
    height: FOOTER_ICON_HEIGHT,
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
