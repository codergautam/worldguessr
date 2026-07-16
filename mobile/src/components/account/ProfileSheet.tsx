/**
 * Slide-up sheet hosting the public ProfileView — for viewing another player's
 * profile WITHOUT leaving the current screen (e.g. tapping the opponent's name
 * mid-duel: the game stays visible/running behind the sheet and a tap on the
 * backdrop or the X dismisses it, instead of a full navigation to /user).
 *
 * Follows the app's established bottom-sheet pattern (see InviteFriendsModal):
 * native Modal + slide animation + dimmed backdrop that closes on tap.
 */

import { Modal, View, StyleSheet, Platform } from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import { colors } from '../../shared';
import { spacing } from '../../styles/theme';
import ProfileView from './ProfileView';

interface ProfileSheetProps {
  visible: boolean;
  username: string;
  onClose: () => void;
}

export default function ProfileSheet({ visible, username, onClose }: ProfileSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      // iOS: a native <Modal> defaults to portrait-only and rotates the whole UI
      // to portrait when opened in landscape. Allow both so the game underneath
      // keeps its orientation while the sheet is up.
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.backdrop}>
        <Pressable sfx="none" style={StyleSheet.absoluteFillObject} onPress={onClose} />
        {/* Shadow and clip are split across two views: overflow:hidden (needed to
            round ProfileView's full-bleed background) would clip the iOS shadow
            if both lived on one view. */}
        <View style={styles.sheetShadow}>
          <View style={styles.sheet}>
            {/* ProfileView already carries the public-profile chrome (header, tabs,
                close X via onBack) — the sheet just gives it a bottom-anchored frame. */}
            <ProfileView isOwnProfile={false} username={username} onBack={onClose} />
            {/* Grab-handle floats over the profile background so the backdrop image
                runs uninterrupted to the sheet's rounded top edge. */}
            <View style={styles.handle} pointerEvents="none" />
          </View>
        </View>
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
