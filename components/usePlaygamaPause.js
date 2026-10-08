import { useEffect, useRef, useState } from "react";
import { getPlaygamaPaused, subscribePlaygamaPause } from "./utils/playgamaBridge";

// Resume compensation runs in the SDK event callback, before timers can run
// again. Keep the callback current without resubscribing mid-pause.
export default function usePlaygamaPause(onResume) {
  const resumeRef = useRef(onResume);
  resumeRef.current = onResume;
  const [paused, setPaused] = useState(getPlaygamaPaused);
  useEffect(() => {
    let pausedAt = getPlaygamaPaused() ? Date.now() : null;
    const update = () => {
      const next = getPlaygamaPaused();
      if (next) {
        if (pausedAt === null) pausedAt = Date.now();
      } else if (pausedAt !== null) {
        const startedAt = pausedAt;
        pausedAt = null;
        resumeRef.current?.({ pausedAt: startedAt, resumedAt: Date.now() });
      }
      setPaused(next);
    };
    const unsubscribe = subscribePlaygamaPause(update);
    update();
    return unsubscribe;
  }, []);
  return paused;
}
