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

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
} from 'react-native';
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
 * What the reserved ELO cell shows before the server's range lands — the same
 * "..." web's PlayerCard and queue screen use for a pending value. NEVER an
 * optimistic client-computed range (user ruling Aug 13: stale cached elo made
 * the guess visibly self-correct when the authoritative range arrived).
 */
const ELO_PLACEHOLDER = '...';

/**
 * The ELO cell's value swap: old value fades out, the text swaps, it fades
 * back in — mirrors web's .wgQueue__cellValue--fades exactly (a fade, NOT a
 * digit count-up: user ruling Aug 13). Placeholder→first range and every
 * widen step all take the same path. The displayed string is STATE,
 * deliberately decoupled from the prop; mount paints instantly because
 * QueueCell's own entrance animation covers it. `dimStyle` applies while the
 * SHOWN string (not the prop) is still the placeholder, so the dimming fades
 * out with it.
 */
function FadingValue({ value, style, dimStyle }: {
  value: string;
  style: StyleProp<TextStyle>;
  dimStyle?: StyleProp<TextStyle>;
}) {
  const [shown, setShown] = useState(value);
  const opacity = useRef(new Animated.Value(1)).current;
  // The fade-IN lives in the EFFECT's steady-state branch, not in the
  // fade-out's completion callback. This is what makes an interrupted
  // fade-out self-healing: a value that reverts mid-fade re-runs the effect
  // straight into `value === shown` with opacity frozen partway, and this
  // branch glides it back to 1. Callback-owned fade-in left that path
  // returning early with the text stuck half-transparent forever (verified
  // against RN's TimingAnimation: stop() freezes the value in place). On a
  // normal swap the same branch runs right after setShown — one owner for
  // every path back to fully-visible.
  useEffect(() => {
    if (value === shown) {
      const restore = Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
      restore.start();
      return () => restore.stop();
    }
    const out = Animated.timing(opacity, {
      toValue: 0,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    // Interrupted (a newer value re-ran this effect) → finished:false → the
    // new run owns the swap from the already-dimmed opacity.
    out.start(({ finished }) => {
      if (finished) setShown(value);
    });
    return () => out.stop();
  }, [value, shown, opacity]);
  return (
    <Animated.Text style={[style, shown === ELO_PLACEHOLDER && dimStyle, { opacity }]}>
      {shown}
    </Animated.Text>
  );
}

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

  // The interval is a RE-RENDER PUMP, not the clock. This used to be a
  // `setElapsed(e => e + 1)` counter, which silently under-reports: React
  // Native suspends JS timers while the app is backgrounded, so a minute spent
  // in another app simply never got counted and there was no state to recover
  // it from. The value is now DERIVED from the server's join instant on every
  // render, which is immune to that, to a screen remount, and to clock skew.
  const queuedAt = useMultiplayerStore((s) => s.queuedAt);
  const queueEta = useMultiplayerStore((s) => s.queueEta);
  // This ranked queue resolves into the placement seeding match (server
  // follow-up `queuePlacement`). Overrides the no-eyebrow ruling below and
  // swaps the data plate for the one-line explainer.
  const placementPending = useMultiplayerStore((s) => s.placementPending);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsedMs = queuedAt
    ? Math.max(0, Date.now() + wsService.timeOffset - queuedAt)
    : 0;
  const elapsed = Math.floor(elapsedMs / 1000);
  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;
  const elapsedStr = `${mm}:${ss < 10 ? '0' : ''}${ss}`;

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
  // Render from the local 1s clock as soon as the server-provided deadline is
  // crossed. Waiting for the 5s ETA beat could otherwise leave an already-
  // expired quote visible for several seconds.
  const etaPastThreshold = typeof queueEta?.longAfterSeconds === 'number'
    && elapsedMs > queueEta.longAfterSeconds * 1000;
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
        <Image
          source={require('../assets/loader.gif')}
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
  const cells = [
    // RESERVED for signed-in ranked from the screen's first frame: the cell
    // exists holding a placeholder and the server's authoritative range fades
    // into it — the plate never mounts late and shoves the timer (layout
    // shift), and no guessed numbers ever paint. Guests never receive a
    // range, so they never reserve the cell.
    isRanked && (publicDuelRange || signedIn)
      ? {
          key: 'elo',
          label: t('eloRange'),
          value: publicDuelRange
            ? `${publicDuelRange[0]} – ${publicDuelRange[1]}`
            : ELO_PLACEHOLDER,
          rough: !publicDuelRange,
        }
      : null,
    etaStr ? { key: 'eta', label: t('queueEtaLabel'), value: etaStr, rough: etaRough } : null,
  ].filter(Boolean) as { key: string; label: string; value: string; rough: boolean }[];

  // Placement skips the data plate because its bot match begins immediately.
  const dataEl = !isPlacement && cells.length ? (
    <View style={styles.dataPlate}>
      {cells.map((c, i) => (
        // The typical-wait cell arrives LATE (the server's first ETA push is up
        // to 5s after the join), so without this it snapped into an
        // already-drawn plate. Mirrors web's wgQueueCellIn. Layout width is not
        // animated here — RN width animation on a flex row is finicky and the
        // fade+slide reads as the same reveal.
        <QueueCell key={c.key} divided={i > 0}>
          <Text style={styles.dataLabel}>{c.label}</Text>
          {c.key === 'elo' ? (
            // Placeholder→range and widen steps all fade through, mirroring
            // web's FadingValue. Dimming tracks the SHOWN string inside.
            <FadingValue value={c.value} style={styles.dataValue} dimStyle={styles.dataValueRough} />
          ) : (
            <Text style={[styles.dataValue, c.rough && styles.dataValueRough]}>{c.value}</Text>
          )}
        </QueueCell>
      ))}
    </View>
  ) : null;

  const timerEl = (
    <View style={styles.timerRow}>
      <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.5)" />
      <Text style={styles.timerText}>{elapsedStr}</Text>
    </View>
  );

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
