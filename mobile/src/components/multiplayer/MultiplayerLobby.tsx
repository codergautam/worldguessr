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
  Share,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, t } from '../../shared';
import { haptics } from '../../services/haptics';
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
  // Read insets via the hook (synchronous from context) rather than the native
  // <SafeAreaView> component, whose padding lands a frame late — under the
  // 'fade' screen transition that one-frame jump is visible as the header
  // flashing up under the status bar then snapping down. The hook is correct on
  // the first paint.
  const insets = useSafeAreaInsets();
  // Landscape splits the lobby into two columns (code+players | settings+actions)
  // so the Start button is never pushed off short landscape viewports the way the
  // single vertical stack does. Matches queue.tsx / results.tsx orientation handling.
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const gameCode = useMultiplayerStore((s) => s.gameData?.code);
  const isHost = useMultiplayerStore((s) => s.gameData?.host);
  const players = useMultiplayerStore((s) => s.gameData?.players);
  const myId = useMultiplayerStore((s) => s.gameData?.myId);
  const serverRounds = useMultiplayerStore((s) => s.gameData?.rounds);
  const serverTimePerRound = useMultiplayerStore((s) => s.gameData?.timePerRound);
  const serverDisplayLocation = useMultiplayerStore((s) => s.gameData?.displayLocation);
  const serverNm = useMultiplayerStore((s) => s.gameData?.nm);

  const copyIconScale = useRef(new Animated.Value(1)).current;

  // Host-controlled settings. Initialise from server values so a reconnect or a
  // post-game reset doesn't clobber the host's prior options with defaults.
  const [rounds, setRounds] = useState(serverRounds ?? 5);
  const [timePerRound, setTimePerRound] = useState(
    serverTimePerRound != null ? Math.round(serverTimePerRound / 1000) : 30,
  );
  const [nmpz, setNmpz] = useState(serverNm ?? false);
  const [mapSlug, setMapSlug] = useState('all');
  const [mapName, setMapName] = useState(serverDisplayLocation ?? t('world'));
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);

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

  // Skip the redundant mount-time send: local options are initialised FROM the
  // server's values, so re-broadcasting them when the lobby first renders is a
  // wasted round-trip whose echo can flicker the settings preview. Only send on
  // actual host edits after that.
  const optionsSyncedRef = useRef(false);
  useEffect(() => {
    if (!isHost) return;
    if (!optionsSyncedRef.current) {
      optionsSyncedRef.current = true;
      return;
    }
    sendOptions();
  }, [rounds, timePerRound, nmpz, mapSlug, mapName, isHost]);

  const playerCount = players?.length ?? 0;

  const handleStart = () => {
    if (!players || players.length < 2) {
      Alert.alert(t('needPlayersTitle', undefined, 'Need Players'), t('needMorePlayers'));
      return;
    }
    haptics.medium(); // match start — let the host feel the kickoff
    wsService.send({ type: 'startGameHost' });
  };

  const handleShareCode = async () => {
    if (!gameCode) return;
    haptics.light();
    Animated.sequence([
      Animated.timing(copyIconScale, { toValue: 1.4, duration: 150, useNativeDriver: true }),
      Animated.timing(copyIconScale, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    try {
      await Share.share({
        message: t('shareJoinPartyMessage', { link: getPartyLink(gameCode) }, 'Join my WorldGuessr party: {{link}}'),
        title: t('sharePartyInviteTitle', undefined, 'WorldGuessr Party Invite'),
      });
    } catch {
      // User cancelled the share sheet — no-op.
    }
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
      <View
        style={[
          styles.flex,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        <View style={[styles.header, isLandscape && styles.headerLandscape]}>
          <Pressable
            onPress={() => {
              haptics.light();
              onLeave();
            }}
            style={styles.backBtn}
          >
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
          <Text style={styles.headerTitle}>{isHost ? t('yourPrivateGame') : t('gameLobby', undefined, 'Game Lobby')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={[styles.body, isLandscape && styles.bodyLandscape]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, isLandscape && styles.scrollContentLandscape]}
        >
          {/* Game Code */}
          <View style={[styles.codeSection, isLandscape && styles.codeSectionLandscape]}>
            <Text style={styles.codeLabel}>{t('gameCode')}</Text>
            <Pressable onPress={handleShareCode} style={styles.codeRow}>
              <Text style={styles.codeText}>{gameCode}</Text>
              <Animated.View style={{ transform: [{ scale: copyIconScale }] }}>
                <Ionicons
                  name="share-outline"
                  size={20}
                  color="rgba(255,255,255,0.6)"
                />
              </Animated.View>
            </Pressable>
            <Text style={styles.codeHint}>
              {t('tapToShareInviteLink', undefined, 'Tap to share invite link')}
            </Text>
          </View>

          {/* Players */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('playersCount', { cnt: playerCount }, 'Players ({{cnt}})')}</Text>
            <PlayerList players={players ?? []} myId={myId} mode="lobby" />
          </View>

          {!isHost && (
            <Text style={styles.waitingText}>{t('waitingForHostToStart')}...</Text>
          )}
        </ScrollView>

        {/* Footer: settings preview + buttons. In landscape this is a right-hand
            sidebar; in portrait it sits below the scroll. */}
        <View
          style={[
            styles.footer,
            isLandscape && styles.footerLandscape,
            isLandscape && { width: Math.min(320, Math.max(260, width * 0.4)) },
          ]}
        >
          <View style={styles.settingsPreview}>
            {(() => {
              const dispMap = isHost ? mapName : (serverDisplayLocation ?? t('world'));
              const dispRounds = isHost ? rounds : (serverRounds ?? 5);
              const tSecs = isHost ? timePerRound : ((serverTimePerRound ?? 30000) / 1000);
              const dispTimer = tSecs > 0
                ? t('secondsShort', { secs: tSecs }, '{{secs}}s')
                : t('timerOff', undefined, 'Timer Off');
              const dispNmpz = (isHost ? nmpz : serverNm) ? 'NMPZ' : null;
              return (
                <Text style={styles.settingsPreviewText}>
                  {t('lobbySettingsPreview', { map: dispMap, rounds: dispRounds, timer: dispTimer }, '{{map}} · {{rounds}} rounds · {{timer}}')}
                  {dispNmpz ? ` · ${dispNmpz}` : ''}
                </Text>
              );
            })()}
          </View>

          {isHost && (
            <Pressable
              style={({ pressed }) => [styles.optionsBtn, pressed && { opacity: 0.85 }]}
              onPress={() => {
                haptics.light();
                setMapModalVisible(true);
              }}
            >
              <Ionicons name="settings-outline" size={18} color={colors.white} />
              <Text style={styles.optionsBtnText}>{t('editOptions')}</Text>
            </Pressable>
          )}

          {isHost && (
            <Pressable
              style={({ pressed }) => [styles.optionsBtn, pressed && { opacity: 0.85 }]}
              onPress={() => {
                haptics.light();
                setInviteModalVisible(true);
              }}
            >
              <Ionicons name="people" size={18} color={colors.white} />
              <Text style={styles.optionsBtnText}>{t('inviteFriends', undefined, 'Invite Friends')}</Text>
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
                {playerCount < 2
                  ? t('waitingForPlayersShort', undefined, 'Waiting for players...')
                  : t('startGame')}
              </Text>
            </Pressable>
          )}
        </View>
        </View>
      </View>

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
  headerLandscape: { paddingVertical: spacing.xs },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: colors.white, fontSize: fontSizes.lg, fontFamily: 'Lexend-Bold' },
  // Body wraps the scroll + footer. Column in portrait (footer below), row in
  // landscape (footer becomes a right-hand sidebar).
  body: { flex: 1 },
  bodyLandscape: { flexDirection: 'row' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, gap: spacing.xl },
  scrollContentLandscape: { paddingRight: spacing.md, gap: spacing.md },
  codeSection: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: spacing.xl,
  },
  codeSectionLandscape: { padding: spacing.md },
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
  // Landscape: fixed-width right sidebar holding the settings preview + actions,
  // vertically centered so the Start button stays on-screen on short viewports.
  footerLandscape: {
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255, 255, 255, 0.1)',
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
