import { useEffect, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../ui/SfxPressable';
import { colors, t } from '../../shared';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';

/* ===========================================================================
 *  THE PLAYER CARD'S MENU.
 *
 *  A bottom sheet, not a dropdown under the card. The card is pinned to the
 *  top-right, which is the single hardest place to reach one-handed on a large
 *  phone; a menu that opens there would put four targets exactly where the
 *  thumb is not. Web gets the dropdown because a cursor does not care.
 *
 *  IT COPIES AccountSelectSheet.tsx, deliberately and closely: the same
 *  transparent Modal with animationType="none", the same Animated backdrop and
 *  spring-in translate, the same 22px top corners over #17331f, the same 44x4
 *  grab handle inside a 52x12 hit area, the same landscape width clamp. There
 *  is no bottom-sheet library in this app and this is not the place to add one
 *  — a second sheet that behaves differently to the first is worse than either.
 *
 *  THE ROWS ARE accountModal.js's OWN navigationItems, in the order the card
 *  earns them: the two things the card shows numbers for first, then the two
 *  screens behind it. Every label is an existing locale key; this menu
 *  introduces no new strings on either platform.
 * ======================================================================== */

interface PlayerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Hides the Shop row when the server's Stamps kill switch is off. */
  showShop: boolean;
  /** Pending received friend requests; 0 hides the badge. */
  friendRequests: number;
  onOpenElo: () => void;
  onOpenShop: () => void;
  onOpenProfile: () => void;
  onOpenFriends: () => void;
}

export default function PlayerSheet({
  visible,
  onClose,
  showShop,
  friendRequests,
  onOpenElo,
  onOpenShop,
  onOpenProfile,
  onOpenFriends,
}: PlayerSheetProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useState(() => new Animated.Value(0))[0];
  const sheetTranslateY = useState(() => new Animated.Value(280))[0];

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(sheetTranslateY, { toValue: 0, damping: 24, stiffness: 280, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(sheetTranslateY, { toValue: 280, duration: 180, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible, mounted, backdropOpacity, sheetTranslateY]);

  const isLandscape = width > height;
  const landscapeSheetWidth = Math.min(width * 0.58, 420);
  const landscapeSheetLeft = (width - landscapeSheetWidth) / 2;

  // Close FIRST, navigate second: the sheet's exit animation and a screen
  // transition running at once leaves the sheet visibly sliding over the
  // destination.
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };

  // Emoji straight from accountModal.js's navigationItems, except Customize,
  // which takes a paintbrush — backgrounds, glows, pins and emotes are the
  // player deciding how their game LOOKS, and "Shop" named the till instead.
  // Mirrors components/ui/playerCard.js exactly, including the colour: the
  // currency's gold `disc` used to sit here, and wearing it would keep saying
  // "currency" about the one row that stopped advertising the transaction.
  const rows: Array<{
    key: string;
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    badge?: number;
  }> = [
    { key: 'elo', icon: <Text style={styles.rowIcon}>🏆</Text>, label: t('elo'), onPress: go(onOpenElo) },
    ...(showShop
      ? [{
          key: 'shop',
          icon: <Ionicons name="brush" size={fontSizes.lg} color={colors.white} style={styles.rowIcon} />,
          label: t('shop'),
          onPress: go(onOpenShop),
        }]
      : []),
    { key: 'profile', icon: <Text style={styles.rowIcon}>👤</Text>, label: t('profile'), onPress: go(onOpenProfile) },
    { key: 'friends', icon: <Text style={styles.rowIcon}>👥</Text>, label: t('friendsText'), onPress: go(onOpenFriends), badge: friendRequests },
  ];

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable sfx="none" style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          isLandscape && styles.sheetLandscape,
          {
            paddingBottom: Math.max(insets.bottom, isLandscape ? spacing.md : spacing.lg),
            maxHeight: height - Math.max(insets.top, spacing.sm),
            ...(isLandscape ? { left: landscapeSheetLeft, right: undefined, width: landscapeSheetWidth } : null),
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}
      >
        <Pressable
          sfx="none"
          style={styles.handleHitArea}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        >
          <View style={styles.handle} />
        </Pressable>

        {rows.map((row) => (
          <Pressable
            key={row.key}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={row.onPress}
            accessibilityRole="button"
          >
            {row.icon}
            <Text style={styles.rowLabel}>{row.label}</Text>
            {!!row.badge && row.badge > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{row.badge}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: '#17331f',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: spacing.xs,
  },
  sheetLandscape: {
    paddingTop: spacing.sm,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  handleHitArea: {
    alignSelf: 'center',
    width: 52,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  rowPressed: {
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  // Fixed cell so every label starts on the same x regardless of glyph width.
  rowIcon: {
    width: 26,
    fontSize: fontSizes.lg,
    textAlign: 'center',
  },
  rowLabel: {
    flex: 1,
    color: colors.white,
    fontFamily: 'Lexend-Medium',
    fontSize: fontSizes.md,
  },
  badge: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: '#b3261e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.white,
    fontFamily: 'Lexend-Bold',
    fontSize: fontSizes.xs,
    fontVariant: ['tabular-nums'],
  },
});
