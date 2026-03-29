/**
 * Join a private game by entering a 6-digit code.
 *
 * Flow:
 * 1. User enters code → send joinPrivateGame
 * 2. On success (inGame=true) → show lobby (same as create screen, non-host)
 * 3. On error → show error message
 * 4. When game starts → navigate to game screen
 */

import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ImageBackground,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/shared';
import { spacing, fontSizes, borderRadius } from '../../src/styles/theme';
import { wsService } from '../../src/services/websocket';
import { useMultiplayerStore } from '../../src/store/multiplayerStore';
import PlayerList from '../../src/components/multiplayer/PlayerList';

export default function PartyJoinScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const inGame = useMultiplayerStore((s) => s.inGame);
  const gameData = useMultiplayerStore((s) => s.gameData);
  const joinError = useMultiplayerStore((s) => s.joinError);

  // Auto-focus input
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  // Clear error when code changes
  useEffect(() => {
    if (joinError) {
      useMultiplayerStore.setState({ joinError: null });
    }
  }, [code]);

  // Handle join error
  useEffect(() => {
    if (joinError) {
      setJoining(false);
    }
  }, [joinError]);

  // Navigate to game screen when game starts
  useEffect(() => {
    if (gameData?.state === 'getready' || gameData?.state === 'guess') {
      router.replace({
        pathname: '/game/[id]',
        params: { id: 'multiplayer' },
      });
    }
  }, [gameData?.state]);

  const handleJoin = () => {
    if (code.length !== 6) return;
    setJoining(true);
    useMultiplayerStore.setState({ joinError: null, enteringGameCode: true });
    wsService.send({ type: 'joinPrivateGame', gameCode: code });
  };

  // Send leaveGame when screen is removed (back button or programmatic navigation)
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
    if (inGame) {
      wsService.send({ type: 'leaveGame' });
      useMultiplayerStore.getState().reset();
    }
    router.dismissAll();
  };

  // If we've joined a game, show the lobby
  if (inGame && gameData) {
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
            <Text style={styles.headerTitle}>Game Lobby</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.lobbyContent}>
            <View style={styles.codeSection}>
              <Text style={styles.codeLabel}>GAME CODE</Text>
              <Text style={styles.codeText}>{gameData.code}</Text>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Players ({gameData.players?.length ?? 0})
              </Text>
              <PlayerList
                players={gameData.players ?? []}
                myId={gameData.myId}
              />
            </View>
            <Text style={styles.waitingText}>
              Waiting for host to start...
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Code entry screen
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
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </Pressable>
          <Text style={styles.headerTitle}>Join Game</Text>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Text style={styles.codeLabel}>ENTER GAME CODE</Text>

          <TextInput
            ref={inputRef}
            style={styles.codeInput}
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="000000"
            placeholderTextColor="rgba(255, 255, 255, 0.2)"
            autoFocus
          />

          {joinError && (
            <Text style={styles.errorText}>{joinError}</Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.joinBtn,
              code.length !== 6 && styles.joinBtnDisabled,
              pressed && code.length === 6 && { opacity: 0.85 },
            ]}
            onPress={handleJoin}
            disabled={code.length !== 6 || joining}
          >
            {joining ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.joinBtnText}>Join</Text>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  codeLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    letterSpacing: 2,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  codeInput: {
    color: colors.white,
    fontSize: 36,
    fontFamily: 'Lexend-Bold',
    letterSpacing: 8,
    textAlign: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    width: '100%',
    maxWidth: 300,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  joinBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['3xl'],
    borderRadius: borderRadius.lg,
    minWidth: 160,
    alignItems: 'center',
  },
  joinBtnDisabled: {
    opacity: 0.5,
  },
  joinBtnText: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-Bold',
  },
  lobbyContent: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.xl,
  },
  codeSection: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: spacing.xl,
  },
  codeText: {
    color: colors.white,
    fontSize: 36,
    fontFamily: 'Lexend-Bold',
    letterSpacing: 8,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-Bold',
  },
  waitingText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
    textAlign: 'center',
  },
});
