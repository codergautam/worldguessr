/**
 * Friends tab — full UI ported from web `components/friendModal.js`.
 *
 * Sections (top → bottom):
 *  1. Add friend form (TextInput + Send Request + status message)
 *  2. Allow-friend-requests toggle
 *  3. Received requests (Accept / Decline)
 *  4. Sent requests (Cancel)
 *  5. Friends list (online-first, Invite if `canSendInvite`, Remove)
 *
 * State source: `useMultiplayerStore`. Polls `getFriends` every 5s while mounted.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard, sharedStyles } from './shared';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import type { FriendReqState } from '../../store/multiplayerStore';
import { t } from '../../shared';

/**
 * FriendsTab has no props — the parent only renders it when the viewer is on
 * their own profile, and friends data flows through `useMultiplayerStore`.
 * Whether to show Invite buttons is derived from the store too: a private game
 * (party) lobby in progress means the user can invite from the list directly.
 */

const POLL_INTERVAL_MS = 5000;
const STATE_AUTO_CLEAR_MS = 5000;

/** Map `friendReqState` numeric codes → locale key (mirrors `friendModal.js:122-135`). */
function friendReqStateKey(state: FriendReqState): { key: string; tone: 'success' | 'error' } {
  switch (state) {
    case 1: return { key: 'friendReqSent', tone: 'success' };
    case 2: return { key: 'friendReqNotAccepting', tone: 'error' };
    case 3: return { key: 'friendReqNotFound', tone: 'error' };
    case 4: return { key: 'friendReqAlreadySent', tone: 'error' };
    case 5: return { key: 'friendReqAlreadyReceived', tone: 'error' };
    case 6: return { key: 'alreadyFriends', tone: 'error' };
    default: return { key: 'friendReqError', tone: 'error' };
  }
}

