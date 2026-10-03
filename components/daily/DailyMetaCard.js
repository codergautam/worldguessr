import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/components/useTranslations";

// Reveal tip for scheduled meta days (docs/daily-metas.md): the round's own
// pano pointed at the meta (Maps Embed API, chrome cropped away), a "Tip"
// lead-in, a title, one short explanation, tap-to-cycle when a location
// carries several metas. Mounted by gameUI in .endCards beside #endBanner;
// styles at the end of styles/daily.scss.
//
// Hover-expand is a CLASS from mouseenter/mouseleave, never :hover (the
// minimap ruling in globals.scss: touch panels with a fine pointer keep a
// sticky :hover). The growth itself is CSS-gated to desktop + fine pointer,
// so the class is inert on touch layouts even if a tap sets it.
//
// Two things must NOT reflow while the card's width animates:
// - The embed. Resizing the iframe re-lays-out Google's renderer every frame
//   (visible flicker), so the iframe has ONE fixed size (PANO_W wide plus the
//   chrome crop) and is only ever transform-scaled to cover its box — a
//   compositor-only change, no relayout, no flicker. fitPano() runs off a
//   ResizeObserver on the box, i.e. every frame of the width transition.
// - The text. It never re-wraps and never gains lines: the card is a CSS
//   size container and all of its type and spacing is in em of a
//   width-bound font-size (cqw on __text), so the growth is a pure zoom of
//   exactly what the resting card shows. Tip length is governed at import.

// Same key / endpoint as the daily's own Street View embed.
const EMBED_KEY = "AIzaSyA_t5gb2Mn37dZjhsaJ4F-OPp1PWDxqZyI";
// The embed's native visible width (its expanded-desktop size; smaller boxes
// scale it down). Mirrors --metaPanoW in daily.scss.
const PANO_W = 720;
const PANO_ASPECT = 1.6;
// Embed chrome crop (iframe px, applied inside the scale so it tracks the
// content): fullscreen button, right-side controls, bottom logo/terms strip.
// Top: the address / "View on Google Maps" box is ~65px for a one-line
// address and ~85px when it wraps; 60 let a sliver of it through. Mirrors
// --metaCropTop in daily.scss and the app's DailyMetaSheet.
const CROP_TOP = 90;
const CROP_RIGHT = 60;
const CROP_BOTTOM = 40;
// The iframe's load event fires when the embed DOCUMENT lands, while its
// imagery is still a grey/white canvas for a beat — revealing on load is
// the "street view flash". Hold the reveal until the imagery has had time
// to paint; the box stays dark meanwhile.
const PANO_REVEAL_DELAY_MS = 700;
// Credit link for the pack author (docs/daily-metas.md).
const GEOCOACH_URL = "https://geocoach.me";

// Street View zoom -> horizontal fov. The Embed API accepts 10..100.
function fovFromZoom(zoom) {
  const z = Number.isFinite(zoom) ? zoom : 1;
  return Math.round(Math.min(100, Math.max(10, 180 / Math.pow(2, z))));
}

function metaEmbedUrl(location, view) {
  const lat = Number.isFinite(view?.lat) ? view.lat : location.lat;
  const lng = Number.isFinite(view?.lng) ? view.lng : location.long;
  const heading = Number.isFinite(view?.heading) ? view.heading : (location.heading ?? 0);
  const pitch = Number.isFinite(view?.pitch) ? view.pitch : 0;
  return `https://www.google.com/maps/embed/v1/streetview?location=${lat},${lng}&key=${EMBED_KEY}&fov=${fovFromZoom(view?.zoom)}&heading=${heading}&pitch=${pitch}&language=en`;
}

// Phone layout (<= 1100px, see daily.scss): the card is a SHEET in front of
// #endBanner, which keeps rendering behind it. Got it slides the sheet down
// (`leaving`, this long) and unmounts it. Desktop never shows the button and
// never dismisses.
const SHEET_LEAVE_MS = 220;

