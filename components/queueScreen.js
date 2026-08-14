import { useEffect, useState } from "react";
import NextImage from "next/image";
import { IoTrophy, IoShield, IoFlash, IoTimeOutline } from "react-icons/io5";
import { asset } from "@/lib/basePath";
import { useTranslation } from "@/components/useTranslations";
import { formatQueueEta } from "@/shared/time/queueEta";

/**
 * The matchmaking screen: ranked 1v1, unranked 1v1, and 2v2 stage 2.
 *
 * Structure: a sonar radar, a mode eyebrow, the headline, one neutral unframed
 * data plate, and a running clock. All of the styling reasoning — including why
 * this is NOT a set of rounded pills, and why it deliberately does NOT use the
 * `.timer` green HUD recipe — lives in the header of styles/queueScreen.css.
 * Read that before changing the markup; the class names carry that argument.
 *
 * NOT USED FOR: 2v2 stage 1 (the teammate search renders inside the lobby card
 * in partyLobby.js, exactly as it does on mobile), the connecting /
 * connection-lost banners, or the public-FFA "waiting" lobby. Those stay on
 * BannerText — they are not queues.
 *
 * NO CANCEL BUTTON, by standing ruling: the navbar back button is the single
 * exit for every queue. Hence pointer-events:none on the root — nothing here
 * is interactive.
 *
 * DO NOT render this through createPortal. The GameDistribution ad-pause rule
 * in globals.scss hides `#__next *` with !important; a portal to document.body
 * would escape it and leave the queue screen painted over a running ad.
 */

// Ionicons v5 — react-icons/io5 IS the icon set mobile uses through
// @expo/vector-icons/Ionicons, so these are the same glyphs, not lookalikes.
// The headline is per-mode: what you are actually waiting for differs, and all
// three strings already exist and are translated in every locale.
//   ranked   -> "Finding an opponent"  (a matchmade 1v1 is one named person)
//   unranked -> "Finding a game"       (the generic wait)
//   2v2      -> "Finding a match"      (restores what the old 2v2 banner said
//                                       verbatim before this screen replaced it)
//
// RANKED CARRIES NO EYEBROW (user ruling Aug 9). "RANKED DUEL" over "Finding an
// opponent" over an ELO range said the same thing three times; the ELO plate
// already identifies the mode and nothing else on the site shows a rating.
// Unranked and 2v2 keep theirs — those have no plate to identify them.
const MODES = {
  publicDuel:   { Icon: IoTrophy, labelKey: null,           titleKey: "findingOpponent" },
  unrankedDuel: { Icon: IoFlash,  labelKey: "unrankedDuel", titleKey: "findingGame" },
  "2v2":        { Icon: IoShield, labelKey: "twovtwo",      titleKey: "findingMatch" },
};

const ROUGH_KEYS = { short: "queueEtaRoughShort", mid: "queueEtaRoughMid", long: "queueEtaRoughLong" };

// What a reserved cell shows before its value lands: a BLANK that holds the
// line box, not a glyph. "..." was tried and rejected (user ruling Aug 14):
// on a queue whose data arrives one RTT in, the dots painted for a fraction
// of a second and then switched, which reads as flicker, not as pending.
// NO client-side guess stands in for it either: an optimistic range computed
// from cached elo was tried and rejected (user ruling Aug 13) — stale elo /
// league-table drift made it visibly self-correct one RTT in.
const VALUE_PLACEHOLDER = " "; // nbsp, NOT a space: a plain space collapses and the blank cell loses its height

// A reserved cell's value: blank until the first real value, ONE soft fade-in
// when it arrives, then INSTANT swaps for every later change (widen steps, the
// long-wait flip). The elapsed clock beside this updates instantly every
// second, so instant swaps are this screen's native language — the earlier
// fade-out/fade-in dance on every change was the "random switch" flicker
// (user ruling Aug 14). The key remounts the span exactly once, at
// pending→live, replaying the CSS --arrive animation; later values keep the
// 'live' key, so no remount and no animation.
function ReservedValue({ value, dim }) {
  const pending = value === VALUE_PLACEHOLDER;
  return (
    <span
      key={pending ? "pending" : "live"}
      className={`wgQueue__cellValue${pending ? "" : " wgQueue__cellValue--arrive"}${dim ? " wgQueue__cellValue--rough" : ""}`}
    >
      {value}
    </span>
  );
}

