/**
 * In-game emote reactions (replaces chat) — mirrors web components/emoteReactions.js.
 * A floating toggle opens a bar of emotes; tapping sends one over WS, and every
 * player (including the sender) sees it float for a few seconds.
 *
 * Reads/writes the multiplayer store (emotes list + sendEmote). The parent only
 * mounts this during an active multiplayer game.
 */

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../shared';
import { spacing, fontSizes } from '../../styles/theme';
import { EMOTES } from '../../shared/emotes';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import CountryFlag from '../CountryFlag';

export default function EmoteReactions() {
  const insets = useSafeAreaInsets();
  const emotes = useMultiplayerStore((s) => s.emotes);
  const sendEmote = useMultiplayerStore((s) => s.sendEmote);
  const [open, setOpen] = useState(false);

  const handleSend = (index: number) => {
    sendEmote(index);
    setOpen(false);
  };

  return (
    <View
      style={[
        styles.container,
        { bottom: Math.max(insets.bottom, 16) + 16, left: Math.max(insets.left, spacing.md) },
      ]}
      pointerEvents="box-none"
    >
      {/* Floating incoming reactions */}
      <View style={styles.floatStack} pointerEvents="none">
        {emotes.map((r) => (
          <Animated.View
            key={r.id}
            entering={FadeInDown.duration(250)}
            exiting={FadeOut.duration(300)}
            style={[styles.floatItem, r.isSelf && styles.floatItemSelf]}
          >
            <Text style={styles.floatGlyph}>{r.emote}</Text>
            {!!r.name && (
              <View style={styles.floatNameRow}>
                {r.countryCode ? <CountryFlag countryCode={r.countryCode} size={12} /> : null}
                <Text style={styles.floatName} numberOfLines={1}>{r.name}</Text>
              </View>
            )}
          </Animated.View>
        ))}
      </View>

      {/* Emote bar */}
      {open && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={styles.bar}>
          {EMOTES.map((e, i) => (
            <Pressable
              key={e}
              onPress={() => handleSend(i)}
              style={({ pressed }) => [styles.emoteBtn, pressed && { opacity: 0.5 }]}
            >
              <Text style={styles.emoteGlyph}>{e}</Text>
            </Pressable>
          ))}
        </Animated.View>
      )}

      {/* Toggle */}
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.85 }]}
        hitSlop={8}
      >
        <Ionicons name={open ? 'close' : 'happy-outline'} size={24} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 1300,
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  floatStack: {
    alignItems: 'flex-start',
    gap: 6,
  },
  floatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  floatItemSelf: {
    backgroundColor: 'rgba(36, 87, 52, 0.7)',
  },
  floatGlyph: {
    fontSize: 22,
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
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    maxWidth: 280,
    gap: 4,
    padding: 6,
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
  emoteGlyph: {
    fontSize: 22,
    color: colors.white,
    fontFamily: 'Lexend-Bold',
  },
  toggle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 50, 30, 0.85)',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
});
