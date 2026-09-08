/**
 * Slide-up sheet hosting the public ProfileView — for viewing another player's
 * profile WITHOUT leaving the current screen (e.g. tapping the opponent's name
 * mid-duel: the game stays visible/running behind the sheet and a tap on the
 * backdrop or the X dismisses it, instead of a full navigation to /user).
 *
 * Follows the app's established bottom-sheet pattern (see InviteFriendsModal):
 * native Modal + dimmed backdrop that closes on tap. The slide is JS-driven
 * (MapSelectorModal's recipe) rather than the Modal's own animationType, so a
 * downward drag on the sheet head follows the finger and slides the sheet out.
 * The X, the backdrop and Android back all run that same exit.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import { colors } from '../../shared';
import { spacing } from '../../styles/theme';
import ProfileView from './ProfileView';

interface ProfileSheetProps {
  visible: boolean;
  username: string;
  onClose: () => void;
}

const SPRING = { damping: 28, stiffness: 300, useNativeDriver: true } as const;

export default function ProfileSheet({ visible, username, onClose }: ProfileSheetProps) {
  const { height } = useWindowDimensions();
  const heightRef = useRef(height);
  heightRef.current = height;

  // translateY of the sheet: 0 = open, window height = fully below the
  // screen. The backdrop's opacity rides the same value, so open, close and
  // drag all dim in step with the sheet.
  const sheetY = useRef(new Animated.Value(height)).current;
  const [mounted, setMounted] = useState(false);
  const closingRef = useRef(false);

  const animateOpen = useCallback(() => {
    sheetY.setValue(heightRef.current);
    Animated.spring(sheetY, { toValue: 0, ...SPRING }).start();
  }, [sheetY]);

  const animateClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(sheetY, {
      toValue: heightRef.current,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      closingRef.current = false;
      onClose();
    });
  }, [sheetY, onClose]);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      setMounted(true);
      // Let React render the sheet before the spring starts.
      requestAnimationFrame(() => animateOpen());
    } else {
      setMounted(false);
      sheetY.setValue(heightRef.current);
    }
  }, [visible, animateOpen, sheetY]);

  // Drag-down to dismiss. Lives on ProfileView's sticky header (the one strip
  // that never scrolls) via sheetDragHandlers. Claims only a mostly-vertical
  // downward move, so the header's own buttons keep their taps.
  const animateCloseRef = useRef(animateClose);
  animateCloseRef.current = animateClose;
  const dragPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) sheetY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 0.5) {
          animateCloseRef.current();
        } else {
          Animated.spring(sheetY, { toValue: 0, ...SPRING }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetY, { toValue: 0, ...SPRING }).start();
      },
    }),
  ).current;

  const backdropOpacity = sheetY.interpolate({
    inputRange: [0, height],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Modal
      visible={mounted}
      animationType="none"
      transparent
      onRequestClose={animateClose}
      // iOS: a native <Modal> defaults to portrait-only and rotates the whole UI
      // to portrait when opened in landscape. Allow both so the game underneath
      // keeps its orientation while the sheet is up.
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable sfx="none" style={StyleSheet.absoluteFillObject} onPress={animateClose} />
        </Animated.View>
        {/* Shadow and clip are split across two views: overflow:hidden (needed to
            round ProfileView's full-bleed background) would clip the iOS shadow
            if both lived on one view. */}
        <Animated.View style={[styles.sheetShadow, { transform: [{ translateY: sheetY }] }]}>
          <View style={styles.sheet}>
            {/* ProfileView already carries the public-profile chrome (header, tabs,
                close X via onBack) — the sheet just gives it a bottom-anchored frame. */}
            <ProfileView
              isOwnProfile={false}
              username={username}
              onBack={animateClose}
              sheetDragHandlers={dragPan.panHandlers}
            />
            {/* Grab-handle floats over the profile background so the backdrop image
                runs uninterrupted to the sheet's rounded top edge. */}
            <View style={styles.handle} pointerEvents="none" />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheetShadow: {
    // Definite height (not maxHeight): ProfileView is a flex column that fills
    // its parent. 80% leaves the duel HUD (health bars + timer) peeking above.
    height: '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden', // clip ProfileView's full-bleed background to the rounded corners
  },
  handle: {
    position: 'absolute',
    top: spacing.sm,
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
});
