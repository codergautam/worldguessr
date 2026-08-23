/**
 * Queue screen — shown while searching for a multiplayer match.
 * Animated radar "sonar" pulse behind a spinning compass, ranked/unranked
 * theming, an ELO range chip for ranked, and an elapsed timer. The shared
 * back button (top-left) is the single cancel affordance.
 *
 * Layout is orientation-aware: a vertical stack in portrait, and a centered
 * radar-beside-info row in landscape so everything fits one screen without
 * scrolling or clipping on short viewports.
 */

import { memo, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import SiteBackground from '../src/components/SiteBackground';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, useNavigation } from 'expo-router';
import { colors, t } from '../src/shared';
import { spacing, fontSizes, borderRadius } from '../src/styles/theme';
import { wsService } from '../src/services/websocket';
import { useMultiplayerStore, queueTeardownState } from '../src/store/multiplayerStore';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { MATCHMAKING_VEIL_COLORS } from '../src/styles/matchmakingBackdrop';
import BackButton from '../src/components/ui/BackButton';
import WgWordmark from '../src/components/ui/WgWordmark';
import GameChat from '../src/components/multiplayer/GameChat';
import { formatQueueEta } from '@shared/time/queueEta';

// Plate fill for the segmented data strip. Neutral by ruling (see
// styles/queueScreen.css's header): the site's own panel colour — accountModal
// paints its surface as rgba(0,30,15) over black — darkened, NOT the strongly
// green --primaryTransparent the .timer recipe uses.
const SURFACE = 'rgba(14, 34, 23, 0.52)';

const RADAR_MAX = 240; // radar container ceiling; everything inside derives from this

// 512x512, 90 frames, painted at ~60px. expo-image DELIBERATELY: RN core hands
// an animated GIF to the platform decoder, which materialises every frame at
// source resolution up front and holds them (~90MB) for the whole search.
// expo-image decodes incrementally and downsamples toward the target box.
const LOADER = require('../assets/loader.gif');

/** Expanding "sonar" rings that ripple outward from the center. */
function PulseRings({ accent, size }: { accent: string; size: number }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 2600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      );
    const anims = [make(a, 0), make(b, 870), make(c, 1740)];
    anims.forEach((x) => x.start());
    return () => anims.forEach((x) => x.stop());
  }, [a, b, c]);

  return (
    <>
      {[a, b, c].map((v, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            { position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2 },
            { borderColor: accent },
            {
              transform: [
                { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.55] }) },
              ],
              opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] }),
            },
          ]}
        />
      ))}
    </>
  );
}

