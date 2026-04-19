import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from '@/components/useTranslations';
import config from '@/clientConfig';
import { getClientLocalDate, msUntilLocalMidnight } from '@/utils/dailyDate';
import { readDailyStatus, writeDailyStatus } from '@/utils/dailyStatusCache';
import { getGuestId } from '@/utils/guestId';
import DailyStreakBadge from './DailyStreakBadge';

const AT_RISK_THRESHOLD_MS = 4 * 60 * 60 * 1000;

export default function DailyMenuItem({ session, onClick }) {
  const { t: text } = useTranslation();
  // Seed from localStorage so streak/played pill appears the instant the
  // menu mounts — we still refresh from the API in the background.
  const [state, setState] = useState(() => {
    const cached = typeof window !== 'undefined' ? readDailyStatus(getClientLocalDate()) : null;
    return {
      streak: cached?.streak || 0,
      playedToday: !!cached?.playedToday,
      todaysScore: cached?.ownScore ?? null,
      msToMidnight: typeof window !== 'undefined' ? msUntilLocalMidnight() : 24 * 60 * 60 * 1000,
    };
  });
  const apiUrlRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { apiUrlRef.current = config().apiUrl; } catch { apiUrlRef.current = ''; }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const secret = session?.token?.secret;
    const today = getClientLocalDate();

    async function load() {
      if (!apiUrlRef.current) return;
      // Use secret if logged in; otherwise fall back to guestId so guests
      // who've played today still see their streak / score pill on the menu,
      // same as the /results endpoint supports in the hook.
      const guestId = !secret ? getGuestId() : null;
      if (!secret && !guestId) {
        setState(s => ({ ...s, streak: 0, playedToday: false, msToMidnight: msUntilLocalMidnight() }));
        return;
      }
      const params = new URLSearchParams({ date: today });
      if (secret) params.set('secret', secret);
      else params.set('guestId', guestId);
      try {
        const res = await fetch(`${apiUrlRef.current}/api/dailyChallenge/results?${params.toString()}`);
        if (!res.ok) throw new Error('fail');
        const data = await res.json();
        if (cancelled) return;
        setState({
          streak: data.user?.streak || 0,
          playedToday: !!data.user?.playedToday,
          todaysScore: data.user?.ownScore ?? null,
          msToMidnight: msUntilLocalMidnight(),
        });
        if (data.user) writeDailyStatus(today, data.user);
      } catch {
        if (!cancelled) {
          setState(s => ({ ...s, msToMidnight: msUntilLocalMidnight() }));
        }
      }
    }
    load();
    const id = setInterval(() => setState(s => ({ ...s, msToMidnight: msUntilLocalMidnight() })), 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [session?.token?.secret]);

  const atRisk = state.streak > 0 && !state.playedToday && state.msToMidnight <= AT_RISK_THRESHOLD_MS;

  const variant = state.playedToday
    ? 'done'
    : atRisk
      ? 'at-risk'
      : state.streak > 0
        ? 'pulsing'
        : 'default';

  return (
    <button
      className="g2_nav_text"
      aria-label={text('dailyChallenge')}
      onClick={onClick}
    >
      {text('dailyChallenge')}
      {state.playedToday && typeof state.todaysScore === 'number' ? (
        <span className="daily-streak-pill done" style={{ marginLeft: '0.5em', fontSize: '0.6em' }}>
          <span aria-hidden="true">✓</span>
          <span>{text('dailyDoneCheckmark', { score: state.todaysScore })}</span>
        </span>
      ) : state.streak > 0 ? (
        <DailyStreakBadge streak={state.streak} variant={variant} />
      ) : null}
    </button>
  );
}
