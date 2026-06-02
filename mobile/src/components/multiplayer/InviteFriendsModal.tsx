/**
 * Modal listing online friends inside a private-game lobby. Tapping Invite
 * sends `inviteFriend` (matches web `home.js:2323 sendInvite`).
 *
 * Polls getFriends every 5s while open so the list stays fresh.
 */

import { useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { colors, t } from '../../shared';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import { getPartyLink } from '../../shared/utils/partyLink';

const POLL_INTERVAL_MS = 5000;

interface InviteFriendsModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function InviteFriendsModal({ visible, onClose }: InviteFriendsModalProps) {
  const friends = useMultiplayerStore((s) => s.friends);
  const requestFriends = useMultiplayerStore((s) => s.requestFriends);
  const inviteFriendToGame = useMultiplayerStore((s) => s.inviteFriendToGame);
  const gameCode = useMultiplayerStore((s) => s.gameData?.code);

  const handleShareCode = async () => {
    if (!gameCode) return;
    try {
      await Share.share({
        message: t('shareJoinPartyMessage', { link: getPartyLink(gameCode) }, 'Join my WorldGuessr party: {{link}}'),
        title: t('sharePartyInviteTitle', undefined, 'WorldGuessr Party Invite'),
      });
    } catch {
      // User cancelled the share sheet — no-op.
    }
  };

  useEffect(() => {
    if (!visible) return;
    requestFriends();
    const interval = setInterval(requestFriends, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [visible, requestFriends]);

  const onlineFriends = useMemo(
    () => friends.filter((f) => f.online && f.socketId),
    [friends],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{t('inviteFriends', undefined, 'Invite Friends')}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>
          <Text style={styles.sub}>
            {onlineFriends.length === 1
              ? t('friendOnlineCount', { cnt: onlineFriends.length }, '{{cnt}} friend online')
              : t('friendsOnlineCount', { cnt: onlineFriends.length }, '{{cnt}} friends online')}
          </Text>

          <Pressable
            onPress={handleShareCode}
            style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="share-outline" size={18} color={colors.white} />
            <Text style={styles.shareBtnText}>{t('shareInviteLink', undefined, 'Share invite link')}</Text>
          </Pressable>

          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: spacing.lg }}>
            {onlineFriends.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={36} color="rgba(255,255,255,0.3)" />
                <Text style={styles.emptyText}>{t('noOnlineFriends', undefined, 'No online friends right now')}</Text>
                <Text style={styles.emptyHint}>{t('shareGameCodeHint', undefined, 'Share the game code with anyone you want to invite.')}</Text>
              </View>
            ) : (
              onlineFriends.map((friend) => (
                <View key={friend.id} style={styles.row}>
                  <View style={styles.statusDot} />
                  <Text style={styles.name} numberOfLines={1}>
                    {friend.name}
                    {friend.supporter && <Text style={styles.supporter}> ★</Text>}
                  </Text>
                  <Pressable
                    onPress={() => inviteFriendToGame(friend.socketId!)}
                    style={({ pressed }) => [styles.inviteBtn, pressed && { opacity: 0.85 }]}
                  >
                    <Ionicons name="paper-plane" size={14} color="#0b1410" />
                    <Text style={styles.inviteText}>{t('invite')}</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0c1a14',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    maxHeight: '70%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
    }),
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-Bold',
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    marginTop: 2,
    marginBottom: spacing.md,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: spacing.md,
  },
  shareBtnText: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.sm,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  name: {
    flex: 1,
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.sm,
  },
  supporter: { color: '#fbbf24' },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#60a5fa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
  },
  inviteText: {
    color: '#0b1410',
    fontFamily: 'Lexend-Bold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: {
    paddingVertical: 30,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.sm,
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'Lexend',
    fontSize: fontSizes.xs,
    textAlign: 'center',
    maxWidth: 280,
  },
});