/** One cell of the data plate, fading and sliding in on mount. */
function QueueCell({ divided, children }: { divided: boolean; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v]);
  return (
    <Animated.View
      style={[
        styles.dataCell,
        divided && styles.dataCellDivided,
        {
          opacity: v,
          transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * What a reserved cell shows before its value lands: a BLANK that holds the
 * line box (nbsp — a plain space can collapse to nothing), not a glyph.
 * "..." was tried and rejected (user ruling Aug 14): on a queue whose data
 * arrives one RTT in, the dots painted for a fraction of a second and then
 * switched, which reads as flicker, not as pending. NEVER an optimistic
 * client-computed range either (user ruling Aug 13: stale cached elo made
 * the guess visibly self-correct when the authoritative range arrived).
 */
const VALUE_PLACEHOLDER = ' ';

/**
 * A reserved cell's value: blank until the first real value, ONE soft fade-in
 * when it arrives, then INSTANT swaps for every later change — mirrors web's
 * ReservedValue / .wgQueue__cellValue--arrive exactly. The per-change
 * fade-out/fade-in dance was the "random switch" flicker (user ruling
 * Aug 14); the elapsed clock beside this updates instantly every second, so
 * instant swaps are the screen's native language. `dimStyle` tracks the
 * CURRENT value (rough ETA wording stays dimmed after arrival).
 */
function ReservedValue({ value, style, dimStyle }: {
  value: string;
  style: StyleProp<TextStyle>;
  dimStyle?: StyleProp<TextStyle>;
}) {
  const pending = value === VALUE_PLACEHOLDER;
  // The Animated value is bound UNCONDITIONALLY — a conditional binding that
  // consults a ref at render time misses the ref flip (refs don't re-render)
  // and the arrival pops instead of fading. Seeded 0 when mounted pending
  // (the invisible nbsp still holds the line box), 1 when mounted with a
  // value already in the store (re-entering the screen replays no arrival).
  const opacity = useRef(new Animated.Value(pending ? 0 : 1)).current;
  const arrivedRef = useRef(!pending);
  useEffect(() => {
    if (pending || arrivedRef.current) return;
    // First real value: the one and only animation this component runs.
    arrivedRef.current = true;
    const arrive = Animated.timing(opacity, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    arrive.start();
    return () => arrive.stop();
  }, [pending, opacity]);
  return (
    <Animated.Text style={[style, dimStyle, { opacity }]}>
      {value}
    </Animated.Text>
  );
}

// Keyed on the server's join instant so a new queue always brings a new anchor
// and a stale one is impossible. See the clock comment inside the component.
let clockAnchor: { key: number | null; at: number } = { key: null, at: 0 };
function anchorFor(queuedAt: number) {
  if (clockAnchor.key !== queuedAt) clockAnchor = { key: queuedAt, at: performance.now() };
  return clockAnchor.at;
}

/**
 * The elapsed clock. PHASE-LOCKED to the anchor's second boundary, and its own
 * component so the tick is its own business — both halves matter.
 *
 * The pump was a bare setInterval(1000), which is phased to MOUNT, while the
 * digit flips on a boundary phased to the ANCHOR, which lands one server round
 * trip AFTER mount. Permanently ~1 RTT apart, so any unrelated re-render
 * landing between the two phases painted the next second EARLY and the
 * interval's own tick then held it LONG: the "sprints, then hangs" stutter.
 * Web fixed this in components/queueScreen.js; mobile only ever got the other
 * half of that fix (the anchor). Re-arming off the live clock makes every
 * second last exactly one second however late a callback runs.
 *
 * Isolating it is the RN half. The tick lived in QueueScreen, so one second of
 * clock re-committed the background, both veils, the radar, the spinner, the
 * data plate and (2v2) the chat into the native tree. A DOM text swap is free;
 * a Fabric commit is not, and the JS-thread pause it costs delays the NEXT
 * timer callback — the stutter fed itself. `memo` is load-bearing here, not
 * decoration: it is what stops a parent re-render from painting a digit off
 * phase, which is the early-flip half of the bug.
 */
const ElapsedClock = memo(function ElapsedClock({ anchor }: { anchor: number | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (anchor === null) return; // nothing displayed yet
    let id: ReturnType<typeof setTimeout>;
    const arm = () => {
      const ms = performance.now() - anchor;
      id = setTimeout(() => {
        setTick((n) => n + 1);
        arm();
      }, 1000 - (ms % 1000) + 5);
    };
    arm();
    return () => clearTimeout(id);
  }, [anchor]);
  // DERIVED from a timestamp difference, never an incremented counter: RN
  // suspends JS timers while the app is backgrounded, so a counter silently
  // loses every second spent in another app. A difference cannot.
  const elapsed = anchor === null ? 0 : Math.floor((performance.now() - anchor) / 1000);
  const ss = elapsed % 60;
  return (
    <View style={styles.timerRow}>
      <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.5)" />
      <Text style={styles.timerText}>
        {`${Math.floor(elapsed / 60)}:${ss < 10 ? '0' : ''}${ss}`}
      </Text>
    </View>
  );
});

export default function QueueScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const gameQueued = useMultiplayerStore((s) => s.gameQueued);
  const publicDuelRange = useMultiplayerStore((s) => s.publicDuelRange);
  // Reserves the ELO cell's layout for ranked (guests never receive a range,
  // so they never reserve — mirrors web's signedIn prop on QueueScreen).
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const inGame = useMultiplayerStore((s) => s.inGame);
  const gameState = useMultiplayerStore((s) => s.gameData?.state);
  const chatEnabled = useSettingsStore((s) => s.multiplayerChatEnabled);
  const exitedRef = useRef(false);
  const is2v2 = gameQueued === '2v2';
  // 2v2 Cancel is a REQUEST, not a local teardown (see handleCancel) — this
  // just dims the button while the server round-trips the lobby restore.
  const [cancelling, setCancelling] = useState(false);

  // The anchor is LOCAL, keyed on the server's join instant. It used to be
  // `Date.now() + wsService.timeOffset - queuedAt`, but queuedAt is stamped on
  // the ws server's clock, so that made the stopwatch a function of device to
  // server clock skew — and timeOffset, the correction for exactly that gap,
  // starts at 0 and only becomes accurate a round trip later. A device clock
  // running behind the server pinned the display at 0:00 for the width of the
  // skew and then leapt when the offset landed. Nothing here needs server time:
  // the ack arrives moments after the join, so first sight of this queue IS the
  // start, on one monotonic local clock no skew can reach.
  const queuedAt = useMultiplayerStore((s) => s.queuedAt);
  const queueEta = useMultiplayerStore((s) => s.queueEta);
  // This ranked queue resolves into the placement seeding match (server
  // follow-up `queuePlacement`). Overrides the no-eyebrow ruling below and
  // swaps the data plate for the one-line explainer.
  const placementPending = useMultiplayerStore((s) => s.placementPending);
  // Only the ANCHOR lives here; the tick lives inside <ElapsedClock/>.
  const anchor = typeof queuedAt === 'number' ? anchorFor(queuedAt) : null;

  // How long this queue USUALLY takes in total, from the moment you joined —
  // not a countdown, and deliberately static (the server latches it for the
  // session). Ranked 1v1 only; 'unknown' renders nothing, because no data is a
  // reason to say nothing rather than to invent a number.
  //
  // 'rough' is a MODELLED estimate, not an observed one. It gets vague wording
  // and the neutral chip style — a guess from a hardcoded table may never wear
  // the visual confidence of a measured median.
  const ROUGH_KEYS = { short: 'queueEtaRoughShort', mid: 'queueEtaRoughMid', long: 'queueEtaRoughLong' } as const;
  const etaRough = queueEta?.state === 'rough' && !!queueEta.tier;
  // Flip to the long-wait wording as soon as the server-provided deadline is
  // crossed. Waiting for the 5s ETA beat could otherwise leave an already-
  // expired quote visible for several seconds.
  //
  // ONE TIMER ARMED FOR THE DEADLINE, not a per-second poll. The poll was the
  // only other thing this screen needed the 1 Hz tick for, and it could only
  // notice the crossing on the next tick, so the flip landed up to a second
  // late. This lands on it.
  const longAfterMs = typeof queueEta?.longAfterSeconds === 'number'
    ? queueEta.longAfterSeconds * 1000
    : null;
  const [etaPastFlag, setEtaPastThreshold] = useState(false);
  // UNION of the timer flag and a render-time read. The timer alone was a
  // regression the poll never had: the effect runs AFTER the first paint, so
  // re-entering a queue that is ALREADY past its deadline showed the stale
  // quote for one frame. Reading the clock here as well costs nothing (this
  // screen no longer renders per second) and restores the old correct-on-every-
  // render behaviour, while the timer covers the crossing that happens when
  // nothing else is rendering.
  const etaPastThreshold =
    etaPastFlag ||
    (anchor !== null && longAfterMs !== null && performance.now() - anchor > longAfterMs);
  useEffect(() => {
    if (anchor === null || longAfterMs === null) {
      setEtaPastThreshold(false);
      return;
    }
    const remaining = longAfterMs - (performance.now() - anchor);
    if (remaining <= 0) {
      setEtaPastThreshold(true);
      return;
    }
    // A restated deadline must not inherit the old one's verdict.
    setEtaPastThreshold(false);
    const id = setTimeout(() => setEtaPastThreshold(true), remaining);
    return () => clearTimeout(id);
  }, [anchor, longAfterMs]);
  const etaStr = queueEta?.state === 'long' || etaPastThreshold
    ? t('queueEtaLong')
    : etaRough
      ? t(ROUGH_KEYS[queueEta!.tier as keyof typeof ROUGH_KEYS])
      : queueEta?.state === 'ok' && Number.isFinite(queueEta.seconds)
        ? formatQueueEta(t, queueEta.seconds!)
        : null;

  // Radar scales to the shorter axis so it never crowds the rest of the screen.
  // Landscape is height-bound; portrait stays comfortably under the ceiling.
  const radarSize = isLandscape
    ? Math.min(RADAR_MAX, height * 0.6)
    : Math.min(RADAR_MAX, height * 0.32, width * 0.72);
  const ringBase = radarSize * 0.625;
  const coreSize = radarSize * 0.43;
  const compassSize = radarSize * 0.25;

  const titleSize = isLandscape
    ? Math.min(34, Math.max(22, height * 0.085))
    : Math.min(40, Math.max(26, width * 0.085));

  // Single exit path. Idempotent — caller can race state updates without double-popping.
  const exitBack = () => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    router.back();
  };

  // Match found → home.tsx owns navigating into /game/multiplayer. Mark this
  // screen exited so the beforeRemove cleanup below won't send leaveQueue when
  // the queue screen is later torn down underneath the game.
  useEffect(() => {
    if (inGame && gameState) {
      exitedRef.current = true;
    }
  }, [inGame, gameState]);

  // A 2v2 cancel the server never answered (dead socket, dropped message):
  // un-dim after a grace window so the X is visibly pressable again — an
  // idempotent re-send recovers. The normal path unmounts this screen (lobby
  // restore → nav owner replace) long before the timer fires.
  useEffect(() => {
    if (!cancelling) return;
    const timer = setTimeout(() => setCancelling(false), 5000);
    return () => clearTimeout(timer);
  }, [cancelling]);

  // Server-side cancellation (gameCancelled etc.) → pop
  useEffect(() => {
    if (!gameQueued && !inGame) {
      exitBack();
    }
  }, [gameQueued, inGame]);

  // Swipe / hardware back → tell server, then let nav unwind naturally.
  // Leaving-the-queue is expressed as STATE ("no match started"), not just the
  // exitedRef: when a match lands, this screen's exit can be driven by the nav
  // owner (home.tsx replace) in the same commit that another effect marks
  // exitedRef — cross-component effect order isn't guaranteed, so a ref-only
  // guard could fire leaveQueue at the freshly-started match and forfeit it.
  //
  // 2v2: the gesture must behave exactly like the X — a cancel REQUEST that
  // stays put (binding ruling: backing out restores the staging-lobby card,
  // never home). Letting the pop proceed here produced a home flash followed
  // by the restored lobby snapshot yanking the user straight back in.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (exitedRef.current) return;
      const s = useMultiplayerStore.getState();
      // A game/lobby snapshot already landed → this removal is nav-owner
      // driven (match found / lobby restore / auto-demotion), not a user
      // cancel. Let it pass FIRST: the demotion burst can flush both its
      // messages in one commit, leaving gameQueued '2v2' AND inGame true —
      // intercepting that replace would leaveQueue the auto stage-1 requeue
      // the user never asked to leave.
      if (s.inGame || s.gameData) {
        exitedRef.current = true;
        return;
      }
      // 2v2: the gesture must behave exactly like the X — a cancel REQUEST
      // that stays put (ruling: backing out restores the lobby, never home).
      if (s.gameQueued === '2v2') {
        e.preventDefault();
        setCancelling(true);
        wsService.send({ type: 'leaveQueue' });
        return;
      }
      exitedRef.current = true;
      wsService.send({ type: 'leaveQueue' });
      useMultiplayerStore.setState({ ...queueTeardownState });
    });
    return unsubscribe;
  }, [navigation]);

  const handleCancel = () => {
    if (exitedRef.current) return;
    // 2v2 stage-2 cancel: ask the server and WAIT. It restores/dissolves the
    // staging lobby and answers with a `game` snapshot; the nav owner
    // (home.tsx) then replaces this screen with the lobby — never a home
    // flash. Local state stays queued so the pop-home effect above can't race
    // the round-trip. If the server never answers, the X un-dims for an
    // idempotent re-send, and a genuinely dead session self-heals via the
    // liveness watchdog: the forced reconnect's teardown clears gameQueued
    // and the pop-home effect above exits (~30-40s worst case).
    if (is2v2) {
      setCancelling(true);
      wsService.send({ type: 'leaveQueue' });
      return;
    }
    wsService.send({ type: 'leaveQueue' });
    useMultiplayerStore.setState({ ...queueTeardownState });
    exitBack();
  };

  const isRanked = gameQueued === 'publicDuel';
  const isPlacement = isRanked && placementPending;
  const theme = isRanked
    ? {
        accent: '#fbbf24',
        glow: '#f59e0b',
        gradient: ['#fbbf24', '#f59e0b'] as const,
        icon: 'trophy' as const,
        label: t('rankedDuel'),
      }
    : is2v2
      ? {
          // The 2v2 identity color/glyph everywhere else (web gameHistory.js
          // badge: shield, #e91e63) — don't invent a second one.
          accent: '#f06292',
          glow: '#e91e63',
          gradient: ['#f06292', '#c2185b'] as const,
          icon: 'shield' as const,
          label: t('twovtwo'),
        }
      : {
          accent: '#4ade80',
          glow: '#22c55e',
          gradient: ['#4ade80', '#16a34a'] as const,
          icon: 'flash' as const,
          label: t('unrankedDuel'),
        };

  // Shared building blocks — composed differently per orientation below.
  const radarEl = (
    <View style={[styles.radar, { width: radarSize, height: radarSize }]}>
      <PulseRings accent={theme.accent} size={ringBase} />
      <View
        style={[
          styles.radarCore,
          {
            width: coreSize,
            height: coreSize,
            borderRadius: coreSize / 2,
            borderColor: theme.accent,
            shadowColor: theme.glow,
          },
        ]}
      >
        <ExpoImage
          source={LOADER}
          style={{ width: compassSize, height: compassSize }}
        />
      </View>
    </View>
  );

  const pillEl = (
    <LinearGradient
      colors={theme.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.modePill}
    >
      <Ionicons name={theme.icon} size={15} color="#1a1205" />
      <Text style={styles.modePillText}>{theme.label.toUpperCase()}</Text>
    </LinearGradient>
  );

  const titleEl = (
    <Text
      style={[styles.title, { fontSize: titleSize, textAlign: isLandscape ? 'left' : 'center' }]}
      numberOfLines={isLandscape ? 2 : 1}
      adjustsFontSizeToFit
    >
      {t('findingGame')}
    </Text>
  );

  // ONE plate holding every value, on the .timer HUD recipe (--gradLight over
  // --primaryTransparent, 2px --primary, 16px radius). Mirrors web exactly.
  // The divider between cells is the house frame colour and only renders when
  // there are two cells to divide.
  // RESERVED for signed-in ranked from the screen's first frame — BOTH cells,
  // not just the range. The range and the ETA arrive together one RTT after
  // join (the server pushes the first ETA on the join itself), so reserving
  // only the first meant the plate widened and grew a divider a fraction of a
  // second after mount — half of the "flicker then random switch" complaint
  // (user ruling Aug 14, mirrors web). The plate's full geometry exists from
  // frame one, blank, and the values fade into place without anything moving.
  // Guests never receive a range or an ETA, so they never reserve anything.
  const reserve = isRanked && signedIn;
  const cells = [
    isRanked && (publicDuelRange || reserve)
      ? {
          key: 'elo',
          label: t('eloRange'),
          value: publicDuelRange
            ? `${publicDuelRange[0]} – ${publicDuelRange[1]}`
            : VALUE_PLACEHOLDER,
          rough: false,
        }
      : null,
    etaStr || reserve
      ? { key: 'eta', label: t('queueEtaLabel'), value: etaStr ?? VALUE_PLACEHOLDER, rough: etaRough }
      : null,
  ].filter(Boolean) as { key: string; label: string; value: string; rough: boolean }[];

  // Placement skips the data plate because its bot match begins immediately.
  const dataEl = !isPlacement && cells.length ? (
    <View style={styles.dataPlate}>
      {cells.map((c, i) => (
        <QueueCell key={c.key} divided={i > 0}>
          <Text style={styles.dataLabel}>{c.label}</Text>
          {/* Blank until the value lands, one fade-in, instant swaps after —
              mirrors web's ReservedValue exactly. */}
          <ReservedValue
            value={c.value}
            style={styles.dataValue}
            dimStyle={c.rough ? styles.dataValueRough : undefined}
          />
        </QueueCell>
      ))}
    </View>
  ) : null;

  const timerEl = <ElapsedClock anchor={anchor} />;

  return (
    <View style={styles.container}>
      <SiteBackground style={StyleSheet.absoluteFillObject}/>
      {/* Shared with GetReadyOverlay + GameLoadingOverlay's countdown mode:
          identical backdrops are what make the queue→getready route fade
          seamless. Never inline these colors again. */}
      <LinearGradient
        colors={MATCHMAKING_VEIL_COLORS}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
        <BackButton onPress={handleCancel} style={cancelling ? styles.cancelPending : undefined} />
        <WgWordmark size="sm" style={styles.wordmark} />
      </SafeAreaView>

      {isLandscape ? (
        <View
          style={[
            styles.center,
            styles.centerLandscape,
            { paddingHorizontal: spacing.xl + Math.max(insets.left, insets.right) },
          ]}
        >
          {radarEl}
          <View style={[styles.infoLandscape, { maxWidth: width * 0.46 }]}>
            {pillEl}
            {titleEl}
            {dataEl}
            {timerEl}
          </View>
        </View>
      ) : (
        <View style={styles.center}>
          {pillEl}
          <View style={styles.radarSpacer}>{radarEl}</View>
          <View style={styles.infoPortrait}>
            {titleEl}
            {dataEl}
            {timerEl}
          </View>
        </View>
      )}

      {/* 2v2 stage-2: chat-only (comms XOR ruling — the staging lobby is
          created with disableEmotes, so an emote FAB here would send into a
          server drop). The duo's chat rides the persisting staging-lobby room. */}
      {is2v2 && chatEnabled && <GameChat />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingTop: spacing.sm,
  },
  wordmark: {
    marginTop: 2,
  },
  // Cancel request in flight (2v2) — the X stays live, just reads "processing".
  cancelPending: {
    opacity: 0.45,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  centerLandscape: {
    flexDirection: 'row',
    gap: spacing['2xl'],
  },
  infoLandscape: {
    alignItems: 'flex-start',
    gap: spacing.md,
    flexShrink: 1,
  },
  infoPortrait: {
    alignItems: 'center',
    gap: spacing.md,
  },
  radarSpacer: {
    marginVertical: spacing['3xl'],
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
  },
  modePillText: {
    color: '#1a1205',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-Bold',
    letterSpacing: 1.5,
  },
  radar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarCore: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  title: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    flexShrink: 1,
  },
  // Flat neutral fill, no frame. Separation comes from the fill's contrast
  // against the veil plus a neutral drop shadow — fewer outlines was the point.
  dataPlate: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: SURFACE,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  dataCell: {
    gap: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  // A SEAM, not an outline: a shade darker than the fill, so it reads as the
  // plate being segmented rather than another border drawn on top of it.
  dataCellDivided: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0, 0, 0, 0.45)',
  },
  dataLabel: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    letterSpacing: 0.2,
  },
  dataValue: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Bold',
    fontVariant: ['tabular-nums'],
  },
  // A MODELLED estimate reads dimmer and lighter than a measured one. That
  // difference is load-bearing: it is what stops a guess from a hardcoded table
  // wearing the confidence of an observed median.
  dataValueRough: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontFamily: 'Lexend-Medium',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  // Secondary live status. Tabular figures prevent the row from breathing as
  // the digits change, while the softer color keeps the headline in charge.
  timerText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Medium',
    fontVariant: ['tabular-nums'],
  },
});
