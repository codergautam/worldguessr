/**
 * Thin "creating game" entry screen.
 *
 * Sends createPrivateGame once the socket is verified. It does NOT navigate to
 * the game — home.tsx is the single owner of "enter the multiplayer screen" and
 * pushes /game/multiplayer (which renders the lobby) as soon as `inGame` flips.
 * All lobby UI + leave logic now live in the unified screen (MultiplayerLobby).
 */

import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ImageBackground, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, t } from '../../src/shared';
import { spacing, fontSizes } from '../../src/styles/theme';
import { wsService } from '../../src/services/websocket';
import { useMultiplayerStore } from '../../src/store/multiplayerStore';

export default function PartyCreateScreen() {
  const verified = useMultiplayerStore((s) => s.verified);
  const inGame = useMultiplayerStore((s) => s.inGame);
  const sentRef = useRef(false);

  useEffect(() => {
    if (verified && !sentRef.current && !inGame) {
      sentRef.current = true;
      wsService.send({ type: 'createPrivateGame' });
    }
  }, [verified, inGame]);

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        fadeDuration={0}
      />
      <View style={styles.darkOverlay} />
      <SafeAreaView style={[styles.flex, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{t('creating')}</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1a0c' },
  darkOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  flex: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: {
    color: colors.textSecondary,
    fontFamily: 'Lexend',
    fontSize: fontSizes.md,
    marginTop: spacing.md,
  },
});
