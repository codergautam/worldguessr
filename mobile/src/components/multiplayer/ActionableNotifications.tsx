/**
 * Stack of actionable in-app notifications for friend requests + game invites.
 * Renders below ToastProvider. Each card has Accept / Decline buttons that
 * call the corresponding `useMultiplayerStore` action (1:1 with web `home.js`
 * custom toasts for `friendReq` and `invite` messages).
 *
 * Cards auto-dismiss after STALE_MS to keep the UI tidy if the user ignores them.
 */

import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeInUp,
  FadeOutDown,
} from 'react-native-reanimated';
import { colors, t } from '../../shared';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import { useMultiplayerStore } from '../../store/multiplayerStore';

/** Stale cards drop after 60s — matches a reasonable user-attention window. */
const STALE_MS = 60_000;

export default function ActionableNotifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const friendRequests = useMultiplayerStore((s) => s.friendRequests);
  const gameInvites = useMultiplayerStore((s) => s.gameInvites);
  const acceptFriend = useMultiplayerStore((s) => s.acceptFriend);
  const declineFriend = useMultiplayerStore((s) => s.declineFriend);
  const clearFriendRequest = useMultiplayerStore((s) => s.clearFriendRequest);
  const acceptGameInvite = useMultiplayerStore((s) => s.acceptGameInvite);
  const clearGameInvite = useMultiplayerStore((s) => s.clearGameInvite);

  // Sweep stale cards every 5s.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      friendRequests.forEach((req) => {
        if (now - req.timestamp > STALE_MS) clearFriendRequest(req.id);
      });
      gameInvites.forEach((inv) => {
        if (now - inv.timestamp > STALE_MS) clearGameInvite(inv.code);
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [friendRequests, gameInvites, clearFriendRequest, clearGameInvite]);

  if (friendRequests.length === 0 && gameInvites.length === 0) return null;

  return (
    <View
      style={[styles.container, { top: insets.top + 64 }]}
      pointerEvents="box-none"
    >
      {friendRequests.map((req) => (
        <NotificationCard
          key={`fr-${req.id}`}
          icon="person-add"
          accentColor="#60a5fa"
          message={t('youGotFriendReq', { from: req.name })}
          onAccept={() => acceptFriend(req.id)}
          onDecline={() => declineFriend(req.id)}
        />
      ))}
      {gameInvites.map((inv) => (
        <NotificationCard
          key={`inv-${inv.code}-${inv.timestamp}`}
          icon="game-controller"
          accentColor={colors.primary}
          message={t('youGotInvite', { from: inv.invitedByName })}
          onAccept={() => {
            acceptGameInvite(inv.code, inv.invitedById);
            // Server adds us to the game and broadcasts `game`; jump to the multiplayer
            // game screen so the inGame state effect lands us in the right view.
            router.push({ pathname: '/game/[id]', params: { id: 'multiplayer' } });
          }}
          onDecline={() => clearGameInvite(inv.code)}
        />
      ))}
    </View>
  );
}

function NotificationCard({
  icon,
  accentColor,
  message,
  onAccept,
  onDecline,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  accentColor: string;
  message: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInUp.duration(220).easing(Easing.out(Easing.cubic))}
      exiting={FadeOutDown.duration(180)}
      style={[styles.card, { borderLeftColor: accentColor }]}
    >
      <Ionicons name={icon} size={20} color={accentColor} />
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={onAccept}
          style={({ pressed }) => [styles.btn, styles.btnAccept, pressed && styles.btnPressed]}
          hitSlop={6}
        >
          <Text style={styles.btnAcceptText}>{t('accept')}</Text>
        </Pressable>
        <Pressable
          onPress={onDecline}
          style={({ pressed }) => [styles.btn, styles.btnDecline, pressed && styles.btnPressed]}
          hitSlop={6}
        >
          <Text style={styles.btnDeclineText}>{t('decline')}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 9999,
    gap: spacing.xs,
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: Platform.OS === 'android'
      ? 'rgba(20, 20, 20, 0.95)'
      : 'rgba(20, 20, 20, 0.92)',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderLeftWidth: 3,
    maxWidth: 460,
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  message: {
    flex: 1,
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  btn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    minWidth: 60,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnAccept: { backgroundColor: colors.success },
  btnAcceptText: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes.xs,
  },
  btnDecline: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  btnDeclineText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.xs,
  },
});
