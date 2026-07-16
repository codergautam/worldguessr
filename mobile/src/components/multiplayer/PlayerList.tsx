/**
 * Reusable player list for lobby, between-round, and end-game displays.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, getLeague, t } from '../../shared';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import PlayerName from '../PlayerName';
import type { MPPlayer } from '../../store/multiplayerStore';

interface PlayerListProps {
  players: MPPlayer[];
  myId?: string;
  showScores?: boolean;
  mode?: 'lobby' | 'betweenRounds' | 'endGame';
  roundDeltas?: Record<string, number>;
  /**
   * Lobby-mode slot for per-row controls owned by the parent (kick button,
   * team-move chevrons). Rendered at the row's trailing edge — keeps team
   * semantics out of this shared component.
   */
  rowAccessory?: (player: MPPlayer) => ReactNode;
  /** Rows to briefly highlight (e.g. just switched team columns). */
  highlightIds?: Set<string>;
  /** League-colored "(elo)" after the name (party lobby rows, web parity). */
  showLobbyElo?: boolean;
  /**
   * Party team mode, betweenRounds only (web playerList.js team-first layout):
   * the two TEAM totals are the headline (label, big cumulative score, last
   * round's "+Δ"), individual players demoted to compact per-team columns.
   */
  teamData?: {
    scores: { a: number; b: number };
    /** Last round's per-team gain (gameData.teamRoundScores.scores). */
    roundScores?: { a: number | null; b: number | null } | null;
    myTeam: 'a' | 'b' | null;
  } | null;
}

/**
 * Absolute-fill overlay playing the web `party-team-move-pulse` keyframe
 * (globals.scss): ramp to a primary-tinted peak at ~35% of 0.45s, ease back
 * down. Fires on the rising edge of `active` — and on mount-already-active,
 * which is exactly the remount a row makes when it switches team columns.
 * Always mounted so the parent clearing its trigger flag mid-pulse can't
 * hard-cut the fade tail (the old static style swap flashed on AND off).
 */
function MovedPulse({ active }: { active: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const wasActive = useRef(false);
  useEffect(() => {
    if (active && !wasActive.current) {
      opacity.setValue(0);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 290, useNativeDriver: true }),
      ]).start();
    }
    wasActive.current = active;
  }, [active, opacity]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, styles.movedPulse, { opacity }]}
    />
  );
}