export default function DailyMetaCard({ location, metas, fadingOut }) {
  const { t: text } = useTranslation("common");
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Imagery is (almost certainly) painted: fade the pano in.
  const [ready, setReady] = useState(false);
  const panoRef = useRef(null);
  const iframeRef = useRef(null);
  const revealTimerRef = useRef(null);
  const leaveTimerRef = useRef(null);

  // Freeze content while the answer scene fades out (same trick as
  // EndBanner) so the next round's data never flashes into the exit.
  const frozenRef = useRef({ location, metas });
  if (!fadingOut) frozenRef.current = { location, metas };
  const shown = frozenRef.current;
  const list = Array.isArray(shown.metas) ? shown.metas : [];

  // New round = new array from the locations payload: back to the first
  // meta, sheet open again.
  useEffect(() => {
    setIndex(0);
    setDismissed(false);
    setLeaving(false);
    if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
  }, [shown.metas]);

  const meta = list[Math.min(index, list.length - 1)];
  const src = meta && shown.location ? metaEmbedUrl(shown.location, meta.view) : null;

  // A new framing (next round, next tip) starts dark again until it loads.
  useEffect(() => {
    setReady(false);
    if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null; }
  }, [src]);

  // Cover-fit the fixed-size embed to its box: scale by the larger ratio,
  // centre the overflow both ways (a height-capped phone box is wider than
  // 16:10, so the authored centre stays centred), and carry the top crop
  // inside the scale.
  useEffect(() => {
    const box = panoRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const frame = iframeRef.current;
      if (!frame) return;
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (!w || !h) return;
      const s = Math.max(w / PANO_W, h / (PANO_W / PANO_ASPECT));
      const tx = -((PANO_W * s - w) / 2);
      const ty = -(((PANO_W / PANO_ASPECT) * s - h) / 2);
      frame.style.transform = `translate(${tx}px, ${ty}px) scale(${s}) translateY(${-CROP_TOP}px)`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [src]);

  useEffect(() => () => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
  }, []);

  if (!meta || !shown.location || dismissed) return null;

  const many = list.length > 1;
  const next = () => { if (many) setIndex((i) => (i + 1) % list.length); };
  const enter = () => setExpanded(true);
  const leave = () => setExpanded(false);
  const gotIt = () => {
    if (leaving) return;
    setLeaving(true);
    leaveTimerRef.current = setTimeout(() => { leaveTimerRef.current = null; setDismissed(true); }, SHEET_LEAVE_MS);
  };
  const onPanoLoad = () => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => { revealTimerRef.current = null; setReady(true); }, PANO_REVEAL_DELAY_MS);
  };
  const lead = meta.category ? `${text("dailyMetaTip")} · ${meta.category}` : text("dailyMetaTip");

  return (
    <div
      className={`daily-meta-card ${fadingOut ? "fading" : ""} ${expanded ? "expanded" : ""} ${leaving ? "leaving" : ""}`}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <div ref={panoRef} className={`daily-meta-card__pano ${ready ? "ready" : ""}`}>
        <iframe
          ref={iframeRef}
          src={src}
          aria-label={meta.title}
          width={PANO_W + CROP_RIGHT}
          height={PANO_W / PANO_ASPECT + CROP_TOP + CROP_BOTTOM}
          referrerPolicy="no-referrer-when-downgrade"
          loading="eager"
          onLoad={onPanoLoad}
        />
      </div>
      <div className={`daily-meta-card__text ${many ? "cycles" : ""}`} onClick={next}>
        <div className="daily-meta-card__head">
          <span className="daily-meta-card__tag">{lead}</span>
          {/* Meta packs are authored by GeoCoach. Inside the cycling block,
              so the click must not advance the tip. */}
          <a
            className="daily-meta-card__credit"
            href={GEOCOACH_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {text("dailyMetaPoweredBy", { brand: "geocoach.me" })}
          </a>
        </div>
        <div className="daily-meta-card__title">{meta.title}</div>
        <p className="daily-meta-card__body">{meta.explanation}</p>
        {many && (
          <div className="daily-meta-card__dots">
            {list.map((_, i) => (
              <span key={i} className={`dot ${i === index ? "current" : ""}`} />
            ))}
          </div>
        )}
      </div>
      {/* Phone sheet only (display: none on desktop). Outside the cycling
          block so the tap never advances the tip. */}
      <div className="daily-meta-card__gotit">
        <button type="button" onClick={gotIt}>{text("gotIt")}</button>
      </div>
    </div>
  );
}
