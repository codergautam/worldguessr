import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { t } from '../../shared/locale';
import { getClientLocalDate, msUntilLocalMidnight } from './dailyDate';
import { readDailyStatus, writeDailyStatus } from './dailyStatusCache';
import { getGuestId } from './guestId';
import DailyStreakBadge, { type StreakVariant } from './DailyStreakBadge';
import { dailyColors } from './styles';

const AT_RISK_MS = 4 * 60 * 60 * 1000;

interface Props {
  secret: string | null;
  onPress: () => void;
}

export default function DailyMenuItem({ secret, onPress }: Props) {
  const [state, setState] = useState({
    streak: 0,
    playedToday: false,
    msToMidnight: msUntilLocalMidnight(),
  });

  useEffect(() => {
    let cancelled = false;
    const today = getClientLocalDate();

    (async () => {
      const cached = await readDailyStatus(today);
      if (cancelled) return;
      if (cached) {
        setState((s) => ({ ...s, streak: cached.streak || 0, playedToday: !!cached.playedToday }));
      }

      const gid = secret ? null : await getGuestId();
      if (!secret && !gid) return;

      try {
        const data = await api.dailyChallenge.results(today, secret ?? undefined, gid ?? undefined);
        if (cancelled) return;
        setState({
          streak: data.user?.streak || 0,
          playedToday: !!data.user?.playedToday,
          msToMidnight: msUntilLocalMidnight(),
        });
        if (data.user) await writeDailyStatus(today, data.user);
      } catch {
        /* ignore */
      }
    })();

    const id = setInterval(
      () => setState((s) => ({ ...s, msToMidnight: msUntilLocalMidnight() })),
      60000,
    );
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [secret]);

  const atRisk = state.streak > 0 && !state.playedToday && state.msToMidnight <= AT_RISK_MS;
  const variant: StreakVariant = state.playedToday
    ? 'done'
    : atRisk
    ? 'at-risk'
    : state.streak > 0
    ? 'pulsing'
    : 'default';

  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      onPress={onPress}
    >
      <View style={styles.icon}>
        <Ionicons name="calendar" size={22} color="#fff" />
      </View>
      <View style={styles.middle}>
        <Text style={styles.label}>{t('dailyChallenge')}</Text>
        {state.streak > 0 && (
          <View style={styles.badgeRow}>
            <DailyStreakBadge streak={state.streak} variant={variant} />
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: 'rgba(76,175,80,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.4)',
    marginVertical: 6,
  },
  buttonPressed: { opacity: 0.7 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dailyColors.green,
    justifyContent: 'center',
    alignItems: 'center',
  },
  middle: { flex: 1 },
  label: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 16,
  },
  badgeRow: { marginTop: 4 },
});
