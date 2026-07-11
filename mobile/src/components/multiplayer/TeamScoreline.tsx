/**
 * One-line team scoreline: "🏆 Team 1 3,200 — 2,800 Team 2" with the viewer's
 * team at full brightness. Two consumers, one convention (crown on the given
 * team, never on ties — callers pass null for ties):
 *   • between-rounds hero in game/[id].tsx (size 'lg', crown = current leader)
 *   • results header in game/results.tsx (size 'md', crown = match winner)
 */

import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, t } from '../../shared';

interface TeamScorelineProps {
  scores: { a: number; b: number };
  /** Team wearing the trophy (leader/winner) — null on ties. */
  crownTeam: 'a' | 'b' | null;
  /** The viewer's team (full-brightness side) — null renders both dimmed. */
  myTeam: 'a' | 'b' | null;
  size?: 'md' | 'lg';
}

export default function TeamScoreline({ scores, crownTeam, myTeam, size = 'md' }: TeamScorelineProps) {
  const lg = size === 'lg';
  return (
    <View style={[styles.row, lg && styles.rowLg]}>
      {(['a', 'b'] as const).map((teamKey, i) => (
        <View key={teamKey} style={styles.side}>
          {i === 1 && <Text style={[styles.dash, lg && styles.dashLg]}>—</Text>}
          {crownTeam === teamKey && <Ionicons name="trophy" size={lg ? 16 : 13} color="#ffd700" />}
          <Text style={[styles.text, lg && styles.textLg, myTeam === teamKey && styles.textMine]}>
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
  rowLg: { gap: 10, marginBottom: 12 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dash: { color: 'rgba(255,255,255,0.4)', fontFamily: 'Lexend', fontSize: 15 },
  dashLg: { fontSize: 20 },
  text: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  textLg: { color: 'rgba(255,255,255,0.8)', fontFamily: 'Lexend-Bold', fontSize: 20 },
  textMine: { color: colors.white },
});
