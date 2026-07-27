/**
 * Party/2v2 text chat — mirrors web components/gameChat.js. A floating toggle
 * (bottom-RIGHT; emotes own bottom-left) opens a panel with the message log,
 * typing line and input. The store owns all chat state (log survives screen
 * hops between game and results); this component is a pure renderer.
 *
 * Deliberately NOT an RN <Modal>: a Modal presents in its own native window
 * and would occlude root toasts/notifications (results.tsx report-modal lens).
 * Keyboard: measured window/keyboard overlap, NOT KeyboardAvoidingView — see
 * the kbLift comment for why KAV double-lifts here.
 *
 * Audience (who receives a message) is decided by the SERVER: parties are
 * party-wide, matchmade 2v2 is teammate-only. Guests read but cannot send.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, t } from '../../shared';
import { haptics } from '../../services/haptics';
import { spacing, fontSizes } from '../../styles/theme';
import { useMultiplayerStore, CHAT_MAX_LEN, type ChatMessage } from '../../store/multiplayerStore';
import { useAuthStore } from '../../store/authStore';
import PlayerName from '../PlayerName';

const NEVER = ReduceMotion.Never;

function MessageRow({ msg, myTeam, onMute }: { msg: ChatMessage; myTeam: 'a' | 'b' | null; onMute: (m: ChatMessage) => void }) {
  // Team modes color by allegiance (same palette as web emotes/chat): blue =
  // my team incl. me, green = opponents; the team styles sit after self in
  // the array so they win. Outside team modes msg.team is null.
  const teamMine = !!(msg.team && myTeam && msg.team === myTeam);
  const teamOpp = !!(msg.team && myTeam && msg.team !== myTeam);
  return (
    <Animated.View entering={FadeInDown.duration(180).easing(Easing.out(Easing.ease)).reduceMotion(NEVER)}>
      <Pressable
        sfx="none"
        onLongPress={msg.isSelf ? undefined : () => onMute(msg)}
        delayLongPress={350}
        style={[styles.msgRow, msg.isSelf && styles.msgRowSelf, teamMine && styles.msgRowTeamMine, teamOpp && styles.msgRowTeamOpp]}
      >
        <View style={styles.msgNameLine}>
          <PlayerName
            name={msg.name}
            countryCode={msg.countryCode}
            flagSize={11}
            gap={4}
            textStyle={styles.msgName}
            style={styles.msgNameRow}
          />
          {msg.teamChat && (
            <View style={styles.msgTeamTag}>
              <Text style={styles.msgTeamTagText}>{t('chatChannelTeam', undefined, 'Team')}</Text>
            </View>
          )}
        </View>
        <Text style={styles.msgText}>{msg.text}</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function GameChat({
  hidden = false,
  // Extra px to lift the FAB/panel above the bottom (results summary, lobby
  // footer). Same contract as EmoteReactions' bottomOffset.
  bottomOffset = 0,
  // Emote FAB is concurrently visible (2v2 — parties are comms-XOR): chat
  // shares the bottom-left corner, so stack above the 48px toggle + gap.
  stackUp = false,
}: {
  hidden?: boolean;
  bottomOffset?: number;
  stackUp?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const chatMessages = useMultiplayerStore((s) => s.chatMessages);
  const chatTyping = useMultiplayerStore((s) => s.chatTyping);
  const chatUnread = useMultiplayerStore((s) => s.chatUnread);
  const mutedCount = useMultiplayerStore((s) => Object.keys(s.mutedChatIds).length);
  // Team contexts (matchmade 2v2 + intra-party team games) get the Team/All
  // channel picker; 2v2 defaults to team (its legacy audience).
  const is2v2 = useMultiplayerStore((s) => !!s.gameData?.team2v2);
  const teamCapable = useMultiplayerStore((s) => !!(s.gameData?.team2v2 || s.gameData?.teamGame));
  // Guest-hosted parties are emotes-only server-side — hide the whole surface.
  const hostGuest = useMultiplayerStore((s) => !!s.gameData?.hostGuest);
  // My allegiance for team-tinted message rows ('a' | 'b' | null).
  const myTeam = useMultiplayerStore((s) => {
    const myId = s.gameData?.myId ?? s.queueMyId;
    return s.gameData?.players?.find((p) => p.id === myId)?.team ?? null;
  });
  const sendChat = useMultiplayerStore((s) => s.sendChat);
  const sendChatTyping = useMultiplayerStore((s) => s.sendChatTyping);
  const muteChatSender = useMultiplayerStore((s) => s.muteChatSender);
  const unmuteAllChat = useMultiplayerStore((s) => s.unmuteAllChat);
  const markChatRead = useMultiplayerStore((s) => s.markChatRead);
  const canSend = !!useAuthStore((s) => s.user?.username);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  // Channel picker: true = teammates, false = everyone. Resets to the game
  // type's default whenever the type changes (staging lobby → 2v2 match,
  // party toggled to team mode).
  const [teamChannel, setTeamChannel] = useState(false);
  useEffect(() => {
    setTeamChannel(teamCapable && is2v2);
  }, [teamCapable, is2v2]);
  const listRef = useRef<ScrollView>(null);

  // Same hide choreography as the emote FAB (slide toward the near edge).
  const hideProgress = useSharedValue(0);
  useEffect(() => {
    hideProgress.value = withTiming(hidden ? 1 : 0, { duration: 300, easing: Easing.inOut(Easing.ease), reduceMotion: NEVER });
    if (hidden) setOpen(false);
  }, [hidden]);
  const hideStyle = useAnimatedStyle(() => ({
    opacity: 1 - hideProgress.value,
    transform: [{ translateX: hideProgress.value * -20 }],
  }));

  // Open panel = everything is read, now and as messages keep arriving.
  useEffect(() => {
    if (open) markChatRead();
  }, [open, chatMessages.length]);

  const send = () => {
    const message = draft.trim();
    if (!canSend || message.length < 1) return;
    sendChat(message, teamCapable && teamChannel);
    setDraft('');
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (canSend && value.trim()) sendChatTyping(teamCapable && teamChannel);
  };

  const confirmMute = (msg: ChatMessage) => {
    haptics.light();
    Alert.alert(t('mutePlayer', undefined, 'Mute player'), msg.name, [
      { text: t('cancel', undefined, 'Cancel'), style: 'cancel' },
      { text: t('mutePlayer', undefined, 'Mute player'), style: 'destructive', onPress: () => muteChatSender(msg.senderId) },
    ]);
  };

  const bottom = Math.max(insets.bottom, 16) + 16 + bottomOffset + (stackUp ? 60 : 0);
  const left = Math.max(insets.left, spacing.md);

  // Keyboard lift, MEASURED as the overlap between the window bottom and the
  // keyboard top — not KeyboardAvoidingView. KAV pads by the full keyboard
  // height unconditionally; whether the Android window ALSO resizes under
  // edge-to-edge varies by OS/OEM/build, and when it does the two stack into a
  // double lift. This subtraction is immune by construction: a window the OS
  // already resized puts its bottom AT the keyboard top → overlap zero.
  const [kbLift, setKbLift] = useState(0);
  // Last reported keyboard top (screen coords), so the lift can be RECOMPUTED
  // when the window itself moves: on Android resize-mode devices the window
  // shrinks to above the keyboard, and keyboardDidShow can fire BEFORE the new
  // window height lands — a one-shot computation would freeze a full-keyboard
  // lift on top of an already-resized window (double lift again). Re-running
  // this effect on winH replays the math against the fresh height instead.
  const kbTopRef = useRef<number | null>(null);
  useEffect(() => {
    const lift = (screenY: number) => setKbLift(Math.max(0, winH - screenY));
    if (kbTopRef.current !== null) lift(kbTopRef.current); // winH changed mid-keyboard
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => { kbTopRef.current = e.endCoordinates.screenY; lift(e.endCoordinates.screenY); },
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => { kbTopRef.current = null; setKbLift(0); },
    );
    return () => { show.remove(); hide.remove(); };
  }, [winH]);

  // The resting offset and the keyboard lift answer the SAME question — "how
  // much is stacked below me?" — so they must never ADD. The keyboard covers
  // the footer/HUD that `bottom` exists to clear (the lobby's footerHeight is
  // 200-300pt; adding ~330pt of keyboard on top parked the panel mid-air).
  // The panel sits at whichever clearance is taller.
  const effectiveBottom = kbLift > 0 ? Math.max(bottom, kbLift + 12) : bottom;
  // The panel must NEVER exceed the screen (landscape phones, keyboard up):
  // cap the message list at what's left after the EFFECTIVE offset, the top
  // inset and ~130px of panel chrome (header + typing line + input row +
  // borders). The usability floor YIELDS while the keyboard is up — landscape
  // + keyboard leaves ~40pt for the list, and holding the 90pt floor there
  // pushed the header (and its only close button) off the top of the screen.
  const listMax = Math.max(kbLift > 0 ? 32 : 90, Math.min(440, winH - effectiveBottom - insets.top - 130));
  const listMin = Math.min(160, listMax);
  const now = Date.now();
  const typers = chatTyping.filter((e) => e.until > now);
  const typingLine =
    typers.length === 0 ? '' :
    typers.length === 1 ? t('isTyping', { name: typers[0].name }, `${typers[0].name} is typing...`) :
    t('areTyping', { count: String(typers.length) }, `${typers.length} players are typing...`);

  // Guest-hosted party: no chat surface at all (server drops messages
  // room-wide; the FAB would be a dead button). After hooks — RN hook rules.
  if (hostGuest) return null;

  if (!open) {
    return (
      <Animated.View
        style={[styles.fabContainer, { bottom, left }, hideStyle]}
        pointerEvents={hidden ? 'none' : 'box-none'}
      >
        <Pressable
          onPress={() => {
            haptics.light();
            setOpen(true);
          }}
          style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.85 }]}
          hitSlop={8}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.white} />
          {chatUnread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{chatUnread > 9 ? '9+' : chatUnread}</Text>
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    // Full-screen non-Modal overlay; box-none keeps the rest of the screen
    // interactive. The panel is a bottom-anchored FLEX child lifted by the
    // measured kbLift (see above) — not position:absolute (which ignores any
    // container padding) and not KAV (which double-lifts, same comment).
    <View style={styles.overlay} pointerEvents="box-none">
      {/* RN never blurs a focused TextInput on outside taps, and the box-none
          overlay lets them fall through to the game — so nothing dismissed the
          keyboard. While it's up (and ONLY then), this transparent layer eats
          the first outside tap to close it; the panel, rendered after, still
          receives its own touches. Standard iOS first-tap-dismisses pattern. */}
      {kbLift > 0 && (
        <Pressable sfx="none" style={StyleSheet.absoluteFill} onPress={() => Keyboard.dismiss()} />
      )}
      <Animated.View
        style={[styles.panelAnchor, { marginBottom: effectiveBottom, marginLeft: left }, hideStyle]}
        pointerEvents={hidden ? 'none' : 'box-none'}
      >
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>{teamCapable && teamChannel ? t('teamChat', undefined, 'Team Chat') : t('chat', undefined, 'Chat')}</Text>
            {teamCapable && (
              <View style={styles.channelSeg}>
                <Pressable
                  sfx="none"
                  onPress={() => setTeamChannel(true)}
                  style={[styles.channelBtn, teamChannel && styles.channelBtnActive]}
                >
                  <Text style={styles.channelBtnText}>{t('chatChannelTeam', undefined, 'Team')}</Text>
                </Pressable>
                <Pressable
                  sfx="none"
                  onPress={() => setTeamChannel(false)}
                  style={[styles.channelBtn, !teamChannel && styles.channelBtnActive]}
                >
                  <Text style={styles.channelBtnText}>{t('chatChannelAll', undefined, 'All')}</Text>
                </Pressable>
              </View>
            )}
            {mutedCount > 0 && (
              <Pressable sfx="none" onPress={unmuteAllChat} style={styles.mutedChip} hitSlop={6}>
                <Text style={styles.mutedChipText}>{t('chatMutedCount', { count: String(mutedCount) }, `${mutedCount} muted`)}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setOpen(false)}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
              hitSlop={8}
            >
              <Ionicons name="close" size={18} color={colors.white} />
            </Pressable>
          </View>
          <ScrollView
            ref={listRef}
            style={[styles.list, { maxHeight: listMax, minHeight: listMin }]}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
            // Standard chat gesture and the pressure valve for tight layouts:
            // drag the message list to pull the keyboard down (iOS tracks the
            // finger; Android dismisses on drag).
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            {chatMessages.map((m) => (
              <MessageRow key={m.id} msg={m} myTeam={myTeam} onMute={confirmMute} />
            ))}
          </ScrollView>
          <Text style={styles.typingLine} numberOfLines={1}>{typingLine}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, !canSend && styles.inputDisabled]}
              value={draft}
              onChangeText={onDraftChange}
              editable={canSend}
              maxLength={CHAT_MAX_LEN}
              placeholder={canSend ? t('chatPlaceholder', undefined, 'Type a message...') : t('loginToChat', undefined, 'Log in to chat')}
              placeholderTextColor="rgba(255,255,255,0.45)"
              returnKeyType="send"
              onSubmitEditing={send}
              blurOnSubmit={false}
              autoCorrect
            />
            <Pressable
              onPress={send}
              disabled={!canSend || !draft.trim()}
              style={({ pressed }) => [
                styles.sendBtn,
                (!canSend || !draft.trim()) && styles.sendBtnDisabled,
                pressed && { opacity: 0.8 },
              ]}
              hitSlop={4}
            >
              <Ionicons name="send" size={16} color={colors.white} />
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

