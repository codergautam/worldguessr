/**
 * Queue screen — shown while searching for a multiplayer match.
 * Matches web's BannerText style: big centered text + spinning compass gif.
 */

import { useEffect, useRef } from 'react';
import { View, Text, Image, ImageBackground, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { colors, t } from '../src/shared';
import { spacing } from '../src/styles/theme';
import { wsService } from '../src/services/websocket';
import { useMultiplayerStore } from '../src/store/multiplayerStore';
import BackButton from '../src/components/ui/BackButton';

export default function QueueScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const gameQueued = useMultiplayerStore((s) => s.gameQueued);
  const publicDuelRange = useMultiplayerStore((s) => s.publicDuelRange);
  const inGame = useMultiplayerStore((s) => s.inGame);
  const gameState = useMultiplayerStore((s) => s.gameData?.state);
  const exitedRef = useRef(false);

  // Scale font based on screen width (clamp between 24 and 44)
  const titleSize = Math.min(44, Math.max(24, width * 0.09));
  const compassSize = titleSize * 1.8;
  const subTextSize = Math.min(24, Math.max(16, width * 0.05));

  // Single exit path. Idempotent — caller can race state updates without double-popping.
  const exitBack = () => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    router.back();
  };

  // Match found → home.tsx owns navigating into /game/multiplayer. Mark this
  // screen exited so the beforeRemove cleanup below won't send leaveQueue when
  // the queue screen is later torn down underneath the game.
  useEffect(() => {
    if (inGame && gameState) {
      exitedRef.current = true;
    }
  }, [inGame, gameState]);

  // Server-side cancellation (gameCancelled etc.) → pop
  useEffect(() => {
    if (!gameQueued && !inGame) {
      exitBack();
    }
  }, [gameQueued, inGame]);

  // Swipe / hardware back → tell server, then let nav unwind naturally
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (!exitedRef.current) {
        exitedRef.current = true;
        wsService.send({ type: 'leaveQueue' });
        useMultiplayerStore.setState({ gameQueued: false, publicDuelRange: null });
      }
    });
    return unsubscribe;
  }, [navigation]);

  const handleCancel = () => {
    if (exitedRef.current) return;
    wsService.send({ type: 'leaveQueue' });
    useMultiplayerStore.setState({ gameQueued: false, publicDuelRange: null });
    exitBack();
  };

  const isRanked = gameQueued === 'publicDuel';
  const title = t('findingGame');

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        fadeDuration={0}
      />
      <View style={styles.darkOverlay} />

      <SafeAreaView style={styles.backButtonContainer} edges={['top']} pointerEvents="box-none">
        <BackButton onPress={handleCancel} />
      </SafeAreaView>

      <View style={styles.center}>
        <View style={styles.row}>
          <Text style={[styles.title, { fontSize: titleSize }]} numberOfLines={1} adjustsFontSizeToFit>
            {title}
          </Text>
          <Image
            source={require('../assets/loader.gif')}
            style={{ width: compassSize, height: compassSize, marginLeft: 8 }}
          />
        </View>

        {isRanked && publicDuelRange && (
          <Text style={[styles.subText, { fontSize: subTextSize }]}>
            {t('eloRange')}: {publicDuelRange[0]} - {publicDuelRange[1]}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  center: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
    flexShrink: 1,
  },
  subText: {
    color: '#fff',
    fontFamily: 'Lexend',
    marginTop: 20,
    textAlign: 'center',
  },
  backButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
    paddingLeft: spacing.lg,
    paddingTop: spacing.sm,
  },
});