export default function FriendsTab() {
  const inGame = useMultiplayerStore((s) => s.inGame);
  const isPrivateLobby = useMultiplayerStore(
    (s) => s.gameData != null && !s.gameData.public,
  );
  const canSendInvite = inGame && isPrivateLobby;
  const friends = useMultiplayerStore((s) => s.friends);
  const sentRequests = useMultiplayerStore((s) => s.sentRequests);
  const receivedRequests = useMultiplayerStore((s) => s.receivedRequests);
  const allowFriendReq = useMultiplayerStore((s) => s.allowFriendReq);
  const friendReqState = useMultiplayerStore((s) => s.friendReqState);
  const friendReqStateAt = useMultiplayerStore((s) => s.friendReqStateAt);
  const requestFriends = useMultiplayerStore((s) => s.requestFriends);
  const sendFriendRequest = useMultiplayerStore((s) => s.sendFriendRequest);
  const acceptFriend = useMultiplayerStore((s) => s.acceptFriend);
  const declineFriend = useMultiplayerStore((s) => s.declineFriend);
  const cancelFriendRequest = useMultiplayerStore((s) => s.cancelFriendRequest);
  const removeFriend = useMultiplayerStore((s) => s.removeFriend);
  const setAllowFriendReqOnServer = useMultiplayerStore((s) => s.setAllowFriendReqOnServer);
  const inviteFriendToGame = useMultiplayerStore((s) => s.inviteFriendToGame);
  const clearFriendReqState = useMultiplayerStore((s) => s.clearFriendReqState);

  const [newFriend, setNewFriend] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Poll getFriends every 5s while mounted (mirrors friendModal.js:68-71).
  useEffect(() => {
    requestFriends();
    const interval = setInterval(requestFriends, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [requestFriends]);

  // Clear the submitting spinner the moment a `friendReqState` arrives.
  // Also clear the input field on success (state === 1).
  const lastSeenStateRef = useRef(friendReqStateAt);
  useEffect(() => {
    if (friendReqStateAt === lastSeenStateRef.current) return;
    lastSeenStateRef.current = friendReqStateAt;
    setSubmitting(false);
    if (friendReqState === 1) setNewFriend('');
  }, [friendReqState, friendReqStateAt]);

  // Auto-dismiss the state pill after 5s (matches web's auto-clear behavior).
  useEffect(() => {
    if (friendReqState == null) return;
    const elapsed = Date.now() - friendReqStateAt;
    const remaining = Math.max(0, STATE_AUTO_CLEAR_MS - elapsed);
    const timer = setTimeout(clearFriendReqState, remaining);
    return () => clearTimeout(timer);
  }, [friendReqState, friendReqStateAt, clearFriendReqState]);

  const sortedFriends = useMemo(
    () => [...friends].sort((a, b) => Number(b.online) - Number(a.online)),
    [friends],
  );

  const handleSend = () => {
    const trimmed = newFriend.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    sendFriendRequest(trimmed);
  };

  const handleRemove = (id: string, name: string) => {
    Alert.alert(
      t('removeFriendTitle', undefined, 'Remove friend'),
      t('removeFriendConfirm', { name }, 'Remove {{name}} from your friends list?'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('remove', undefined, 'Remove'), style: 'destructive', onPress: () => removeFriend(id) },
      ],
    );
  };

  const stateInfo = friendReqState != null ? friendReqStateKey(friendReqState) : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Add friend ─────────────────────────────────────────── */}
      <GlassCard>
        <Text style={sharedStyles.cardTitle}>{t('addFriend')}</Text>
        <Text style={styles.cardSub}>{t('addFriendDescription')}</Text>

        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            value={newFriend}
            onChangeText={setNewFriend}
            placeholder={t('addFriendPlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.4)"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            maxLength={30}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <Pressable
            onPress={handleSend}
            disabled={submitting || !newFriend.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              (submitting || !newFriend.trim()) && styles.sendBtnDisabled,
              pressed && { opacity: 0.85 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendBtnText}>{t('sendRequest')}</Text>
            )}
          </Pressable>
        </View>

        {stateInfo && (
          <View
            style={[
              styles.statePill,
              stateInfo.tone === 'success' ? styles.statePillSuccess : styles.statePillError,
            ]}
          >
            <Ionicons
              name={stateInfo.tone === 'success' ? 'checkmark-circle' : 'alert-circle'}
              size={14}
              color={stateInfo.tone === 'success' ? '#4ade80' : '#f87171'}
            />
            <Text style={styles.stateText}>{t(stateInfo.key)}</Text>
          </View>
        )}
      </GlassCard>

      {/* ── Allow requests toggle ──────────────────────────────── */}
      <GlassCard>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>{t('allowFriendRequests')}</Text>
          </View>
          <Switch
            value={allowFriendReq}
            onValueChange={setAllowFriendReqOnServer}
            trackColor={{ false: '#3a3a3a', true: '#4ade80' }}
            thumbColor="#fff"
          />
        </View>
      </GlassCard>

      {/* ── Received requests ──────────────────────────────────── */}
      {receivedRequests.length > 0 && (
        <GlassCard>
          <Text style={sharedStyles.cardTitle}>
            {t('viewReceivedRequests', { cnt: receivedRequests.length })}
          </Text>
          {receivedRequests.map((req) => (
            <View key={req.id} style={styles.userRow}>
              <Text style={styles.userName} numberOfLines={1}>
                {req.name}
                {req.supporter && <Text style={styles.supporter}> ★</Text>}
              </Text>
              <Pressable
                onPress={() => acceptFriend(req.id)}
                style={({ pressed }) => [styles.iconBtn, styles.iconBtnAccept, pressed && { opacity: 0.8 }]}
                hitSlop={6}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => declineFriend(req.id)}
                style={({ pressed }) => [styles.iconBtn, styles.iconBtnNeutral, pressed && { opacity: 0.8 }]}
                hitSlop={6}
              >
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.85)" />
              </Pressable>
            </View>
          ))}
        </GlassCard>
      )}

      {/* ── Sent requests ──────────────────────────────────────── */}
      {sentRequests.length > 0 && (
        <GlassCard>
          <Text style={sharedStyles.cardTitle}>
            {t('viewSentRequests', { cnt: sentRequests.length })}
          </Text>
          {sentRequests.map((req) => (
            <View key={req.id} style={styles.userRow}>
              <Text style={styles.userName} numberOfLines={1}>
                {req.name}
                {req.supporter && <Text style={styles.supporter}> ★</Text>}
              </Text>
              <Pressable
                onPress={() => cancelFriendRequest(req.id)}
                style={({ pressed }) => [styles.iconBtn, styles.iconBtnNeutral, pressed && { opacity: 0.8 }]}
                hitSlop={6}
              >
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.85)" />
              </Pressable>
            </View>
          ))}
        </GlassCard>
      )}

      {/* ── Friends list ───────────────────────────────────────── */}
      <GlassCard>
        <Text style={sharedStyles.cardTitle}>
          {t('friends', { cnt: friends.length })}
        </Text>
        {sortedFriends.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('noFriends')}</Text>
          </View>
        ) : (
          sortedFriends.map((friend) => (
            <View key={friend.id} style={styles.userRow}>
              <View style={styles.friendInfo}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: friend.online ? '#22c55e' : '#6b7280' },
                  ]}
                />
                <Text style={styles.userName} numberOfLines={1}>
                  {friend.name}
                  {friend.supporter && <Text style={styles.supporter}> ★</Text>}
                </Text>
              </View>
              {canSendInvite && friend.online && friend.socketId && (
                <Pressable
                  onPress={() => inviteFriendToGame(friend.socketId!)}
                  style={({ pressed }) => [styles.iconBtn, styles.iconBtnInvite, pressed && { opacity: 0.8 }]}
                  hitSlop={6}
                >
                  <Text style={styles.iconBtnInviteText}>{t('invite')}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => handleRemove(friend.id, friend.name)}
                style={({ pressed }) => [styles.iconBtn, styles.iconBtnNeutral, pressed && { opacity: 0.8 }]}
                hitSlop={6}
              >
                <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.85)" />
              </Pressable>
            </View>
          ))
        )}
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { gap: 12, paddingBottom: 32 },
  cardSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontFamily: 'Lexend',
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 12,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontFamily: 'Lexend',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendBtn: {
    backgroundColor: '#4ade80',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(74,222,128,0.4)',
  },
  sendBtnText: {
    color: '#0b1410',
    fontFamily: 'Lexend-Bold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  statePillSuccess: {
    backgroundColor: 'rgba(74,222,128,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.35)',
  },
  statePillError: {
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
  },
  stateText: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleLabel: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 14,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  friendInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  userName: {
    flex: 1,
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 14,
  },
  supporter: {
    color: '#fbbf24',
  },
  iconBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
    minHeight: 30,
  },
  iconBtnAccept: { backgroundColor: '#4ade80' },
  iconBtnInvite: { backgroundColor: '#60a5fa', paddingHorizontal: 12 },
  iconBtnInviteText: {
    color: '#0b1410',
    fontFamily: 'Lexend-Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  iconBtnNeutral: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'Lexend',
    fontSize: 13,
  },
});
