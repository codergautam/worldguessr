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
  StyleSheet,
  ScrollView,
  ImageBackground,
  ActivityIndicator,
  Alert,
  Animated,
  InteractionManager,
  Modal,
  Share,
  useWindowDimensions,
} from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { colors, t } from '../../shared';
import { haptics } from '../../services/haptics';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import { wsService } from '../../services/websocket';
import { TEAM_SUPPORT } from '../../services/websocketConfig';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { getPartyLink } from '../../shared/utils/partyLink';
import { runGameInterstitial } from '../../services/ads';
import { useSettingsStore } from '../../store/settingsStore';
import PlayerList from './PlayerList';
import InviteFriendsModal from './InviteFriendsModal';
import MapSelectorModal from '../game/MapSelectorModal';
import VolumeSliders from '../VolumeSliders';

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
  // ── 2v2 staging lobby (web partyLobby.js parity: same server object as a
  // party, only the title and the single primary action differ) ─────────────
  const is2v2Lobby = useMultiplayerStore((s) => !!s.gameData?.is2v2Lobby);
  const lobbyIntent = useMultiplayerStore((s) => s.lobbyIntent);
  const gameQueued = useMultiplayerStore((s) => s.gameQueued);
  const queueStage = useMultiplayerStore((s) => s.queueStage);
  const maxPlayers = useMultiplayerStore((s) => s.gameData?.maxPlayers);
  const autoQueueInMs = useMultiplayerStore((s) => s.gameData?.autoQueueInMs);
  const is2v2 = lobbyIntent === '2v2' || is2v2Lobby;
  // Stage 1 of 2v2 matchmaking lives inside this card: the empty seat turns
  // into the teammate-search indicator and Find Match becomes Cancel.
  const teammateSearch = gameQueued === '2v2' && queueStage === 'teammate';

  // ── Intra-party team mode (web partyLobby.js). All team UI is gated !is2v2
  // so the 2v2 staging lobby stays pixel-identical to before.
  // TEAM_SUPPORT gate: this is a TEAM surface, so it rides the rollout switch
  // — the server's setTeamConfig handler trusts the sender's client to hide
  // the control (its rollout logic assumes "the host always has teamSupport"),
  // so a flag-off build showing it could flip a party to teams and get every
  // flagless member KICKED, the host included on their next reconnect. ──────
  const serverTeamGame = useMultiplayerStore((s) => !!s.gameData?.teamGame);
  const teamScoring = useMultiplayerStore((s) => s.gameData?.teamScoring ?? 'closest');
  const allowTeamPick = useMultiplayerStore((s) => !!s.gameData?.allowTeamPick);
  const teamGame = TEAM_SUPPORT && !is2v2 && serverTeamGame;

  // "Queueing in 3…" — the server stamps the lobby state with the remaining
  // ms before it auto-queues (post-pairing preview / pregame-cancel regroup).
  const [queueCountdown, setQueueCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (autoQueueInMs == null) {
      setQueueCountdown(null);
      return;
    }
    const deadline = Date.now() + autoQueueInMs;
    // Clamp to 1: the handoff to the queue screen replaces "0".
    const tick = () => {
      const left = deadline - Date.now();
      // The server drives the handoff; 3s past the deadline the stamp is dead
      // (dropped transition / stale state) — free the button instead of
      // painting a disabled "Queueing in 1…" forever. Find Match re-queues
      // idempotently, so re-pressing is a safe recovery.
      if (left < -3000) {
        setQueueCountdown(null);
        return;
      }
      setQueueCountdown(Math.max(1, Math.ceil(left / 1000)));
    };
    tick();
    const iv = setInterval(tick, 200);
    return () => clearInterval(iv);
  }, [autoQueueInMs]);

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
  // Streamer mode: mask the join code on screen while keeping it shareable.
  const [codeHidden, setCodeHidden] = useState(false);
  // Party-lobby sound modal (web soundModal.js): the pre-game breather is
  // where players actually adjust volumes. Auto-close is structural here —
  // the modal unmounts with the lobby the moment the game starts. Speaker
  // glyph flips to muted when BOTH volumes sit at 0, live mid-drag (volumes
  // live in the zustand store, so the reactivity is free — none of web's
  // subscribeVolumes machinery ports).
  const [soundModalVisible, setSoundModalVisible] = useState(false);
  const bothMuted = useSettingsStore((s) => s.musicVolume <= 0 && s.sfxVolume <= 0);

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
  // 2v2 staging caps at 2 seats; open parties effectively never fill. Full →
  // the invite button greys out (the friends modal + server re-check too, so
  // all layers agree — web partyLobby.js `partyFull`).
  const seatCount = maxPlayers ?? (is2v2 ? 2 : Infinity);
  const partyFull = playerCount >= seatCount;

  // Team columns. The unassigned strip should be empty by server invariant —
  // render it defensively anyway so no payload ordering can ever drop a
  // player from the roster (rule carried to the results grouping too).
  const roster = players ?? [];
  const teamA = teamGame ? roster.filter((p) => p.team === 'a') : [];
  const teamB = teamGame ? roster.filter((p) => p.team === 'b') : [];
  const unassigned = teamGame ? roster.filter((p) => p.team !== 'a' && p.team !== 'b') : [];
  const teamBlocked = teamGame && (teamA.length === 0 || teamB.length === 0);
  const canMove = (p: { id: string }) => !!(isHost || (allowTeamPick && p.id === myId));

  // Pulse the row that just switched columns (optimistic move or broadcast) —
  // web partyLobby.js movedIds. The clear-timer lives in a REF, decoupled
  // from the effect cleanup: any fingerprint change inside the 450ms window
  // (another player moving, a roster broadcast) re-runs the effect, and an
  // effect-owned timer would be cancelled by the cleanup — leaving the pulse
  // highlight stuck on until the next move.
  const [movedIds, setMovedIds] = useState<Set<string>>(() => new Set());
  const prevTeamsRef = useRef<Record<string, string | undefined>>({});
  const movedClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teamFingerprint = roster.map((p) => `${p.id}:${p.team ?? ''}`).join(',');
  useEffect(() => {
    const cur: Record<string, string | undefined> = {};
    for (const p of roster) cur[p.id] = p.team;
    const moved = Object.keys(cur).filter(
      (id) => prevTeamsRef.current[id] && cur[id] && prevTeamsRef.current[id] !== cur[id],
    );
    prevTeamsRef.current = cur;
    if (moved.length) {
      setMovedIds(new Set(moved));
      if (movedClearTimerRef.current) clearTimeout(movedClearTimerRef.current);
      movedClearTimerRef.current = setTimeout(() => {
        movedClearTimerRef.current = null;
        setMovedIds(new Set());
      }, 450);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamFingerprint]);
  useEffect(
    () => () => {
      if (movedClearTimerRef.current) clearTimeout(movedClearTimerRef.current);
    },
    [],
  );

  // Per-row lobby controls: team-move chevron(s) + host kick. Rendered into
  // PlayerList's rowAccessory slot so the shared row shell stays team-blind.
  const rowAccessory = (p: (typeof roster)[number], opts?: { unassigned?: boolean }) => {
    const showKick = !!isHost && !is2v2 && p.id !== myId;
    const showMove = teamGame && canMove(p);
    if (!showKick && !showMove) return null;
    return (
      <View style={styles.rowControls}>
        {showMove && opts?.unassigned && (
          <>
            <Pressable hitSlop={6} style={styles.moveBtn} onPress={() => useMultiplayerStore.getState().setPlayerTeam(p.id, 'a')}>
              <Ionicons name="chevron-back" size={16} color="rgba(255,255,255,0.8)" />
            </Pressable>
            <Pressable hitSlop={6} style={styles.moveBtn} onPress={() => useMultiplayerStore.getState().setPlayerTeam(p.id, 'b')}>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </>
        )}
        {showMove && !opts?.unassigned && (p.team === 'a' || p.team === 'b') && (
          <Pressable
            hitSlop={6}
            style={styles.moveBtn}
            onPress={() => useMultiplayerStore.getState().setPlayerTeam(p.id, p.team === 'a' ? 'b' : 'a')}
          >
            <Ionicons name={p.team === 'a' ? 'chevron-forward' : 'chevron-back'} size={16} color="rgba(255,255,255,0.8)" />
          </Pressable>
        )}
        {showKick && (
          <Pressable
            hitSlop={6}
            style={styles.kickBtn}
            onPress={() => {
              haptics.light();
              Alert.alert(t('kickPlayer'), t('kickConfirm', { name: p.username }), [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('kickPlayer'),
                  style: 'destructive',
                  onPress: () => useMultiplayerStore.getState().kickPlayer(p.id),
                },
              ]);
            }}
          >
            <Ionicons name="close" size={16} color="#ff6b6b" />
          </Pressable>
        )}
      </View>
    );
  };

  const handleStart = () => {
    if (!players || players.length < 2) {
      Alert.alert(t('needPlayersTitle', undefined, 'Need Players'), t('needMorePlayers'));
      return;
    }
    if (teamBlocked) {
      Alert.alert(t('teams'), t('teamNeedsPlayers'));
      return;
    }
    haptics.medium(); // match start — let the host feel the kickoff (click rides SfxPressable)
    wsService.send({ type: 'startGameHost' });
  };

  // Find Match: host queues the 2v2 staging lobby (solo or duo). The ad runs
  // BEFORE the queue entry, exactly like the 1v1 queue joins in home.tsx — the
  // server matches on its own clock, so queueing behind a covering ad could
  // start the round unseen. (Web has no ad here; deliberate mobile pattern.)
  const handleFindMatch = async () => {
    haptics.medium(); // click rides SfxPressable

    await runGameInterstitial('2v2');
    useMultiplayerStore.getState().find2v2Match();
  };

  const handleCancelSearch = () => {
    haptics.light(); // click rides SfxPressable

    useMultiplayerStore.getState().cancelTeammateSearch();
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
          <Text style={styles.headerTitle}>
            {is2v2
              ? t('twovtwoTeamLobby')
              : isHost
                ? t('yourPrivateGame')
                : t('gameLobby', undefined, 'Game Lobby')}
          </Text>
          {/* Sound settings — the header slot mirrors web's navbar speaker
              (private waiting lobbies only, guests included). */}
          <Pressable
            onPress={() => {
              haptics.light(); // click rides SfxPressable
              setSoundModalVisible(true);
            }}
            style={styles.backBtn}
            accessibilityLabel={t('audioSettings')}
          >
            <Ionicons
              name={bothMuted ? 'volume-mute-outline' : 'volume-high-outline'}
              size={22}
              color={colors.white}
            />
          </Pressable>
        </View>

        {/* Rescue link (web partyLobby.js subtitle slot): players holding a
            friend's code keep tapping 2v2 and landing here instead of the
            join screen. Web parity: leave the staging lobby on the way out so
            it can't linger as a ghost (home.js joinPrivateGame no-code path);
            replace keeps the stack canonical ([tabs, join]). */}
        {is2v2 && !teammateSearch && playerCount < 2 && (
          <Pressable
            onPress={() => {
              haptics.light();
              // Navigate FIRST, tear down AFTER the transition. leaveGame
              // flips inGame false, and the game screen's ownerless-teardown
              // guard ([id].tsx: dismissAllSafe on !inGame while focused)
              // fires on that flip BEFORE the replace settles — stomping the
              // join screen with home. Deferring the leave until the game
              // screen is unmounted makes the flip invisible to the guard.
              router.replace('/party/join');
              InteractionManager.runAfterInteractions(() => {
                useMultiplayerStore.getState().leaveGame();
              });
            }}
            style={({ pressed }) => [styles.joinLink, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.joinLinkText}>{t('twovtwoHaveCode')}</Text>
          </Pressable>
        )}

        <View style={[styles.body, isLandscape && styles.bodyLandscape]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, isLandscape && styles.scrollContentLandscape]}
        >
          {/* Game Code */}
          <View style={[styles.codeSection, isLandscape && styles.codeSectionLandscape]}>
            <View style={styles.codeLabelRow}>
              <Text style={styles.codeLabel}>{t('gameCode')}</Text>
              {/* Streamer mode: mask the code on screen while keeping it
                  shareable (web partyLobby.js eye toggle). */}
              <Pressable
                hitSlop={8}
                onPress={() => {
                  haptics.light();
                  setCodeHidden((v) => !v);
                }}
                accessibilityLabel={t(codeHidden ? 'showCode' : 'hideCode')}
              >
                <Ionicons
                  name={codeHidden ? 'eye-off-outline' : 'eye-outline'}
                  size={16}
                  color="rgba(255,255,255,0.5)"
                />
              </Pressable>
            </View>
            <Pressable onPress={handleShareCode} style={styles.codeRow}>
              <Text style={styles.codeText}>{codeHidden ? '••••••' : gameCode}</Text>
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

          {/* Players / Teams */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>
                {teamGame
                  ? t('teams')
                  : is2v2
                    ? t('playersCount', { cnt: `${playerCount}/${seatCount}` }, 'Players ({{cnt}})')
                    : t('playersCount', { cnt: playerCount }, 'Players ({{cnt}})')}
              </Text>
              {teamGame && isHost && (
                <Pressable
                  style={({ pressed }) => [
                    styles.shuffleBtn,
                    pressed && { opacity: 0.7 },
                    playerCount < 2 && { opacity: 0.4 },
                  ]}
                  disabled={playerCount < 2}
                  onPress={() => {
                    haptics.light();
                    useMultiplayerStore.getState().shuffleTeams();
                  }}
                >
                  <Ionicons name="shuffle" size={14} color={colors.white} />
                  <Text style={styles.shuffleBtnText}>{t('shuffleTeams')}</Text>
                </Pressable>
              )}
              {teamGame && (
                <Text style={styles.teamCount}>{`${teamA.length}v${teamB.length}`}</Text>
              )}
            </View>

            {teamGame ? (
              <>
                <View style={styles.teamColumns}>
                  {([['a', teamA], ['b', teamB]] as const).map(([teamKey, teamPlayers]) => (
                    <View
                      key={teamKey}
                      style={[
                        styles.teamColumn,
                        roster.find((p) => p.id === myId)?.team === teamKey && styles.teamColumnMine,
                      ]}
                    >
                      <View style={styles.teamColumnHead}>
                        <Text style={styles.teamColumnName}>
                          {t(teamKey === 'a' ? 'team1' : 'team2')}
                        </Text>
                        <Text style={styles.teamColumnCount}>{teamPlayers.length}</Text>
                      </View>
                      <PlayerList
                        players={teamPlayers}
                        myId={myId}
                        mode="lobby"
                        showLobbyElo
                        highlightIds={movedIds}
                        rowAccessory={(p) => rowAccessory(p)}
                      />
                      {teamPlayers.length === 0 && (
                        <Text style={styles.teamEmptyText}>
                          {isHost ? t('teamNeedsPlayer') : t('noPlayersYet')}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
                {unassigned.length > 0 && (
                  <PlayerList
                    players={unassigned}
                    myId={myId}
                    mode="lobby"
                    showLobbyElo
                    highlightIds={movedIds}
                    rowAccessory={(p) => rowAccessory(p, { unassigned: true })}
                  />
                )}
                {!isHost && allowTeamPick && (
                  <Text style={styles.teamHintText}>{t('youCanSwitchTeams')}</Text>
                )}
              </>
            ) : (
              <>
                <PlayerList
                  players={roster}
                  myId={myId}
                  mode="lobby"
                  showLobbyElo
                  rowAccessory={(p) => rowAccessory(p)}
                />
                {/* The 2v2 staging lobby shows its one empty seat explicitly —
                    idle it waits for a teammate, mid-search it spins (web
                    partyLobby.js empty-seat row). */}
                {is2v2 && playerCount < 2 && (
                  <View style={styles.emptySeat}>
                    {teammateSearch && <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />}
                    <Text style={styles.emptySeatText}>
                      {teammateSearch ? t('findingTeammate') : t('waitingForTeammate')}...
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          {!isHost && !is2v2 && (
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
          {/* Settings preview + editing — hidden entirely for 2v2: matchmade
              games use fixed standard settings, so options here would be
              editable lies (web partyLobby.js hides the whole section). */}
          {!is2v2 && (
            <View style={styles.settingsPreview}>
              {(() => {
                const dispMap = isHost ? mapName : (serverDisplayLocation ?? t('world'));
                const dispRounds = isHost ? rounds : (serverRounds ?? 5);
                const tSecs = isHost ? timePerRound : ((serverTimePerRound ?? 30000) / 1000);
                const dispTimer = tSecs > 0
                  ? t('secondsShort', { secs: tSecs }, '{{secs}}s')
                  : t('timerOff', undefined, 'Timer Off');
                const dispNmpz = (isHost ? nmpz : serverNm) ? 'NMPZ' : null;
                // Mode chip copy (web partyLobby.js): Team Duel shows its
                // scoring flavor; Classic stays implicit (no chip noise).
                const dispMode = teamGame
                  ? `${t('teamDuel')} · ${t(teamScoring === 'average' ? 'scoringAverage' : 'scoringClosest')} · `
                  : '';
                return (
                  <Text style={styles.settingsPreviewText}>
                    {dispMode}
                    {t('lobbySettingsPreview', { map: dispMap, rounds: dispRounds, timer: dispTimer }, '{{map}} · {{rounds}} rounds · {{timer}}')}
                    {dispNmpz ? ` · ${dispNmpz}` : ''}
                  </Text>
                );
              })()}
            </View>
          )}

          {isHost && !is2v2 && (
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
              style={({ pressed }) => [
                styles.optionsBtn,
                pressed && { opacity: 0.85 },
                (partyFull || teammateSearch) && styles.optionsBtnDisabled,
              ]}
              onPress={() => {
                haptics.light();
                setInviteModalVisible(true);
              }}
              // Disabled while full, and during stage-1 teammate matchmaking:
              // the matcher can claim the one empty seat at any moment, so an
              // invite accepted mid-search would race the random pairing for
              // it. Cancel the search first to invite a friend instead.
              disabled={partyFull || teammateSearch}
            >
              <Ionicons name="people" size={18} color={colors.white} />
              <Text style={styles.optionsBtnText}>{t('inviteFriends', undefined, 'Invite Friends')}</Text>
            </Pressable>
          )}

          {/* 2v2 primary action: Find Match (host, idle) / Cancel (searching).
              One button + at most one status line, web footer parity. */}
          {isHost && is2v2 && !teammateSearch && (
            <Pressable
              style={({ pressed }) => [
                styles.startBtn,
                queueCountdown != null && styles.startBtnDisabled,
                pressed && queueCountdown == null && { opacity: 0.85 },
              ]}
              onPress={handleFindMatch}
              disabled={queueCountdown != null}
            >
              <Text style={styles.startBtnText}>
                {queueCountdown != null
                  ? `${t('queueingIn', { s: queueCountdown })}…`
                  : t('findMatch')}
              </Text>
            </Pressable>
          )}

          {is2v2 && teammateSearch && (
            <Pressable
              style={({ pressed }) => [styles.optionsBtn, pressed && { opacity: 0.85 }]}
              onPress={handleCancelSearch}
            >
              <Text style={styles.optionsBtnText}>{t('cancel')}</Text>
            </Pressable>
          )}

          {/* 2v2 status line (priority mirrors web): non-host countdown →
              solo hint. Parties keep their existing body status text. */}
          {is2v2 && (() => {
            let status: string | null = null;
            if (queueCountdown != null && !isHost) status = `${t('queueingIn', { s: queueCountdown })}…`;
            else if (!isHost) status = `${t('waitingForHostToStart')}...`;
            else if (playerCount < 2 && !teammateSearch) status = t('twovtwoSoloHint');
            return status ? <Text style={styles.waitingText}>{status}</Text> : null;
          })()}

          {isHost && !is2v2 && (
            <Pressable
              style={({ pressed }) => [
                styles.startBtn,
                (playerCount < 2 || teamBlocked) && styles.startBtnDisabled,
                pressed && playerCount >= 2 && !teamBlocked && { opacity: 0.85 },
              ]}
              onPress={handleStart}
              disabled={playerCount < 2 || teamBlocked}
            >
              <Text style={styles.startBtnText}>
                {playerCount < 2
                  ? t('waitingForPlayersShort', undefined, 'Waiting for players...')
                  : teamBlocked
                    ? t('teamNeedsPlayers')
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

      {/* Sound modal — ONLY the two shared slider rows (web soundModal.js:
          a true centered modal, deliberately not the full settings page). */}
      <Modal
        visible={soundModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSoundModalVisible(false)}
        supportedOrientations={['portrait', 'landscape']}
      >
        <Pressable sfx="none" style={styles.soundModalOverlay} onPress={() => setSoundModalVisible(false)}>
          {/* Inner pressable swallows taps so touching a slider can't close. */}
          <Pressable sfx="none" style={styles.soundModalCard} onPress={() => {}}>
            <View style={styles.soundModalHeader}>
              <Text style={styles.soundModalTitle}>{t('audioSettings')}</Text>
              <Pressable
                hitSlop={8}
                onPress={() => setSoundModalVisible(false)}
                accessibilityLabel={t('cancel')}
              >
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>
            <VolumeSliders />
          </Pressable>
        </Pressable>
      </Modal>

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
        // Team surface — MUST ride the rollout switch (see the teamGame gate
        // above): undefined props hide the whole Game Mode section.
        teamConfig={TEAM_SUPPORT ? { enabled: serverTeamGame, scoring: teamScoring, allowTeamPick } : undefined}
        onTeamConfigChange={TEAM_SUPPORT ? (c) => {
          // Team-duel timer default (web partyModal.js nuance, mirrored
          // exactly): switching TO Team Duel bumps only the untouched 30s
          // classic default to 60s (teams need coordination time); switching
          // back reverts only an untouched 60s. A disabled timer (0) and any
          // hand-picked value are left alone.
          const wasEnabled = serverTeamGame;
          if (c.enabled && !wasEnabled && timePerRound === 30) setTimePerRound(60);
          if (!c.enabled && wasEnabled && timePerRound === 60) setTimePerRound(30);
          useMultiplayerStore.getState().setTeamConfig({
            enabled: c.enabled,
            scoring: c.scoring,
            allowTeamPick: c.allowTeamPick,
          });
        } : undefined}
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
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionTitle: { color: colors.white, fontSize: fontSizes.md, fontFamily: 'Lexend-Bold', flex: 1 },
  codeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  // ── Team-mode roster (web party-lobby__teams) ──────────────────────────
  shuffleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  shuffleBtnText: { color: colors.white, fontSize: fontSizes.xs, fontFamily: 'Lexend-SemiBold' },
  teamCount: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Bold',
  },
  teamColumns: { flexDirection: 'row', gap: spacing.sm },
  teamColumn: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  teamColumnMine: { borderColor: 'rgba(74, 222, 128, 0.45)' },
  teamColumnHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginBottom: 2,
  },
  teamColumnName: { color: colors.white, fontSize: fontSizes.sm, fontFamily: 'Lexend-Bold' },
  teamColumnCount: { color: 'rgba(255,255,255,0.5)', fontSize: fontSizes.xs, fontFamily: 'Lexend-Bold' },
  teamEmptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  teamHintText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    textAlign: 'center',
  },
  // Per-row controls in PlayerList's accessory slot (move chevrons + kick).
  rowControls: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moveBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  kickBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,107,107,0.12)',
    marginLeft: 4,
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
  waitingText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
    textAlign: 'center',
  },
  // 2v2 rescue link under the header ("Have a game code? Join a party").
  joinLink: { alignSelf: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  joinLinkText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    textDecorationLine: 'underline',
  },
  // The 2v2 staging lobby's single empty seat (idle wait / teammate search).
  emptySeat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  emptySeatText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
  },
  optionsBtnDisabled: { opacity: 0.5 },
  // Sound modal (web soundModal.js shape: centered card, dim overlay).
  soundModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  soundModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#12241a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: spacing.lg,
    gap: spacing.md,
  },
  soundModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  soundModalTitle: { color: colors.white, fontSize: fontSizes.md, fontFamily: 'Lexend-Bold' },
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
