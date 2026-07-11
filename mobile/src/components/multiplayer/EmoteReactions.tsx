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

import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
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
import { sound } from '../../services/sound';
import { spacing, fontSizes } from '../../styles/theme';
import { EMOTES, EMOTE_TTL_MS, EMOTE_COOLDOWN_MS } from '../../shared/emotes';
import getMyTeam from '../../shared/game/getMyTeam';
import { useMultiplayerStore, type EmoteReaction } from '../../store/multiplayerStore';
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

  // Team modes: color by allegiance — blue for my team (incl. me), green for
  // opponents (web .emoteFloatItem.teamMine/.teamOpp). Outside team modes
  // r.team is null and the self/default styling applies unchanged.
  const teamStyle =
    reaction.team && myTeam
      ? reaction.team === myTeam
        ? styles.floatItemTeamMine
        : styles.floatItemTeamOpp
      : null;
  return (
    <Animated.View
      style={[styles.floatItem, reaction.isSelf && styles.floatItemSelf, teamStyle, hideName && styles.floatItemNoName, style]}
    >
      <Text style={[styles.floatGlyph, hideName && styles.floatGlyphNoName]}>{reaction.emote}</Text>
      {!hideName && !!reaction.name && (
        <PlayerName
          name={reaction.name}
          countryCode={reaction.countryCode}
          flagSize={12}
          gap={4}
          textStyle={styles.floatName}
          style={styles.floatNameRow}
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

  const handleSend = (index: number) => {
    if (inCooldown) return;
    sound.click();
    haptics.light();
    sendEmote(index);
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
        {EMOTES.map((e, i) => (
          <Pressable
            key={e}
            onPress={() => handleSend(i)}
            disabled={inCooldown}
            style={({ pressed }) => [styles.emoteBtn, inCooldown && styles.emoteBtnDisabled, pressed && { opacity: 0.5 }]}
          >
            <Text style={styles.emoteGlyph}>{e}</Text>
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
  floatItemSelf: {
    backgroundColor: 'rgba(34, 139, 34, 0.7)',
  },
  // Team-mode allegiance tints (web .emoteFloatItem.teamMine/.teamOpp) —
  // listed AFTER floatItemSelf so my own team-blue wins over the self green.
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
  },
  emoteBtnDisabled: {
    opacity: 0.35,
  },
  emoteGlyph: {
    fontSize: 22,
    color: colors.white,
    fontFamily: 'Lexend-Bold',
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
