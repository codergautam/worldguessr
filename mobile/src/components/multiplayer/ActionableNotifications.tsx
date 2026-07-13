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
import {
  View,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  Easing,
  FadeInUp,
  FadeOutDown,
  ReduceMotion,
} from 'react-native-reanimated';
import { colors, t } from '../../shared';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import NotificationPill from './NotificationPill';
import { INFO_ACCENT } from './toastStyles';

/** Stale cards drop after 60s — matches a reasonable user-attention window. */
const STALE_MS = 60_000;

export default function ActionableNotifications() {
  const insets = useSafeAreaInsets();
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
          accentColor={INFO_ACCENT}
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
          // Accept only — home.tsx's inGame effect is the SINGLE owner of
          // navigating into /game/multiplayer (it fires when the server's `game`
          // message flips inGame). Pushing here too stacked a duplicate game
          // screen on the stack.
          //
          // Mid-match forfeit confirm (web home.js invite-accept parity):
          // accepting yanks you out of the current game server-side — mid-
          // round that can cost ELO or insta-lose, so confirm first. State is
          // read at CLICK time via getState() (this card can outlive several
          // state changes while it sits on screen). Waiting lobbies and
          // finished games (results) accept freely.
          onAccept={() => {
            const s = useMultiplayerStore.getState();
            const liveGame =
              s.inGame && s.gameData && !['waiting', 'end'].includes(s.gameData.state);
            if (liveGame) {
              Alert.alert(t('areYouSure'), t('acceptInviteWarning', { from: inv.invitedByName }), [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('join'),
                  style: 'destructive',
                  onPress: () => acceptGameInvite(inv.code, inv.invitedById),
                },
              ]);
              return;
            }
            acceptGameInvite(inv.code, inv.invitedById);
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
      entering={FadeInUp.duration(220).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.Never)}
      exiting={FadeOutDown.duration(180).reduceMotion(ReduceMotion.Never)}
      style={styles.card}
    >
      <NotificationPill
        icon={icon}
        accent={accentColor}
        message={message}
        maxLines={2}
        trailing={
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
        }
      />
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
    // Wrapper sizing; the pill visuals come from NotificationPill.
    maxWidth: 460,
    width: '100%',
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
