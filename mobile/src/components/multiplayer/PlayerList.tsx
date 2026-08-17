/**
 * Reusable player list for lobby, between-round, and end-game displays.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, getLeague, t } from '../../shared';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import PlayerName from '../PlayerName';
import { GLOW_CLIP_RELIEF } from '../../shared/glowKeyframes';
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
  // The ROWS are unbounded in the lobby, the ANIMATED halos are not: each
  // animated glow renders up to 8 absolutely-positioned shadow-text layers
  // with per-frame animated styles, so a big lobby was 8xN live shadow
  // composites. Rows past the cutoff DOWNGRADE to glowMotion="static" (one
  // plain shadow layer — the same budget lever MapTile and GameChat already
  // use) instead of losing the paid cosmetic; the player's own row is always
  // exempt so nobody watches their own purchase disappear.
  const GLOW_ROW_CUTOFF = 8;
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
        <View
          style={[
            styles.playerLeft,
            mode === 'lobby' && styles.playerLeftLobbyGlowRoom,
          ]}
        >
          {mode !== 'lobby' && (
            <Text style={[styles.rankText, dense && styles.rankTextBetween]}>{t('rankN', { rank: index + 1 })}</Text>
          )}
          <PlayerName
            name={player.username}
            countryCode={player.countryCode}
            flagSize={dense ? 16 : 18}
            gap={8}
            glow={player.nameGlow}
            glowMotion={mode === 'lobby' && index >= GLOW_ROW_CUTOFF && player.id !== myId ? 'static' : undefined}
            // LIGHT-SURFACE SWITCH. `dense` (= betweenRounds) rows are WHITE
            // cards with near-black text (playerRowBetween / playerNameBetween);
            // a dark-surface glow is invisible on them and the light one reads
            // as a smudge on the dark lobby rows. This flag is what keeps both
            // legible — do not drop it when refactoring the row.
            onLight={dense}
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
                glow={p.nameGlow}
                // memberPill is also a white card (see styles.memberPill).
                onLight
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
    // ...but this box is exactly one line tall, so that same clip was shearing
    // an equipped name glow flush with the letterforms — every colour reading as
    // the same smudge. Padding buys paint area (RN clips at the padding box
    // too); the equal negative margin hands it straight back to Yoga, so the
    // row's height is unchanged.
    //
    // THE NUMBER IS NOW GLOW_CLIP_RELIEF, NOT A LOCAL 12. It was sized against
    // PlayerName's 8px static textShadowRadius, and the animated tier
    // (src/shared/glowKeyframes.ts) reaches 22-25px — so on the day the rig
    // shipped, a hardcoded 12 would have gone straight back to shearing the
    // three most expensive skus in the shop. The constant is shared with the
    // table it is derived from, so the table cannot outgrow it silently.
    //
    // VERTICAL ONLY, and both reasons matter:
    //  • Horizontally this is a `flex: 1` item, where the give-back depends on
    //    Yoga flooring a flex basis of 0 at padding+border. It does, but the
    //    row's badge positions are not worth staking on that; there is nothing
    //    to gain either, since the rank label sits left of the name in every
    //    mode but lobby.
    //  • The RIGHT edge must not grow at all: it would un-hide the very badges
    //    the `overflow` above exists to hide.
    // The cross axis has no such ambiguity — the height is measured from
    // content, so padding + equal negative margin cancel exactly.
    paddingVertical: GLOW_CLIP_RELIEF,
    marginVertical: -GLOW_CLIP_RELIEF,
  },
  // Lobby rows have no rank label before PlayerName, so the name begins on the
  // exact edge clipped by playerLeft. Move that clip edge outward by the shared
  // halo reach while returning the space to Yoga; the name, badges and trailing
  // controls keep their original positions and widths.
  playerLeftLobbyGlowRoom: {
    paddingLeft: GLOW_CLIP_RELIEF,
    marginLeft: -GLOW_CLIP_RELIEF,
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
