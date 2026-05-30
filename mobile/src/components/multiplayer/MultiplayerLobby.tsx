/**
 * Private-game lobby (the `state === 'waiting'` view of the unified multiplayer
 * screen). Lifted out of app/party/create.tsx so the lobby is rendered in ONE
 * place — both a freshly created game and a private game that was reset back to
 * the lobby (host "Play Again" / host back mid-game) show this same component.
 *
 * Reads everything from the multiplayer store; the parent owns leaving via the
 * `onLeave` prop (web backBtnPressed parity lives in the unified screen).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ImageBackground,
  Alert,
  Animated,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../shared';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import { wsService } from '../../services/websocket';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { getPartyLink } from '../../shared/utils/partyLink';
import PlayerList from './PlayerList';
import InviteFriendsModal from './InviteFriendsModal';
import MapSelectorModal from '../game/MapSelectorModal';

interface MultiplayerLobbyProps {
  /** Leave/back handler owned by the unified screen (web backBtnPressed parity). */
  onLeave: () => void;
}

export default function MultiplayerLobby({ onLeave }: MultiplayerLobbyProps) {
  const gameCode = useMultiplayerStore((s) => s.gameData?.code);
  const isHost = useMultiplayerStore((s) => s.gameData?.host);
  const players = useMultiplayerStore((s) => s.gameData?.players);
  const myId = useMultiplayerStore((s) => s.gameData?.myId);
  const serverRounds = useMultiplayerStore((s) => s.gameData?.rounds);
  const serverTimePerRound = useMultiplayerStore((s) => s.gameData?.timePerRound);
  const serverDisplayLocation = useMultiplayerStore((s) => s.gameData?.displayLocation);
  const serverNm = useMultiplayerStore((s) => s.gameData?.nm);

  const [codeCopied, setCodeCopied] = useState(false);
  const copyIconScale = useRef(new Animated.Value(1)).current;

  // Host-controlled settings. Initialise from server values so a reconnect or a
  // post-game reset doesn't clobber the host's prior options with defaults.
  const [rounds, setRounds] = useState(serverRounds ?? 5);
  const [timePerRound, setTimePerRound] = useState(
    serverTimePerRound != null ? Math.round(serverTimePerRound / 1000) : 30,
  );
  const [nmpz, setNmpz] = useState(serverNm ?? false);
  const [mapSlug, setMapSlug] = useState('all');
  const [mapName, setMapName] = useState(serverDisplayLocation ?? 'World');
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);

  // Auto-open the options modal once, only the first time a host lands in a
  // freshly created lobby (not on reconnect or a post-game reset).
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (isHost && gameCode && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      const timer = setTimeout(() => setMapModalVisible(true), 150);
      return () => clearTimeout(timer);
    }
  }, [isHost, gameCode]);

  // Push settings to the server when the host changes them.
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
    if (isHost) sendOptions();
  }, [rounds, timePerRound, nmpz, mapSlug, mapName, isHost]);

  const playerCount = players?.length ?? 0;

  const handleStart = () => {
    if (!players || players.length < 2) {
      Alert.alert('Need Players', 'You need at least 2 players to start.');
      return;
    }
    wsService.send({ type: 'startGameHost' });
  };

  const handleCopyCode = async () => {
    if (!gameCode) return;
    await Clipboard.setStringAsync(getPartyLink(gameCode));
    setCodeCopied(true);
    Animated.sequence([
      Animated.timing(copyIconScale, { toValue: 1.4, duration: 150, useNativeDriver: true }),
      Animated.timing(copyIconScale, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setCodeCopied(false), 2000);
  };

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        fadeDuration={0}
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
          <Pressable onPress={onLeave} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </Pressable>
          <Text style={styles.headerTitle}>{isHost ? 'Your Game' : 'Game Lobby'}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Game Code */}
          <View style={styles.codeSection}>
            <Text style={styles.codeLabel}>GAME CODE</Text>
            <Pressable onPress={handleCopyCode} style={styles.codeRow}>
              <Text style={styles.codeText}>{gameCode}</Text>
              <Animated.View style={{ transform: [{ scale: copyIconScale }] }}>
                <Ionicons
                  name={codeCopied ? 'checkmark' : 'copy'}
                  size={20}
                  color={codeCopied ? colors.success : 'rgba(255,255,255,0.6)'}
                />
              </Animated.View>
            </Pressable>
            <Text style={styles.codeHint}>
              {codeCopied ? 'Invite link copied!' : 'Tap to copy invite link'}
            </Text>
          </View>

          {/* Players */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Players ({playerCount})</Text>
            <PlayerList players={players ?? []} myId={myId} mode="lobby" />
          </View>

          {!isHost && (
            <Text style={styles.waitingText}>Waiting for host to start...</Text>
          )}
        </ScrollView>

        {/* Footer: settings preview + buttons */}
        <View style={styles.footer}>
          <View style={styles.settingsPreview}>
            {(() => {
              const dispMap = isHost ? mapName : (serverDisplayLocation ?? 'World');
              const dispRounds = isHost ? rounds : (serverRounds ?? 5);
              const tSecs = isHost ? timePerRound : ((serverTimePerRound ?? 30000) / 1000);
              const dispTimer = tSecs > 0 ? `${tSecs}s` : 'Timer Off';
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
              style={({ pressed }) => [styles.optionsBtn, pressed && { opacity: 0.85 }]}
              onPress={() => setMapModalVisible(true)}
            >
              <Ionicons name="settings-outline" size={18} color={colors.white} />
              <Text style={styles.optionsBtnText}>Edit Game Options</Text>
            </Pressable>
          )}

          {isHost && (
            <Pressable
              style={({ pressed }) => [styles.optionsBtn, pressed && { opacity: 0.85 }]}
              onPress={() => setInviteModalVisible(true)}
            >
              <Ionicons name="people" size={18} color={colors.white} />
              <Text style={styles.optionsBtnText}>Invite Friends</Text>
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
                {playerCount < 2 ? 'Waiting for players...' : 'Start Game'}
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      <InviteFriendsModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
      />

      <MapSelectorModal
        visible={mapModalVisible}
        onClose={() => setMapModalVisible(false)}
        onSelectMap={(slug, name) => {
          setMapSlug(slug);
          setMapName(name);
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
  container: { flex: 1, backgroundColor: '#0a1a0c' },
  darkOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: colors.white, fontSize: fontSizes.lg, fontFamily: 'Lexend-Bold' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, gap: spacing.xl },
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
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  codeText: { color: colors.white, fontSize: 36, fontFamily: 'Lexend-Bold', letterSpacing: 8 },
  codeHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    marginTop: spacing.sm,
  },
  section: { gap: spacing.md },
  sectionTitle: { color: colors.white, fontSize: fontSizes.md, fontFamily: 'Lexend-Bold' },
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
  waitingText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
    textAlign: 'center',
  },
  footer: { padding: spacing.lg, gap: spacing.sm },
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
  optionsBtnText: { color: colors.white, fontSize: fontSizes.sm, fontFamily: 'Lexend-SemiBold' },
  startBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { color: colors.white, fontSize: fontSizes.md, fontFamily: 'Lexend-Bold' },
});
