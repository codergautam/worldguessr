/**
 * Queue screen — shown while searching for a multiplayer match.
 * Matches web's BannerText style: big centered text + spinning compass gif.
 */

import { useEffect, useRef } from 'react';
import { View, Text, Image, ImageBackground, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { colors } from '../src/shared';
import { wsService } from '../src/services/websocket';
import { useMultiplayerStore } from '../src/store/multiplayerStore';

export default function QueueScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const gameQueued = useMultiplayerStore((s) => s.gameQueued);
  const publicDuelRange = useMultiplayerStore((s) => s.publicDuelRange);
  const inGame = useMultiplayerStore((s) => s.inGame);
  const gameState = useMultiplayerStore((s) => s.gameData?.state);
  const hasNavigated = useRef(false);
  const leftRef = useRef(false);

  // Scale font based on screen width (clamp between 24 and 44)
  const titleSize = Math.min(44, Math.max(24, width * 0.09));
  const compassSize = titleSize * 1.8;
  const subTextSize = Math.min(24, Math.max(16, width * 0.05));

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/home');
    }
  };

  const leaveQueue = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    wsService.send({ type: 'leaveQueue' });
    useMultiplayerStore.setState({ gameQueued: false, publicDuelRange: null });
  };

  // Navigate to game when match is found
  useEffect(() => {
    if (inGame && gameState && !hasNavigated.current) {
      hasNavigated.current = true;
      leftRef.current = true; // prevent leaveQueue on unmount
      router.replace({
        pathname: '/game/[id]',
        params: { id: 'multiplayer' },
      });
    }
  }, [inGame, gameState]);

  // If queue was cancelled externally (e.g. gameCancelled), go back
  useEffect(() => {
    if (!gameQueued && !inGame && !hasNavigated.current) {
      leftRef.current = true; // already cancelled server-side
      goBack();
    }
  }, [gameQueued, inGame]);

  // Send leaveQueue if user swipes back / presses back
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (!hasNavigated.current) {
        leaveQueue();
      }
    });
    return unsubscribe;
  }, [navigation]);

  const handleCancel = () => {
    leaveQueue();
    goBack();
  };

  const isRanked = gameQueued === 'publicDuel';

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
      <View style={styles.darkOverlay} />
      <View style={styles.center}>
        <View style={styles.row}>
          <Text style={[styles.title, { fontSize: titleSize }]} numberOfLines={1} adjustsFontSizeToFit>
            Finding a game
          </Text>
          <Image
            source={require('../assets/loader.gif')}
            style={{ width: compassSize, height: compassSize, marginLeft: 8 }}
          />
        </View>

        {isRanked && publicDuelRange && (
          <Text style={[styles.subText, { fontSize: subTextSize }]}>
            ELO Range: {publicDuelRange[0]} - {publicDuelRange[1]}
          </Text>
        )}
      </View>

      <Pressable
        style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
        onPress={handleCancel}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
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
  cancelBtn: {
    position: 'absolute',
    bottom: 80,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  cancelText: {
    color: colors.white,
    fontSize: 18,
    fontFamily: 'Lexend-SemiBold',
  },
});
