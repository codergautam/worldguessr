/**
 * In-game chat panel for multiplayer (non-duel) games.
 * Ported from web's chatBox.js — send/receive/rate-limit logic.
 *
 * Floating button + slide-up panel.
 * 200 char max, 500ms rate limit.
 */

import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../shared';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import { wsService } from '../../services/websocket';
import { useMultiplayerStore, ChatMessage } from '../../store/multiplayerStore';

const MAX_MSG_LENGTH = 200;
const RATE_LIMIT_MS = 500;

export default function GameChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const lastSentRef = useRef(0);
  const inputRef = useRef<TextInput>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);

  const chatMessages = useMultiplayerStore((s) => s.chatMessages);
  const chatEnabled = useMultiplayerStore((s) => s.chatEnabled);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOpen ? 1 : 0,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      if (isOpen) inputRef.current?.focus();
    });
  }, [isOpen]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen && chatMessages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chatMessages.length, isOpen]);

  if (!chatEnabled) return null;

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;

    const now = Date.now();
    if (now - lastSentRef.current < RATE_LIMIT_MS) return;

    lastSentRef.current = now;
    wsService.send({ type: 'chat', message: trimmed.slice(0, MAX_MSG_LENGTH) });
    setMessage('');
  };

  const panelHeight = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 280],
  });

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={styles.msgRow}>
      <Text style={styles.msgName}>{item.name}: </Text>
      <Text style={styles.msgText}>{item.message}</Text>
    </View>
  );

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Chat panel */}
      <Animated.View style={[styles.panel, { height: panelHeight }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={100}
        >
          <FlatList
            ref={flatListRef}
            data={chatMessages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id + item.timestamp}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
          />
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={message}
              onChangeText={(t) => setMessage(t.slice(0, MAX_MSG_LENGTH))}
              placeholder="Type a message..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            <Pressable
              onPress={handleSend}
              style={({ pressed }) => [
                styles.sendBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="send" size={18} color={colors.white} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* Toggle button */}
      <Pressable
        onPress={() => setIsOpen(!isOpen)}
        style={({ pressed }) => [
          styles.fab,
          pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
        ]}
      >
        <Ionicons
          name={isOpen ? 'close' : 'chatbubble-ellipses'}
          size={22}
          color={colors.white}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    left: spacing.md,
    zIndex: 500,
    width: 280,
  },
  panel: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: spacing.sm,
    gap: 4,
  },
  msgRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  msgName: {
    color: colors.primary,
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
  },
  msgText: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    gap: spacing.xs,
  },
  input: {
    flex: 1,
    color: colors.white,
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    height: 34,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
});
