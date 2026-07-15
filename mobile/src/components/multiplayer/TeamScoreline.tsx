/**
 * One-line team scoreline: "🏆 Team 1 3,200 — 2,800 Team 2" with the viewer's
 * team at full brightness. Single consumer: the results header in
 * game/results.tsx (crown on the match winner, never on draws — caller passes
 * null). The between-rounds screen uses PlayerList's team-first layout instead
 * (web playerList.js parity), so the old 'lg' variant is gone.
 */

import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, t } from '../../shared';

interface TeamScorelineProps {
  scores: { a: number; b: number };
  /** Team wearing the trophy (winner) — null on ties. */
  crownTeam: 'a' | 'b' | null;
  /** The viewer's team (full-brightness side) — null renders both dimmed. */
  myTeam: 'a' | 'b' | null;
}

export default function TeamScoreline({ scores, crownTeam, myTeam }: TeamScorelineProps) {
  return (
    <View style={styles.row}>
      {(['a', 'b'] as const).map((teamKey, i) => (
        <View key={teamKey} style={styles.side}>
          {i === 1 && <Text style={styles.dash}>—</Text>}
          {crownTeam === teamKey && <Ionicons name="trophy" size={13} color="#ffd700" />}
          <Text style={[styles.text, myTeam === teamKey && styles.textMine]}>
            {t(teamKey === 'a' ? 'team1' : 'team2')} {(scores[teamKey] ?? 0).toLocaleString()}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  side: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dash: { color: 'rgba(255,255,255,0.4)', fontFamily: 'Lexend', fontSize: 15 },
  text: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  textMine: { color: colors.white },
});
