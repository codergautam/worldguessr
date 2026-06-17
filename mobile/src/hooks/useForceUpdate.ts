import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { isUpdateRequired } from '../services/forceUpdate';

/**
 * Drives the blocking ForceUpdateModal. Checks the published minimum-supported
 * version floor on mount AND on every return to the foreground ("each open"), so
 * a user who background-parks a now-stale build is gated the instant a breaking
 * release raises the floor — without needing a cold start.
 *
 * One-way latch: once it flips to true it stays true for the session. The check
 * fails open (see isUpdateRequired), so we never let a transient network blip
 * clear a block we've already decided is warranted — the only way out is to
 * actually update, which relaunches the app.
 */
export function useForceUpdate(): boolean {
  const [required, setRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (cancelled || required) return;
      const need = await isUpdateRequired();
      if (!cancelled && need) setRequired(true);
    };

    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
    // `required` intentionally omitted: the latch short-circuits inside check(),
    // and re-subscribing the AppState listener on every flip is pointless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return required;
}
