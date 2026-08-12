/**
 * In-game emote reactions (replaces chat) — mirrors web components/emoteReactions.js.
 * A floating toggle opens a bar of emotes; tapping sends one over WS, and every
 * player (including the sender) sees it float upward for a few seconds.
 *
 * Reads/writes the multiplayer store (emotes list + sendEmote). The parent only
 * mounts this during an active multiplayer game.
 *
 * All motion mirrors the web CSS (styles/globals.scss) and uses ReduceMotion.Never
 * so it stays smooth even with the device's Reduce Motion setting on.
 */

import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import Animated, {
  Easing,
  Extrapolation,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../shared';
import { haptics } from '../../services/haptics';
import { spacing, fontSizes } from '../../styles/theme';
import { EMOTE_TTL_MS, EMOTE_COOLDOWN_MS, resolveEmoteBar } from '../../shared/emotes';
import { useAuthStore } from '../../store/authStore';
import getMyTeam from '../../shared/game/getMyTeam';
import { useMultiplayerStore, type EmoteReaction } from '../../store/multiplayerStore';
import EmberGlow from '../shop/EmberGlow';
import PlayerName from '../PlayerName';

const NEVER = ReduceMotion.Never;

/**
 * A single reaction that rises and fades, mirroring web @keyframes emoteFloatRise:
 *   0%   translateY(20)  scale(0.6)  opacity(0)
 *   15%  translateY(0)   scale(1.05) opacity(1)
 *   25%  translateY(-10) scale(1)    opacity(1)
 *   80%  translateY(-180) scale(1)   opacity(0.9)
 *   100% translateY(-220) scale(0.85) opacity(0)
 * Progress is driven linearly over the same TTL the store uses to remove the item.
 */
function FloatingEmote({
  reaction,
  hideName,
  myTeam,
}: {
  reaction: EmoteReaction;
  hideName: boolean;
  myTeam: 'a' | 'b' | null;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: EMOTE_TTL_MS, easing: Easing.linear, reduceMotion: NEVER });
  }, []);

  const style = useAnimatedStyle(() => {
    const stops = [0, 0.15, 0.25, 0.8, 1];
    return {
      opacity: interpolate(p.value, stops, [0, 1, 1, 0.9, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(p.value, stops, [20, 0, -10, -180, -220], Extrapolation.CLAMP) },
        { scale: interpolate(p.value, stops, [0.6, 1.05, 1, 1, 0.85], Extrapolation.CLAMP) },
      ],
    };
  });

  // Allegiance tint, same rule as web and as chat: my bubble is ALWAYS blue,
  // opponents ALWAYS green. isSelf leads because a 1v1 has no teams, so
  // gating blue on `reaction.team && myTeam` dropped duels through to the old
  // green self style (web .emoteFloatItem.teamMine/.teamOpp).
  const mine = reaction.isSelf || (reaction.team && myTeam && reaction.team === myTeam);
  const teamStyle = mine ? styles.floatItemTeamMine : styles.floatItemTeamOpp;
  return (
    <Animated.View
      style={[styles.floatItem, teamStyle, hideName && styles.floatItemNoName, style]}
    >
      {/* THE ONE EMOTE WITH AN EFFECT burns here too, not just in the shop that
          sold it — a cosmetic that only looks special where it is on sale is a
          bait. EmberGlow is the same component the shop's wheel and shelf mount;
          the static half of the burn is the text shadow below it. Sized to the
          glyph it sits behind, which is bigger in a duel (no name row). */}
      {reaction.fx === 'ember' ? <EmberGlow size={hideName ? 72 : 48} /> : null}
      <Text
        style={[
          styles.floatGlyph,
          hideName && styles.floatGlyphNoName,
          reaction.fx === 'ember' && styles.floatGlyphEmber,
        ]}
      >
        {reaction.emote}
      </Text>
      {!hideName && !!reaction.name && (
        <PlayerName
          name={reaction.name}
          countryCode={reaction.countryCode}
          flagSize={12}
          gap={4}
          textStyle={styles.floatName}
          style={styles.floatNameRow}
          // Animated: a bubble lives 3.2s and only a handful are ever in the
          // air, so the cost is bounded by the emote cooldown rather than by
          // how long the game has been running.
          glow={reaction.nameGlow}
        />
      )}
    </Animated.View>
  );
}

