import { View, Text, StyleSheet, Pressable } from 'react-native';
import { t } from '../../shared/locale';
import { dailyColors } from './styles';

interface Entry {
  rank: number;
  username: string;
  score: number;
}

interface Props {
  top10?: Entry[];
  userRank?: number | null;
  userScore?: number | null;
  username?: string;
  isLoggedIn: boolean;
  onSignIn?: () => void;
}

function medal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

export default function DailyLeaderboardPanel({
  top10 = [],
  userRank,
  userScore,
  username,
  isLoggedIn,
  onSignIn,
}: Props) {
  const userInTop10 = typeof userRank === 'number' && userRank <= 10;

  return (
    <View style={styles.wrap}>
      {top10.length === 0 && <Text style={styles.empty}>{t('dailyLandingNoWinnersYet')}</Text>}
      {top10.map((entry) => {
        const isMe = isLoggedIn && entry.username === username;
        return (
          <View key={entry.rank} style={[styles.row, isMe && styles.rowSelf]}>
            <View style={styles.left}>
              <Text style={styles.rank}>{medal(entry.rank)}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {entry.username}
              </Text>
            </View>
            <Text style={styles.score}>{entry.score.toLocaleString()}</Text>
          </View>
        );
      })}
      {!userInTop10 && typeof userRank === 'number' && isLoggedIn && (
        <>
          <Text style={styles.separator}>•••</Text>
          <View style={[styles.row, styles.rowSelf]}>
            <View style={styles.left}>
              <Text style={styles.rank}>#{userRank}</Text>
              <Text style={styles.name}>{username || t('yourScore')}</Text>
            </View>
            <Text style={styles.score}>{Number(userScore || 0).toLocaleString()}</Text>
          </View>
        </>
      )}
      {!isLoggedIn && (
        <>
          <Text style={styles.separator}>•••</Text>
          <View style={styles.signinRow}>
            <Text style={styles.signinText}>{t('signInToCompete')}</Text>
            {onSignIn && (
              <Pressable onPress={onSignIn} style={styles.signinBtn}>
                <Text style={styles.signinBtnText}>{t('signIn')}</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  empty: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    paddingVertical: 12,
    fontFamily: 'Lexend',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  rowSelf: {
    borderColor: dailyColors.green,
    backgroundColor: 'rgba(76,175,80,0.12)',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  rank: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 14, minWidth: 32 },
  name: { color: '#fff', fontFamily: 'Lexend', fontSize: 14, flex: 1 },
  score: { color: dailyColors.green, fontFamily: 'Lexend-SemiBold', fontSize: 14 },
  separator: {
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    fontSize: 16,
    letterSpacing: 4,
  },
  signinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  signinText: { color: 'rgba(255,255,255,0.7)', fontFamily: 'Lexend', fontSize: 13 },
  signinBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: dailyColors.green,
    borderRadius: 8,
  },
  signinBtnText: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 13 },
});
