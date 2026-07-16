/**
 * Final team scoreline under the Victory/Defeat verdict — a direct port of
 * web's `.team-final-scoreline` (roundOverScreen.js + globals.scss): each side
 * stacks a small uppercase TEAM label (trophy on the winner) over big bold
 * points, the winning side's points in green, the viewer's side at full
 * brightness, a dimmed em-dash between. Single consumer: the results header in
 * game/results.tsx (caller passes crownTeam null on draws — nobody wears the
 * trophy or the green on a tie). The between-rounds screen uses PlayerList's
 * team-first layout instead (web playerList.js parity).
 */

import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, t } from '../../shared';

interface TeamScorelineProps {
  scores: { a: number; b: number };
  /** Team wearing the trophy + green points (winner) — null on ties. */
  crownTeam: 'a' | 'b' | null;
  /** The viewer's team (full-brightness side) — null renders both dimmed. */
  myTeam: 'a' | 'b' | null;
}

export default function TeamScoreline({ scores, crownTeam, myTeam }: TeamScorelineProps) {
  const side = (teamKey: 'a' | 'b') => {
    const sideColor = myTeam === teamKey ? colors.white : 'rgba(255,255,255,0.75)';
    const won = crownTeam === teamKey;
    return (
      <View style={styles.side}>
        {/* Label row carries web's 0.7 label opacity — the trophy rides inside
            it, exactly like web's crown inside the label span. */}
        <View style={styles.labelRow}>
          {won && <Ionicons name="trophy" size={11} color="#ffd700" />}
          <Text style={[styles.label, { color: sideColor }]}>
            {t(teamKey === 'a' ? 'team1' : 'team2')}
          </Text>
        </View>
        <Text style={[styles.pts, won ? styles.ptsWon : { color: sideColor }]}>
          {(scores[teamKey] ?? 0).toLocaleString()}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.row}>
      {side('a')}
      <Text style={styles.dash}>—</Text>
      {side('b')}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 6,
    marginBottom: 4,
  },
  side: {
    alignItems: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    opacity: 0.7,
  },
  label: {
    fontFamily: 'Lexend-Bold',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pts: {
    fontFamily: 'Lexend-Bold',
    fontSize: 21,
    fontVariant: ['tabular-nums'],
  },
  ptsWon: {
    color: '#4CAF50',
  },
  dash: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'Lexend-Bold',
    fontSize: 16,
  },
});
