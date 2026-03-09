/**
 * Private game creation & lobby screen.
 *
 * Flow:
 * 1. On mount: send createPrivateGame → server creates game with 6-digit code
 * 2. Show lobby: game code, player list
 * 3. Host can adjust options via MapSelectorModal (auto-opens on creation)
 * 4. Host presses Start → send startGameHost
 * 5. When gameData.state goes to 'getready' → navigate to game screen
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ImageBackground,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/shared';
import { spacing, fontSizes, borderRadius } from '../../src/styles/theme';
import { wsService } from '../../src/services/websocket';
import { useMultiplayerStore } from '../../src/store/multiplayerStore';
import PlayerList from '../../src/components/multiplayer/PlayerList';
import MapSelectorModal from '../../src/components/game/MapSelectorModal';

export default function PartyCreateScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const inGame = useMultiplayerStore((s) => s.inGame);
  const verified = useMultiplayerStore((s) => s.verified);
  const gameState = useMultiplayerStore((s) => s.gameData?.state);
  const gameCode = useMultiplayerStore((s) => s.gameData?.code);
  const isHost = useMultiplayerStore((s) => s.gameData?.host);
  const players = useMultiplayerStore((s) => s.gameData?.players);
  const myId = useMultiplayerStore((s) => s.gameData?.myId);
  const serverRounds = useMultiplayerStore((s) => s.gameData?.rounds);
  const serverTimePerRound = useMultiplayerStore((s) => s.gameData?.timePerRound);
  const serverDisplayLocation = useMultiplayerStore((s) => s.gameData?.displayLocation);
  const serverNm = useMultiplayerStore((s) => s.gameData?.nm);
  const [codeCopied, setCodeCopied] = useState(false);
  const sentRef = useRef(false);

  // Game settings (host controls)
  const [rounds, setRounds] = useState(5);
  const [timePerRound, setTimePerRound] = useState(30);
  const [nmpz, setNmpz] = useState(false);
  const [mapSlug, setMapSlug] = useState('all');
  const [mapName, setMapName] = useState('All Countries');
  const [mapModalVisible, setMapModalVisible] = useState(false);

  // Auto-open options modal when game is created (host only)
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (inGame && gameCode && isHost && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setMapModalVisible(true);
    }
  }, [inGame, gameCode, isHost]);

  // Send createPrivateGame once WS is verified (if not already in a game)
  useEffect(() => {
    if (verified && !sentRef.current) {
      sentRef.current = true;
      if (!inGame) {
        console.log('[Party] Sending createPrivateGame');
        wsService.send({ type: 'createPrivateGame' });
      } else {
        console.log('[Party] Already in game, skipping createPrivateGame');
      }
    }
  }, [verified]);

  // Navigate to game screen when game starts
  useEffect(() => {
    if (gameState === 'getready' || gameState === 'guess') {
      router.replace({
        pathname: '/game/[id]',
        params: { id: 'multiplayer' },
      });
    }
  }, [gameState]);

  // Send settings to server when changed (host only)
  const sendOptions = useCallback(() => {
    wsService.send({
      type: 'setPrivateGameOptions',
      rounds,
      timePerRound,
      location: mapSlug,
      displayLocation: mapName,
      nm: nmpz,
      npz: nmpz,
      showRoadName: !nmpz,
    });
  }, [rounds, timePerRound, nmpz, mapSlug, mapName]);

  useEffect(() => {
    if (isHost) {
      sendOptions();
    }
  }, [rounds, timePerRound, nmpz, mapSlug, mapName, isHost]);

  const handleStart = () => {
    if (!players || players.length < 2) {
      Alert.alert('Need Players', 'You need at least 2 players to start.');
      return;
    }
    wsService.send({ type: 'startGameHost' });
  };

  const handleCopyCode = async () => {
    if (gameCode) {
      await Clipboard.setStringAsync(gameCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  // Send leaveGame when screen is removed (back swipe, back button, or explicit leave)
  const leftRef = useRef(false);
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (!leftRef.current && useMultiplayerStore.getState().inGame) {
        leftRef.current = true;
        wsService.send({ type: 'leaveGame' });
        useMultiplayerStore.getState().reset();
      }
    });
    return unsubscribe;
  }, [navigation]);

  const handleLeave = () => {
    leftRef.current = true;
    wsService.send({ type: 'leaveGame' });
    useMultiplayerStore.getState().reset();
    router.back();
  };

  const playerCount = players?.length ?? 0;

  if (!inGame || !gameCode) {
    return (
      <View style={styles.container}>
        <ImageBackground
          source={require('../../assets/street2.jpg')}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
        <View style={styles.darkOverlay} />
        <SafeAreaView style={[styles.flex, styles.center]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Creating game...</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
      <View style={styles.darkOverlay} />
      <LinearGradient
        colors={[
          'rgba(20, 65, 25, 0.85)',
          'rgba(20, 65, 25, 0.6)',
          'rgba(0, 0, 0, 0.7)',
        ]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={handleLeave} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {isHost ? 'Your Game' : 'Game Lobby'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Game Code */}
          <View style={styles.codeSection}>
            <Text style={styles.codeLabel}>GAME CODE</Text>
            <Pressable onPress={handleCopyCode} style={styles.codeRow}>
              <Text style={styles.codeText}>{gameCode}</Text>
              <Ionicons
                name={codeCopied ? 'checkmark' : 'copy'}
                size={20}
                color={codeCopied ? colors.success : 'rgba(255,255,255,0.6)'}
              />
            </Pressable>
            {codeCopied && (
              <Text style={styles.copiedText}>Copied!</Text>
            )}
          </View>

          {/* Players */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Players ({playerCount})
            </Text>
            <PlayerList
              players={players ?? []}
              myId={myId}
            />
          </View>

          {!isHost && (
            <Text style={styles.waitingText}>
              Waiting for host to start...
            </Text>
          )}
        </ScrollView>

        {/* Footer: settings preview + buttons */}
        <View style={styles.footer}>
          {/* Compact settings preview */}
          <View style={styles.settingsPreview}>
            {(() => {
              const dispMap = isHost ? mapName : (serverDisplayLocation ?? 'All Countries');
              const dispRounds = isHost ? rounds : (serverRounds ?? 5);
              const t = isHost ? timePerRound : ((serverTimePerRound ?? 30000) / 1000);
              const dispTimer = t > 0 ? `${t}s` : 'Timer Off';
              const dispNmpz = (isHost ? nmpz : serverNm) ? 'NMPZ' : null;
              return (
                <Text style={styles.settingsPreviewText}>
                  {dispMap} · {dispRounds} rounds · {dispTimer}{dispNmpz ? ` · ${dispNmpz}` : ''}
                </Text>
              );
            })()}
          </View>

          {isHost && (
            <Pressable
              style={({ pressed }) => [
                styles.optionsBtn,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => setMapModalVisible(true)}
            >
              <Ionicons name="settings-outline" size={18} color={colors.white} />
              <Text style={styles.optionsBtnText}>Edit Game Options</Text>
            </Pressable>
          )}

          {isHost && (
            <Pressable
              style={({ pressed }) => [
                styles.startBtn,
                playerCount < 2 && styles.startBtnDisabled,
                pressed && playerCount >= 2 && { opacity: 0.85 },
              ]}
              onPress={handleStart}
              disabled={playerCount < 2}
            >
              <Text style={styles.startBtnText}>
          {isHost && playerCount < 2 ? (
                'Waiting for players...'
              ) : (
                'Start Game'
              )}
              </Text>
            </Pressable>
          )}

        </View>
      </SafeAreaView>

      <MapSelectorModal
        visible={mapModalVisible}
        onClose={() => setMapModalVisible(false)}
        onSelectMap={(slug, name) => {
          setMapSlug(slug);
          setMapName(name);
          setMapModalVisible(false);
        }}
        currentMapSlug={mapSlug}
        nmpzEnabled={nmpz}
        onNmpzToggle={setNmpz}
        timerEnabled={timePerRound !== 0}
        onTimerToggle={(v) => setTimePerRound(v ? 30 : 0)}
        timerDuration={timePerRound}
        onTimerDurationChange={setTimePerRound}
        rounds={rounds}
        onRoundsChange={setRounds}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1a0c',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  flex: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontFamily: 'Lexend',
    fontSize: fontSizes.md,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-Bold',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  codeSection: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: spacing.xl,
  },
  codeLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  codeText: {
    color: colors.white,
    fontSize: 36,
    fontFamily: 'Lexend-Bold',
    letterSpacing: 8,
  },
  copiedText: {
    color: colors.success,
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    marginTop: spacing.xs,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-Bold',
  },
  settingsPreview: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  settingsPreviewText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    textAlign: 'center',
  },
  minPlayersText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    textAlign: 'center',
  },
  waitingText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
    textAlign: 'center',
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  optionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  optionsBtnText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
  },
  startBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  startBtnDisabled: {
    opacity: 0.5,
  },
  startBtnText: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-Bold',
  },
});