// Exported so HUD neighbors sharing the bottom-right corner can reserve clearance.
export const CHAT_TOGGLE_SIZE = 48;

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    zIndex: 1300,
    alignItems: 'flex-start',
  },
  toggle: {
    width: CHAT_TOGGLE_SIZE,
    height: CHAT_TOGGLE_SIZE,
    borderRadius: CHAT_TOGGLE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 50, 30, 0.85)',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#b42828',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontFamily: 'Lexend-SemiBold',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1300,
    // Bottom-anchor the panel as flex content so the KAV's keyboard padding
    // actually lifts it (see the render comment).
    justifyContent: 'flex-end',
  },
  panelAnchor: {
    alignItems: 'flex-start',
  },
  // Dark card matching web's .chatPanel (party-lobby card body — the full
  // green .timer fill was "too green" at panel size; RN has no backdrop
  // blur so the near-black base carries the whole look).
  panel: {
    width: 300,
    maxWidth: '100%',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primaryDark,
    backgroundColor: 'rgba(13, 15, 14, 0.95)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  title: {
    flex: 1,
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-SemiBold',
  },
  mutedChip: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mutedChipText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontFamily: 'Lexend',
  },
  closeBtn: {
    padding: 2,
  },
  // max/min height applied inline — computed from the window height so the
  // panel can never exceed the screen (landscape phones).
  list: {},
  listContent: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  msgRow: {
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  msgRowSelf: {
    backgroundColor: 'rgba(36, 87, 52, 0.55)',
  },
  // Team allegiance tints — same palette as web emotes/chat.
  msgRowTeamMine: {
    backgroundColor: 'rgba(59, 130, 246, 0.45)',
  },
  msgRowTeamOpp: {
    backgroundColor: 'rgba(34, 139, 34, 0.45)',
  },
  msgNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  msgNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  msgTeamTag: {
    backgroundColor: 'rgba(36, 87, 52, 0.7)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  msgTeamTagText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 9,
    fontFamily: 'Lexend-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  channelSeg: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  channelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  channelBtnActive: {
    backgroundColor: colors.primary,
  },
  channelBtnText: {
    color: colors.white,
    fontSize: 11,
    fontFamily: 'Lexend-SemiBold',
  },
  msgName: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    fontFamily: 'Lexend-SemiBold',
  },
  msgText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
  },
  typingLine: {
    minHeight: 16,
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
    fontStyle: 'italic',
    fontFamily: 'Lexend',
    paddingHorizontal: 12,
    paddingBottom: 2,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.4,
    borderColor: colors.primaryDark,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    color: colors.white,
    fontFamily: 'Lexend',
    fontSize: fontSizes.sm,
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  // Fixed square matched to the input height — default row stretch made it
  // adopt whatever the TextInput ballooned to, drowning the small icon.
  sendBtn: {
    width: 40,
    height: 40,
    alignSelf: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primaryTransparent,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
