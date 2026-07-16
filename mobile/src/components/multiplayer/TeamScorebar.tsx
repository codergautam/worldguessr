/**
 * Cumulative team-score banner for intra-party team games (teamGame,
 * NOT team2v2 — those get the shared HP bars in DuelHUD instead).
 * Port of web components/teamScorebar.js: fixed top-center, stable identity
 * labels (Team 1 left / Team 2 right, matching the lobby columns — never the
 * duel Your/Enemy framing), crown on the leader (nobody on ties, incl. 0-0),
 * animated totals. DELIBERATE web deviation (ruling): web's slide-up "+Δ"
 * round-gain tag is NOT ported — popping in/out read as noise on the small
 * screen; the reveal banner already carries the round verdict. Don't re-add
 * it in a parity sweep.
 */

import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, t } from '../../shared';
import { fontSizes, spacing } from '../../styles/theme';
import type { GameData } from '../../store/multiplayerStore';
import getMyTeam from '../../shared/game/getMyTeam';
import useAnimatedNumber from '../../hooks/useAnimatedNumber';

function TeamSide({
  score,
  label,
  isMine,
  hasCrown,
}: {
  score: number;
  label: string;
  isMine: boolean;
  hasCrown: boolean;
}) {
  const { displayed } = useAnimatedNumber(score, { resetWhenLower: false });

  return (
    <View style={[styles.side, isMine && styles.sideMine]}>
      <View style={styles.labelRow}>
        {hasCrown && <Ionicons name="trophy" size={11} color="#ffd700" />}
        <Text style={styles.label} numberOfLines={1}>
          {label}
          {isMine ? ` (${t('you')})` : ''}
        </Text>
      </View>
      <Text style={styles.score}>{displayed.toLocaleString()}</Text>
    </View>
  );
}

export default function TeamScorebar({ gameData }: { gameData: GameData }) {
  const scores = gameData.teamScores ?? { a: 0, b: 0 };
  const myTeam = getMyTeam(gameData.players, gameData.myId);
  // Crown the current leader; nobody on a tie (incl. the 0-0 start).
  const leadingTeam =
    (scores.a ?? 0) === (scores.b ?? 0) ? null : (scores.a ?? 0) > (scores.b ?? 0) ? 'a' : 'b';

  return (
    <View style={styles.bar} pointerEvents="none">
      <TeamSide
        score={scores.a ?? 0}
        label={t('team1')}
        isMine={myTeam === 'a'}
        hasCrown={leadingTeam === 'a'}
      />
      <View style={styles.divider} />
      <TeamSide
        score={scores.b ?? 0}
        label={t('team2')}
        isMine={myTeam === 'b'}
        hasCrown={leadingTeam === 'b'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.md,
    paddingVertical: 6,
    paddingHorizontal: spacing.lg,
    borderRadius: 14,
    backgroundColor: 'rgba(10,12,14,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  side: {
    alignItems: 'center',
    minWidth: 74,
    opacity: 0.82,
  },
  sideMine: {
    opacity: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
  },
  score: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-Bold',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