export default function EmoteReactions({
  hidden = false,
  hideName = false,
  // Extra px to lift the whole FAB (toggle + bar + rising floats) above the bottom.
  // Used on the results screen so the button clears the summary panel; 0 in-game.
  bottomOffset = 0,
}: {
  hidden?: boolean;
  hideName?: boolean;
  bottomOffset?: number;
}) {
  const insets = useSafeAreaInsets();
  const emotes = useMultiplayerStore((s) => s.emotes);
  const sendEmote = useMultiplayerStore((s) => s.sendEmote);
  // Allegiance for team-mode float coloring. Derived from the live roster —
  // during the 2v2 stage-2 queue window (gameData null) this is null and only
  // self-coloring survives, same as web.
  const myTeam = useMultiplayerStore((s) =>
    s.gameData?.team2v2 || s.gameData?.teamGame
      ? getMyTeam(s.gameData.players, s.gameData.myId)
      : null,
  );
  // THE PICKER RENDERS THE PLAYER'S BAR — `cosmetics.emoteOrder`, resolved by
  // the shared model (src/shared/emotes.ts), which is the same call web makes.
  //
  // It used to render getAvailableEmotes(): everything you own, in catalogue
  // order, with emoteOrder ignored outright. So arranging a bar changed nothing
  // here, and once you owned a few emotes the two platforms showed different
  // pickers for the same account. An empty order still resolves to the free
  // set, so nothing changes for an account that has never arranged one.
  //
  // Guests have neither field, which resolves to free-only — the server enforces
  // ownership anyway, so offering an unowned emote would only produce a button
  // whose every press is silently dropped.
  const ownedCosmetics = useAuthStore((s) => s.user?.cosmetics?.owned);
  const emoteOrder = useAuthStore((s) => s.user?.cosmetics?.emoteOrder);
  const available = useMemo(
    () => resolveEmoteBar(emoteOrder, ownedCosmetics),
    [emoteOrder, ownedCosmetics],
  );
  const [open, setOpen] = useState(false);
  // Cooldown feedback (mirrors web): disable buttons until the next send is allowed.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(0);
  const inCooldown = now < cooldownUntil;

  // Mirror web: fade out + slide 20px left over 0.3s ease when an overlay (the
  // guess map) covers the screen, then restore. See styles/globals.scss.
  const hideProgress = useSharedValue(0);
  useEffect(() => {
    hideProgress.value = withTiming(hidden ? 1 : 0, { duration: 300, easing: Easing.inOut(Easing.ease), reduceMotion: NEVER });
    if (hidden) setOpen(false);
  }, [hidden]);
  const hideStyle = useAnimatedStyle(() => ({
    opacity: 1 - hideProgress.value,
    transform: [{ translateX: hideProgress.value * -20 }],
  }));

  // Mirror web .emoteBar: always mounted + absolutely positioned, toggled purely
  // via opacity/transform (translateY 8->0, scale 0.95->1) so sending/closing
  // never reflows the layout — which is what caused the snap-to-bottom flash.
  const barProgress = useSharedValue(0);
  useEffect(() => {
    barProgress.value = withTiming(open ? 1 : 0, { duration: 200, easing: Easing.out(Easing.ease), reduceMotion: NEVER });
  }, [open]);
  const barStyle = useAnimatedStyle(() => ({
    opacity: barProgress.value,
    transform: [
      { translateY: (1 - barProgress.value) * 8 },
      { scale: 0.95 + barProgress.value * 0.05 },
    ],
  }));

  // Tick only while a cooldown is pending so buttons re-enable on time.
  useEffect(() => {
    if (!inCooldown) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [inCooldown]);

  const handleSend = (emoteId: string) => {
    if (inCooldown) return;
    // Click sound rides SfxPressable (the buttons are disabled in cooldown,
    // so a dead press stays silent — web disabled-button parity).
    haptics.light();
    sendEmote(emoteId);
    setCooldownUntil(Date.now() + EMOTE_COOLDOWN_MS);
    setNow(Date.now());
    setOpen(false);
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: Math.max(insets.bottom, 16) + 16 + bottomOffset, left: Math.max(insets.left, spacing.md) },
        hideStyle,
      ]}
      pointerEvents={hidden ? 'none' : 'box-none'}
    >
      {/* Floating incoming reactions — rise above the toggle */}
      <View style={styles.floatStack} pointerEvents="none">
        {emotes.map((r) => (
          <FloatingEmote key={r.id} reaction={r} hideName={hideName} myTeam={myTeam} />
        ))}
      </View>

      {/* Emote bar — always mounted, fades/scales in above the toggle */}
      <Animated.View style={[styles.bar, barStyle]} pointerEvents={open ? 'auto' : 'none'}>
        {available.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => handleSend(e.id)}
            disabled={inCooldown}
            style={({ pressed }) => [styles.emoteBtn, inCooldown && styles.emoteBtnDisabled, pressed && { opacity: 0.5 }]}
          >
            {/* The picker button gets the burn too, so the thing you paid for
                looks paid-for at the moment you reach for it. */}
            {e.fx === 'ember' ? <EmberGlow size={40} /> : null}
            <Text style={[styles.emoteGlyph, e.fx === 'ember' && styles.emoteGlyphEmber]}>{e.glyph}</Text>
          </Pressable>
        ))}
      </Animated.View>

      {/* Toggle */}
      <Pressable
        onPress={() => {
          haptics.light();
          setOpen((o) => !o);
        }}
        style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.85 }]}
        hitSlop={8}
      >
        <Ionicons name={open ? 'close' : 'happy-outline'} size={24} color={colors.white} />
      </Pressable>
    </Animated.View>
  );
}

