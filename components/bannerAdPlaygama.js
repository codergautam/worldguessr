import { useEffect } from "react";
import { setPlaygamaBanner } from "@/components/utils/playgamaBridge";

// Playgama's banner is an SDK-owned page overlay (showBanner('top'|'bottom')),
// NOT a container div like the GD/CG slots — so this renders nothing and only
// drives the SDK from its mount lifecycle. Mounting it where the other portals
// mount their banner components reuses their per-screen gates verbatim. React
// runs all cleanups before all effects within a commit, so a screen transition
// hides the old position before showing the new one, and playgamaBridge's
// last-write-wins `wantedBanner` settles any single-frame overlap.
export default function PlaygamaBanner({ position = "bottom" }) {
  useEffect(() => {
    setPlaygamaBanner(position);
    return () => setPlaygamaBanner(null);
  }, [position]);
  return null;
}