export default function PlayerList({
  players,
  myId,
  showScores = false,
  mode = 'lobby',
  roundDeltas,
  rowAccessory,
  highlightIds,
  showLobbyElo = false,
  teamData = null,
}: PlayerListProps) {
  const sortedPlayers = mode === 'lobby'
    ? players
    : [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const dense = mode === 'betweenRounds';
  const shouldShowScores = showScores || mode !== 'lobby';

  // Web parity (playerList.js): the in-round / end-game leaderboard shows only
  // the top 5, then a "…" separator, then the current player's own row when
  // they rank below the cutoff. The lobby keeps showing everyone.
  const rowLimit = mode === 'lobby' ? sortedPlayers.length : 5;
  const myIndex = sortedPlayers.findIndex((player) => player.id === myId);
  const showSelfRow = myIndex >= rowLimit;

  const renderRow = (player: MPPlayer, index: number) => {
    const roundDelta = roundDeltas?.[player.id] ?? 0;

    return (
      <View
        key={player.id}
        style={[
          styles.playerRow,
          dense && styles.playerRowDense,
          dense && styles.playerRowBetween,
          player.id === myId && (dense ? styles.playerRowSelfBetween : styles.playerRowSelf),
        ]}
      >
        <MovedPulse active={!!highlightIds?.has(player.id)} />
        <View style={styles.playerLeft}>
          {mode !== 'lobby' && (
            <Text style={[styles.rankText, dense && styles.rankTextBetween]}>{t('rankN', { rank: index + 1 }, '#{{rank}}')}</Text>
          )}
          <PlayerName
            name={player.username}
            countryCode={player.countryCode}
            flagSize={dense ? 16 : 18}
            gap={8}
            textStyle={[
              styles.playerName,
              dense && styles.playerNameDense,
              player.id === myId && styles.playerNameSelf,
              dense && styles.playerNameBetween,
            ]}
          >
            {player.host && (
              <Text style={styles.hostText}>({t('host')})</Text>
            )}
            {player.supporter && (
              <Ionicons name="heart" size={12} color="#ff6b9d" />
            )}
            {/* League-colored "(elo)" like the duel HP bars; guests carry no
                elo so it just skips (web partyLobby.js parity). */}
            {showLobbyElo && typeof player.elo === 'number' && (
              <Text
                style={[
                  styles.lobbyElo,
                  { color: getLeague(player.elo)?.light ?? getLeague(player.elo)?.color ?? '#60a5fa' },
                ]}
              >
                ({player.elo})
              </Text>
            )}
          </PlayerName>
        </View>
        {mode === 'lobby' && rowAccessory?.(player)}
        {shouldShowScores && (
          <View style={styles.playerRight}>
            {/* Web in-round leaderboard shows the total score only — no ELO,
                no per-round delta (those clutter; keep them for end-game). */}
            {!dense && player.elo !== undefined && player.elo > 0 && (
              <Text style={styles.eloText}>{player.elo}</Text>
            )}
            <Text style={[styles.scoreText, dense && styles.scoreTextBetween]}>{(player.score ?? 0).toLocaleString()}</Text>
            {!dense && roundDeltas && (
              <Text
                style={[
                  styles.deltaText,
                  roundDelta > 0 && styles.deltaTextPositive,
                ]}
              >
                +{roundDelta.toLocaleString()}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  // ── Team-party between-rounds layout (web playerList.js teamGame branch) ──
  // Two big team totals as the headline, then two per-team member columns of
  // compact score pills. Column cap = rowLimit (5, web N), self always kept
  // visible, "+N" overflow. Teamless strays (shouldn't happen) fall back to
  // plain global rows so nobody is ever dropped.
  if (mode === 'betweenRounds' && teamData) {
    const { scores, roundScores, myTeam } = teamData;
    const leadingTeam =
      (scores.a ?? 0) === (scores.b ?? 0) ? null : (scores.a ?? 0) > (scores.b ?? 0) ? 'a' : 'b';

    const renderHeroSide = (teamKey: 'a' | 'b') => {
      const mine = myTeam === teamKey;
      const delta = roundScores?.[teamKey];
      return (
        <View style={[styles.teamHeroSide, mine && styles.teamHeroSideMine]}>
          <View style={styles.teamHeroLabelRow}>
            {leadingTeam === teamKey && <Ionicons name="trophy" size={12} color="#ffd700" />}
            <Text style={[styles.teamHeroLabel, mine && styles.teamHeroLabelMine]} numberOfLines={1}>
              {t(teamKey === 'a' ? 'team1' : 'team2')}
              {mine ? ` · ${t('you')}` : ''}
            </Text>
          </View>
          <Text style={styles.teamHeroScore}>{(scores[teamKey] ?? 0).toLocaleString()}</Text>
          {/* typeof-guard: the server stamp can be {a:null,b:null} (truthy-stamp
              trap) — render the delta only for a real number, like web. */}
          {typeof delta === 'number' && (
            <Text style={styles.teamHeroDelta}>+{delta.toLocaleString()}</Text>
          )}
        </View>
      );
    };

    const renderMemberColumn = (teamKey: 'a' | 'b') => {
      const members = sortedPlayers.filter((p) => p.team === teamKey);
      const shown = members.slice(0, rowLimit);
      const meIdx = members.findIndex((p) => p.id === myId);
      if (meIdx >= rowLimit) shown[rowLimit - 1] = members[meIdx];
      const overflow = members.length - shown.length;
      return (
        <View style={styles.memberColumn}>
          {shown.map((p) => (
            <View key={p.id} style={[styles.memberPill, p.id === myId && styles.memberPillSelf]}>
              <PlayerName
                name={p.username}
                countryCode={p.countryCode}
                flagSize={13}
                gap={6}
                style={styles.memberNameWrap}
                textStyle={styles.memberName}
              />
              <Text style={styles.memberScore}>{(p.score ?? 0).toLocaleString()}</Text>
            </View>
          ))}
          {overflow > 0 && <Text style={styles.memberMore}>+{overflow}</Text>}
        </View>
      );
    };

    const strays = sortedPlayers.filter((p) => p.team !== 'a' && p.team !== 'b');
    return (
      <View style={styles.containerTeam}>
        <View style={styles.teamHero}>
          {renderHeroSide('a')}
          <Text style={styles.teamHeroDash}>—</Text>
          {renderHeroSide('b')}
        </View>
        <View style={styles.teamMembers}>
          {renderMemberColumn('a')}
          {renderMemberColumn('b')}
        </View>
        {strays.map((player, index) => renderRow(player, index))}
      </View>
    );
  }

  return (
    <View style={[styles.container, dense && styles.containerDense]}>
      {sortedPlayers.slice(0, rowLimit).map((player, index) => renderRow(player, index))}
      {showSelfRow && (
        <>
          <Text style={[styles.separator, dense && styles.separatorBetween]}>…</Text>
          {renderRow(sortedPlayers[myIndex], myIndex)}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  containerDense: {
    gap: 3,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  playerRowDense: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  playerRowSelf: {
    backgroundColor: 'rgba(36, 87, 52, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.65)',
  },
  // Peak of the team-move pulse — precomputed color-mix(in srgb, primary 45%,
  // rgba(255,255,255,0.14)) from the web keyframe; MovedPulse eases it in/out.
  movedPulse: {
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(68, 112, 82, 0.53)',
  },
  // Between-rounds leaderboard — white cards w/ dark text (matches web).
  playerRowBetween: {
    backgroundColor: '#ffffff',
    paddingVertical: spacing.sm,
    ...{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 3,
    },
  },
  playerRowSelfBetween: {
    backgroundColor: '#d4edda',
    borderLeftWidth: 4,
    borderLeftColor: '#28a745',
  },
  playerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
    // The inline badges after the name (elo, host tag, heart) don't shrink;
    // once the name has ellipsized to nothing they overflow this container,
    // and RN doesn't clip by default — without this they paint straight under
    // the kick/move buttons on narrow rows.
    overflow: 'hidden',
  },
  rankText: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-Bold',
    width: 28,
  },
  rankTextBetween: { color: 'rgba(0, 0, 0, 0.45)' },
  playerName: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-SemiBold',
    flexShrink: 1,
  },
  playerNameDense: {
    fontSize: fontSizes.sm,
  },
  playerNameSelf: {
    color: colors.white,
  },
  playerNameBetween: { color: '#15202b' },
  hostText: {
    color: '#dc3545',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    marginLeft: 2,
  },
  lobbyElo: {
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    marginLeft: 2,
  },
  playerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eloText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
  },
  scoreText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Bold',
    minWidth: 46,
    textAlign: 'right',
  },
  scoreTextBetween: { color: '#15202b' },
  deltaText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-Bold',
    minWidth: 38,
    textAlign: 'right',
  },
  deltaTextPositive: {
    color: colors.success,
  },
  // ── Team-party between-rounds layout (web .multiplayerLeaderboard__teamHero*
  //    and __member* — same colors/weights, RN units) ──
  containerTeam: {
    gap: spacing.sm,
  },
  teamHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginBottom: 2,
  },
  // Same "mine = full brightness, theirs = dimmed" language as the in-round
  // scorebar. minWidth floors a fresh 0-0 so the sides don't huddle the dash.
  teamHeroSide: {
    alignItems: 'center',
    minWidth: 110,
    opacity: 0.75,
  },
  teamHeroSideMine: {
    opacity: 1,
  },
  teamHeroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  teamHeroLabel: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-Bold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  teamHeroLabelMine: {
    color: colors.white,
  },
  teamHeroScore: {
    color: colors.white,
    fontSize: 32,
    lineHeight: 38,
    fontFamily: 'Lexend-Bold',
    fontVariant: ['tabular-nums'],
  },
  teamHeroDelta: {
    color: colors.success,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Bold',
    fontVariant: ['tabular-nums'],
  },
  teamHeroDash: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 26,
    fontFamily: 'Lexend-Bold',
  },
  // Two per-team columns; flex:1 + minWidth:0 so a narrow portrait splits the
  // width evenly and long names ellipsize instead of squishing the score out.
  teamMembers: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  memberColumn: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  memberPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: borderRadius.md,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  memberPillSelf: {
    backgroundColor: '#d4edda',
    borderLeftWidth: 4,
    borderLeftColor: '#28a745',
  },
  memberNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    color: '#15202b',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
    flexShrink: 1,
  },
  memberScore: {
    color: '#15202b',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Bold',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  memberMore: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
  },
  // "…" between the top-5 cards and the current player's own row.
  separator: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
    lineHeight: fontSizes.lg,
    paddingVertical: 2,
  },
  separatorBetween: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
});