// Exported so callers that share this bottom-left corner (e.g. the duel anti-cheat
// banner in app/game/[id].tsx) can reserve clearance above the FAB.
export const EMOTE_TOGGLE_SIZE = 48;
const TOGGLE_SIZE = EMOTE_TOGGLE_SIZE;
const ABOVE_TOGGLE = TOGGLE_SIZE + 12; // bar/floats sit just above the toggle

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 1300,
    width: 260,
    height: TOGGLE_SIZE,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
  },
  // Rising-reaction area anchored above the toggle (web .emoteFloatStack).
  floatStack: {
    position: 'absolute',
    left: 0,
    bottom: ABOVE_TOGGLE,
    width: 260,
    height: 240,
  },
  floatItem: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  // Allegiance tints (web .emoteFloatItem.teamMine/.teamOpp). There is no
  // longer a self style: own bubbles are ALWAYS blue, matching chat.
  floatItemTeamMine: {
    backgroundColor: 'rgba(59, 130, 246, 0.72)',
  },
  floatItemTeamOpp: {
    backgroundColor: 'rgba(34, 139, 34, 0.7)',
  },
  floatItemNoName: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: 'transparent',
  },
  // Text emotes (e.g. "GG") fall back to the system font in black without these;
  // match web's .emoteFloatGlyph: inherits white + Lexend (body font) + drop-shadow.
  // Emoji glyphs render in color regardless of fontFamily.
  floatGlyph: {
    fontSize: 34,
    color: colors.white,
    fontFamily: 'Lexend',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  // The ember replaces the black lift rather than stacking on it: one text
  // shadow per Text is all RN gives you, and a warm glow is a better read on a
  // pano than a drop shadow anyway. EmberGlow behind it does the breathing.
  floatGlyphEmber: {
    textShadowColor: 'rgba(255, 138, 42, 0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  floatGlyphNoName: {
    fontSize: 52,
  },
  floatNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 140,
  },
  floatName: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    flexShrink: 1,
  },
  // Fixed-width 4-up grid (RN width is border-box). Exact fit is
  // border(1*2) + padding(8*2) + 4 buttons(40) + 3 gaps(8) = 202; +2px buffer
  // avoids sub-pixel rounding wrapping the 4th button to a new row.
  bar: {
    position: 'absolute',
    left: 0,
    bottom: ABOVE_TOGGLE,
    width: 204,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  emoteBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    // Keeps the ember disc inside the button rather than bleeding onto its
    // neighbours in a 4-across row.
    overflow: 'hidden',
  },
  emoteBtnDisabled: {
    opacity: 0.35,
  },
  emoteGlyph: {
    fontSize: 22,
    color: colors.white,
    fontFamily: 'Lexend-Bold',
  },
  emoteGlyphEmber: {
    textShadowColor: 'rgba(255, 138, 42, 0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 9,
  },
  toggle: {
    width: TOGGLE_SIZE,
    height: TOGGLE_SIZE,
    borderRadius: TOGGLE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 50, 30, 0.85)',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
});
