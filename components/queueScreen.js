import { useEffect, useState } from "react";
import NextImage from "next/image";
import { IoTrophy, IoShield, IoFlash, IoTimeOutline } from "react-icons/io5";
import { asset } from "@/lib/basePath";
import { useTranslation } from "@/components/useTranslations";

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

export default function QueueScreen({ mode, multiplayerState, timeOffset }) {
  const { t: text } = useTranslation("common");

  // A RE-RENDER PUMP, not a clock. The elapsed value is derived from the
  // server's queuedAt on every render instead of being accumulated, so a
  // throttled background tab cannot silently lose seconds — there would be no
  // state to recover them from.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const { Icon, labelKey, titleKey } = MODES[mode] || MODES.unrankedDuel;

  // A ranked queue that resolves into the placement seeding match (server
  // follow-up `queuePlacement`). This OVERRIDES the no-eyebrow ruling above:
  // "Placement match" is new information, not a third restatement of "ranked".
  const isPlacement = mode === "publicDuel" && !!multiplayerState?.placementPending;

  const queuedAt = multiplayerState?.queuedAt;
  let elapsedStr = null;
  if (typeof queuedAt === "number") {
    const secs = Math.max(0, Math.floor((Date.now() + (timeOffset || 0) - queuedAt) / 1000));
    elapsedStr = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  }

  // Ranked only — unranked and 2v2 carry no rating, so the server never sends
  // either of these for them.
  const range = mode === "publicDuel" ? multiplayerState?.publicDuelRange : null;
  const eta = mode === "publicDuel" ? multiplayerState?.queueEta : null;

  // 'rough' is a MODELLED estimate: vague wording, and a dimmer value style.
  // 'unknown' renders nothing at all — no data is a reason to say nothing,
  // never a reason to invent a number.
  let etaStr = null;
  let etaRough = false;
  if (eta?.state === "long") {
    etaStr = text("queueEtaLong");
  } else if (eta?.state === "rough" && ROUGH_KEYS[eta.tier]) {
    etaStr = text(ROUGH_KEYS[eta.tier]);
    etaRough = true;
  } else if (eta?.state === "ok" && eta.value !== null) {
    etaStr = text(eta.unit === "min" ? "queueEtaMinutes" : "queueEtaSeconds", { v: eta.value });
  }

  return (
    <div className={`wgQueue wgQueue--${mode}`}>
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
              Suppressed for a placement: the opponent is the placement bot, so
              a rating range and a wait estimate are both noise — the one-line
              explainer below is what a brand-new player actually needs. */}
          {!isPlacement && (range || etaStr) && (
            <div className="wgQueue__data">
              {range && (
                <div className="wgQueue__cell">
                  <span className="wgQueue__cellLabel">{text("eloRange")}</span>
                  <span className="wgQueue__cellValue">{range[0]} – {range[1]}</span>
                </div>
              )}
              {etaStr && (
                <div className="wgQueue__cell">
                  <span className="wgQueue__cellLabel">{text("queueEtaLabel")}</span>
                  <span className={`wgQueue__cellValue${etaRough ? " wgQueue__cellValue--rough" : ""}`}>
                    {etaStr}
                  </span>
                </div>
              )}
            </div>
          )}

          {isPlacement && (
            <p className="wgQueue__placementNote">{text("placementQueueNote")}</p>
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
