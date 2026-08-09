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
} from 'react-native';
import SiteBackground from '../src/components/SiteBackground';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, useNavigation } from 'expo-router';
import { colors, t } from '../src/shared';
import { spacing, fontSizes } from '../src/styles/theme';
import { wsService } from '../src/services/websocket';
import { useMultiplayerStore, queueTeardownState } from '../src/store/multiplayerStore';
import { useSettingsStore } from '../src/store/settingsStore';
import BackButton from '../src/components/ui/BackButton';
import WgWordmark from '../src/components/ui/WgWordmark';
import GameChat from '../src/components/multiplayer/GameChat';

// Plate fill for the core and the data strip. Neutral by ruling (see
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

export default function QueueScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const gameQueued = useMultiplayerStore((s) => s.gameQueued);
  const publicDuelRange = useMultiplayerStore((s) => s.publicDuelRange);
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
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = queuedAt
    ? Math.max(0, Math.floor((Date.now() + wsService.timeOffset - queuedAt) / 1000))
    : 0;
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
  const etaStr = queueEta?.state === 'long'
    ? t('queueEtaLong')
    : etaRough
      ? t(ROUGH_KEYS[queueEta!.tier as keyof typeof ROUGH_KEYS])
      : queueEta?.state === 'ok' && queueEta.value !== null
        ? t(queueEta.unit === 'min' ? 'queueEtaMinutes' : 'queueEtaSeconds', { v: queueEta.value })
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

  // Sized off the same axis as the title so the two scale together. CALIBRATED,
  // because both ends were wrong once: 14px read as a footnote nobody looked at,
  // and the first correction put a scoreboard numeral on screen ("HUGE!!! I
  // DIDNT MEAN THAT HUGE"). Web's equivalent is clamp(1.5rem, .7vw+1.1svh, 2.1rem).
  const clockSize = isLandscape
    ? Math.min(32, Math.max(22, height * 0.075))
    : Math.min(34, Math.max(24, width * 0.075));

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
  const theme = isRanked
    ? {
        // RED, and specifically globals.scss's "ranked red" (#ff474c, the home
        // menu's Ranked Duel hover) — user ruling Aug 9, shared verbatim with
        // styles/queueScreen.css. With the eyebrow gone below this is the sonar
        // rings only. Unranked green and 2v2 pink are untouched.
        accent: '#ff474c',
        icon: 'trophy' as const,
        // NO EYEBROW ON RANKED (user ruling Aug 9, mirrors
        // components/queueScreen.js): "RANKED DUEL" over "Finding an opponent"
        // over an ELO range said the same thing three times. The ELO plate
        // already identifies the mode. Unranked and 2v2 keep theirs — they have
        // no plate to identify them.
        label: null,
        // Per-mode headline, mirroring components/queueScreen.js: a matchmade
        // 1v1 is one named person, not a generic "game".
        title: t('findingOpponent'),
      }
    : is2v2
      ? {
          // The 2v2 identity color/glyph everywhere else (web gameHistory.js
          // badge: shield, #e91e63) — don't invent a second one.
          accent: '#f06292',
          icon: 'shield' as const,
          label: t('twovtwo'),
          title: t('findingMatch'),
        }
      : {
          accent: '#4ade80',
          icon: 'flash' as const,
          label: t('unrankedDuel'),
          title: t('findingGame'),
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

  // The mode identity as TYPE, not as a filled gradient pill. Web's queue
  // screen was rejected for looking "AI generated with all the rounded corners
  // and pills and outlines"; this is the same information with none of the
  // chrome, and it keeps the two platforms identical.
  const pillEl = theme.label ? (
    <View style={styles.modeRow}>
      <Ionicons name={theme.icon} size={14} color={theme.accent} />
      <Text style={[styles.modeText, { color: theme.accent }]}>{theme.label.toUpperCase()}</Text>
    </View>
  ) : null;

  const titleEl = (
    <Text
      style={[styles.title, { fontSize: titleSize, textAlign: isLandscape ? 'left' : 'center' }]}
      numberOfLines={isLandscape ? 2 : 1}
      adjustsFontSizeToFit
    >
      {theme.title}...
    </Text>
  );

  // ONE plate holding every value, on the .timer HUD recipe (--gradLight over
  // --primaryTransparent, 2px --primary, 16px radius). Mirrors web exactly.
  // The divider between cells is the house frame colour and only renders when
  // there are two cells to divide.
  const cells = [
    isRanked && publicDuelRange
      ? { key: 'elo', label: t('eloRange'), value: `${publicDuelRange[0]} – ${publicDuelRange[1]}`, rough: false }
      : null,
    etaStr ? { key: 'eta', label: t('queueEtaLabel'), value: etaStr, rough: etaRough } : null,
  ].filter(Boolean) as { key: string; label: string; value: string; rough: boolean }[];

  const dataEl = cells.length ? (
    <View style={styles.dataPlate}>
      {cells.map((c, i) => (
        // The typical-wait cell arrives LATE (the server's first ETA push is up
        // to 5s after the join), so without this it snapped into an
        // already-drawn plate. Mirrors web's wgQueueCellIn. Layout width is not
        // animated here — RN width animation on a flex row is finicky and the
        // fade+slide reads as the same reveal.
        <QueueCell key={c.key} divided={i > 0}>
          <Text style={styles.dataLabel}>{c.label.toUpperCase()}</Text>
          <Text style={[styles.dataValue, c.rough && styles.dataValueRough]}>{c.value}</Text>
        </QueueCell>
      ))}
    </View>
  ) : null;

  const timerEl = (
    <View style={styles.timerRow}>
      <Ionicons name="time-outline" size={clockSize * 0.62} color="rgba(255,255,255,0.6)" />
      <Text style={[styles.timerText, { fontSize: clockSize }]}>{elapsedStr}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <SiteBackground style={StyleSheet.absoluteFillObject}/>
      <LinearGradient
        colors={['rgba(6, 16, 10, 0.5)', 'rgba(6, 16, 10, 0.62)', 'rgba(6, 16, 10, 0.74)']}
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
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  modeText: {
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-Bold',
    letterSpacing: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  radar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // NEUTRAL and UNFRAMED — see styles/queueScreen.css's header for the two
  // owner rulings behind this ("remove the green backgrounds", then "still has
  // green outlines/borders i dont like that"). The mode accent lives only in
  // the rings that orbit this disc, the eyebrow, and the bloom under the timer.
  radarCore: {
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
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
    color: 'rgba(255, 255, 255, 0.66)',
    fontSize: 10,
    fontFamily: 'Lexend-Medium',
    letterSpacing: 1.4,
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
  // THE HERO, matching web. This was a muted 14px footnote; the clock is the
  // only thing on screen actually moving and it is the answer to the question
  // the player is asking, so it gets scoreboard size. Tabular figures are
  // mandatory — proportional digits jitter the whole number every second.
  timerText: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontVariant: ['tabular-nums'],
  },
});
