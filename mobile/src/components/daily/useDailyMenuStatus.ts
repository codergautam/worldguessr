import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from '../../services/api';
import { getClientLocalDate, msUntilLocalMidnight } from './dailyDate';
import { readDailyStatus, writeDailyStatus } from './dailyStatusCache';
import { ensureGuestId } from './guestId';
import type { StreakVariant } from './DailyStreakBadge';

const AT_RISK_MS = 4 * 60 * 60 * 1000;

export interface DailyMenuStatus {
  streak: number;
  playedToday: boolean;
  variant: StreakVariant;
}

/**
 * Shared streak/played status for the home + menu daily entry. Mirrors web's
 * DailyMenuItem: seeds instantly from the AsyncStorage cache, then refreshes
 * from /results (secret if logged in, else guestId). Recomputes the at-risk
 * "variant" on a 60s timer as local midnight approaches.
 *
 * Refreshes on every screen focus so returning from a just-played daily run
 * shows the updated streak without an app restart — guests included, since we
 * `ensureGuestId()` (create-if-missing) rather than only reading an id that may
 * not exist yet on a fresh install.
 */
export function useDailyMenuStatus(secret: string | null): DailyMenuStatus {
  const [state, setState] = useState({
    streak: 0,
    playedToday: false,
    msToMidnight: msUntilLocalMidnight(),
  });

  const load = useCallback(
    async (isCancelled: () => boolean) => {
      const today = getClientLocalDate();

      const cached = await readDailyStatus(today);
      if (isCancelled()) return;
      if (cached) {
        setState((s) => ({ ...s, streak: cached.streak || 0, playedToday: !!cached.playedToday }));
      }

      // ensureGuestId (not getGuestId) so a brand-new guest gets an id and a
      // streak fetch on first render — otherwise the pill never appears until a
      // later launch once the id has been lazily created elsewhere.
      const gid = secret ? null : await ensureGuestId();
      if (isCancelled()) return;
      if (!secret && !gid) {
        setState((s) => ({ ...s, streak: 0, playedToday: false, msToMidnight: msUntilLocalMidnight() }));
        return;
      }

      try {
        const data = await api.dailyChallenge.results(today, secret ?? undefined, gid ?? undefined);
        if (isCancelled()) return;
        setState({
          streak: data.user?.streak || 0,
          playedToday: !!data.user?.playedToday,
          msToMidnight: msUntilLocalMidnight(),
        });
        if (data.user) await writeDailyStatus(today, data.user);
      } catch {
        if (!isCancelled()) setState((s) => ({ ...s, msToMidnight: msUntilLocalMidnight() }));
      }
    },
    [secret],
  );

  // Refresh whenever the screen regains focus (e.g. back from /daily), and on
  // secret changes (login/logout).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      load(() => cancelled);
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  // Tick the at-risk timer each minute regardless of focus.
  useEffect(() => {
    const id = setInterval(
      () => setState((s) => ({ ...s, msToMidnight: msUntilLocalMidnight() })),
      60000,
    );
    return () => clearInterval(id);
  }, []);

  const atRisk = state.streak > 0 && !state.playedToday && state.msToMidnight <= AT_RISK_MS;
  const variant: StreakVariant = state.playedToday
    ? 'done'
    : atRisk
    ? 'at-risk'
    : state.streak > 0
    ? 'pulsing'
    : 'default';

  return { streak: state.streak, playedToday: state.playedToday, variant };
}