// `exiting`: this render is the EXIT GHOST — multiplayerHome keeps the screen
// mounted for one short beat after the match is found, with frozen props, so
// the content dissolves instead of vanishing in one frame. All of the exit's
// behaviour lives in styles/queueScreen.css under .wgQueue--exiting.
export default function QueueScreen({ mode, multiplayerState, timeOffset, signedIn, exiting }) {
  const { t: text } = useTranslation("common");

  // A RE-RENDER PUMP, not a clock. The elapsed value is derived from the
  // server's queuedAt on every render instead of being accumulated, so a
  // throttled background tab cannot silently lose seconds — there would be no
  // state to recover them from.
  //
  // PHASE-LOCKED to the queuedAt second boundary, not a bare setInterval(1000).
  // The displayed digit flips when floor(elapsed) crosses a boundary, and that
  // boundary is phased to queuedAt — while a fixed interval is phased to MOUNT.
  // Any unrelated re-render landing between the two phases (an ETA push, a
  // widen step — under second-precision ETAs that is nearly every 5s beat)
  // showed the next second EARLY, and the following interval tick then held it
  // LONG: the stopwatch visibly stuttered and sprinted (user report Aug 14).
  // Re-arming a timeout for just past each boundary makes every second last
  // exactly one second regardless of what else renders in between.
  const [, setTick] = useState(0);
  const queuedAtForPump = multiplayerState?.queuedAt;
  useEffect(() => {
    if (typeof queuedAtForPump !== "number") return; // nothing displayed yet
    let id;
    const arm = () => {
      const ms = Math.max(0, Date.now() + (timeOffset || 0) - queuedAtForPump);
      id = setTimeout(() => { setTick((n) => n + 1); arm(); }, 1000 - (ms % 1000) + 5);
    };
    arm();
    return () => clearTimeout(id);
  }, [queuedAtForPump, timeOffset]);

  const { Icon, labelKey, titleKey } = MODES[mode] || MODES.unrankedDuel;

  // A ranked queue that resolves into the placement seeding match (server
  // follow-up `queuePlacement`). This OVERRIDES the no-eyebrow ruling above:
  // "Placement match" is new information, not a third restatement of "ranked".
  const isPlacement = mode === "publicDuel" && !!multiplayerState?.placementPending;

  const queuedAt = multiplayerState?.queuedAt;
  let elapsedStr = null;
  let elapsedSecs = 0;
  let elapsedMs = 0;
  if (typeof queuedAt === "number") {
    elapsedMs = Math.max(0, Date.now() + (timeOffset || 0) - queuedAt);
    elapsedSecs = Math.floor(elapsedMs / 1000);
    elapsedStr = `${Math.floor(elapsedSecs / 60)}:${String(elapsedSecs % 60).padStart(2, "0")}`;
  }

  // Ranked only — unranked and 2v2 carry no rating, so the server never sends
  // either of these for them.
  const range = mode === "publicDuel" ? multiplayerState?.publicDuelRange : null;
  const eta = mode === "publicDuel" ? multiplayerState?.queueEta : null;

  // THE PLATE'S LAYOUT IS RESERVED, NOT DATA-DRIVEN, for a signed-in ranked
  // queue — and BOTH cells reserve, not just the range. The range and the ETA
  // arrive together one RTT after join; reserving only the first meant the
  // plate widened and grew a divider a fraction of a second after mount, which
  // was half of the "flicker then random switch" complaint (user ruling
  // Aug 14). Now the plate's full geometry exists from the first frame,
  // blank, and the values fade into place without anything moving. No
  // client-side guess can close that gap honestly (see VALUE_PLACEHOLDER).
  // Guests never receive a range or an ETA, so they never reserve anything.
  const reserve = mode === "publicDuel" && signedIn;
  const rangeStr = range
    ? `${range[0]} – ${range[1]}`
    : (reserve ? VALUE_PLACEHOLDER : null);

  // 'rough' is a MODELLED estimate: vague wording, and a dimmer value style.
  // 'unknown' renders nothing at all — no data is a reason to say nothing,
  // never a reason to invent a number.
  let etaStr = null;
  let etaRough = false;
  // The server sends the threshold, but this screen owns a 1s clock. Flip
  // locally as soon as it is crossed so a stale quote cannot survive until the
  // server's next 5s broadcast. The next server message makes the state agree.
  const etaPastThreshold = typeof eta?.longAfterSeconds === "number"
    && elapsedMs > eta.longAfterSeconds * 1000;
  if (eta?.state === "long" || etaPastThreshold) {
    etaStr = text("queueEtaLong");
  } else if (eta?.state === "rough" && ROUGH_KEYS[eta.tier]) {
    etaStr = text(ROUGH_KEYS[eta.tier]);
    etaRough = true;
  } else if (eta?.state === "ok" && Number.isFinite(eta.seconds)) {
    etaStr = formatQueueEta(text, eta.seconds);
  }
  // The reserved-blank counterpart of rangeStr, same rules. 'unknown' stays
  // blank rather than rendering nothing: a label over quiet space beats a
  // divider that appears later and shoves the plate.
  const etaCellStr = etaStr ?? (reserve ? VALUE_PLACEHOLDER : null);

  return (
    <div className={`wgQueue wgQueue--${mode}${exiting ? " wgQueue--exiting" : ""}`}>
      <div className="wgQueue__veil" />

      <div className="wgQueue__stage">
        <div className="wgQueue__radar">
          {/* Three rings, offset by negative animation-delays in the CSS. */}
          <span className="wgQueue__ring" />
          <span className="wgQueue__ring" />
          <span className="wgQueue__ring" />
          <div className="wgQueue__core">
            <NextImage.default
              className="wgQueue__compass"
              alt=""
              src={asset("/loader.webp")}
              width={72}
              height={72}
              unoptimized
            />
          </div>
        </div>

        <div className="wgQueue__info">
          {/* Absent on ranked — the `gap` lives on .wgQueue__info, so dropping
              the eyebrow leaves no stray space above the headline. A placement
              queue is the exception: its eyebrow announces the seeding match. */}
          {(labelKey || isPlacement) && (
            <span className="wgQueue__mode">
              <Icon className="wgQueue__modeIcon" aria-hidden />
              {text(isPlacement ? "placementMatch" : labelKey)}
            </span>
          )}

          {/* STATIC dots. The animated three-dot version was removed: the
              sonar and the running clock already say "working on it", and a
              third looping thing on one small composition was one too many.
              Appended in JSX rather than baked into the locale string, matching
              `${text("findingMatch")}...` in multiplayerHome.js — no translation
              then carries trailing punctuation it could get wrong. */}
          <h2 className="wgQueue__title">{text(titleKey)}...</h2>

          {/* One plate, one cell per value. The divider between cells is a CSS
              sibling rule, so a single value renders with no stray edge.
              Placement skips the plate because its bot match begins immediately. */}
          {!isPlacement && (rangeStr || etaCellStr) && (
            <div className="wgQueue__data">
              {rangeStr && (
                <div className="wgQueue__cell">
                  <span className="wgQueue__cellLabel">{text("eloRange")}</span>
                  <ReservedValue value={rangeStr} />
                </div>
              )}
              {etaCellStr && (
                <div className="wgQueue__cell">
                  <span className="wgQueue__cellLabel">{text("queueEtaLabel")}</span>
                  <ReservedValue value={etaCellStr} dim={etaRough} />
                </div>
              )}
            </div>
          )}

          {elapsedStr && (
            <span className="wgQueue__elapsed">
              <IoTimeOutline className="wgQueue__elapsedIcon" aria-hidden />
              {elapsedStr}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
