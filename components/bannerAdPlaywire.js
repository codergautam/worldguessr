import { memo, useEffect, useRef, useState } from "react";
import { rampQue } from "./utils/playwire";
import sendEvent from "./utils/sendEvent";

// Playwire clone of bannerAdNitro's lifecycle: WE pick the creative size
// client-side from viewport fit and mount/unmount per screen — RAMP's
// device detection is not used. CK (Aug 3, second config): selector
// targeting removed, selectorId is the only binding, and each size is its
// own unit, all-devices:
const UNIT_FOR_SIZE = {
  "320x50": "standard_iab_head1",
  "728x90": "standard_iab_head2",
  "300x250": "standard_iab_cntr1",
};

// Hard-won rules from the Aug 2-3 integration saga — the "why" behind this
// file's minimalism. Break them and ads go permanently blank:
//
// 1. NEVER call destroyUnits, and NEVER clear the container's innerHTML in
//    cleanup. Each mount declares the full layout with spaAds; RAMP's own
//    internal destroy+re-init handles whatever ran before. Manual teardown
//    poisoned later re-inits of the destroyed unit (tag created, no fetch,
//    blank forever).
// 2. NO manual googletag/triggerRefresh calls — CK explicitly (Aug 3):
//    manual refreshes "can cause issues", remove them. The units' Auto/30s
//    refresh is config-side. If fetching or refreshing ever breaks again,
//    it's a CONFIG problem — the Aug 3 stall's root cause was a lazyLoad
//    rule on cntr1 that waited for a SCROLL event (a full-screen game never
//    scrolls); CK removed it. Report to CK, do not re-add workarounds.
// 3. Injection ids are per-MOUNT (`selectorId-<n>`): pageos can cache the
//    container element it resolved for an id, and a remount reusing the id
//    can land the new tag in the detached old div. Fresh ids force a fresh
//    DOM query every time. Cheap, keep it.

// Largest type that fits: width within 90% of the screen, height within
// vertThresh of it. Later entries win — order sizes smallest → largest.
function findAdType(screenW, screenH, types, vertThresh) {
  let type = 0;
  for (let i = 0; i < types.length; i++) {
    if (types[i][0] <= screenW * 0.9 && types[i][1] <= screenH * vertThresh) {
      type = i;
    }
  }

  if (types[type][0] > screenW || types[type][1] > screenH * vertThresh)
    return -1;

  return type;
}

let mountSeq = 0;

function PlaywireAd({
  types,          // [[w,h], ...] — must all exist in UNIT_FOR_SIZE
  selectorId,     // base for the per-mount injection id
  vertThresh = 0.3,
  screenW,
  screenH,
  showAdvertisementText = true,
}) {
  const [isClient, setIsClient] = useState(false); // false | true | "debug"
  const adDivRef = useRef(null);
  const instanceIdRef = useRef(null);
  if (instanceIdRef.current === null) {
    instanceIdRef.current = `${selectorId}-${++mountSeq}`;
  }
  const instanceId = instanceIdRef.current;

  useEffect(() => {
    // ?pwtest forces real injection on localhost (wiring checks through a
    // tunnel / against house ads without deploying).
    const debug =
      window.location.hostname === "localhost" &&
      !window.location.search.includes("pwtest");
    setIsClient(debug ? "debug" : true);
  }, []);

  const typeIdx = findAdType(screenW, screenH, types, vertThresh);
  const size = typeIdx === -1 ? null : types[typeIdx];
  const unitType = size ? UNIT_FOR_SIZE[`${size[0]}x${size[1]}`] : null;

  useEffect(() => {
    if (!unitType || !isClient || isClient === "debug") return;

    // The call runs through ramp.que, which can fire long after mount (the
    // stack loads on first interaction) — a slot that unmounted or resized
    // to a different unit in the meantime must not declare a stale layout.
    let alive = true;

    rampQue(() => {
      if (!alive) return;
      try {
        // Declare the current ad layout: spaAds destroys whatever ran
        // before and loads exactly this list. countPageView: a slot mount
        // is this SPA's navigation signal, so Playwire's pageview counting
        // rides the same event.
        window.ramp.spaAds({
          ads: [{ type: unitType, selectorId: instanceId }],
          countPageView: true,
        });
        sendEvent(`ad_request_${size[0]}x${size[1]}_${unitType}`);
      } catch (e) {}
    });

    return () => {
      // The flag and NOTHING else — see the header rules.
      alive = false;
    };
  }, [unitType, instanceId, isClient]);

  if (!size || !isClient) return null;

  return (
    <div
      className={`playwire-ad-slot${isClient === "debug" ? " pw-debug" : ""}`}
      style={{
        position: "relative",
        display: "inline-block",
      }}
    >
      {showAdvertisementText && (
        <span
          style={{
            position: "absolute",
            top: "-24px",
            left: "0px",
            padding: "0 5px",
            fontSize: "18px",
            fontWeight: "bold",
          }}
        >
          Advertisement
        </span>
      )}
      <div
        style={{
          backgroundColor: `rgba(0,0,0,${isClient === "debug" ? 0.5 : 0})`,
          height: size[1],
          width: size[0],
          textAlign: "center",
          position: "relative",
        }}
        id={instanceId}
        ref={adDivRef}
      >
        {isClient === "debug" && (
          <div
            style={{
              position: "absolute",
              bottom: "10px",
              left: "0",
              width: "100%",
              color: "white",
              zIndex: 2,
              backgroundColor: `rgba(0, 0, 0, 0.5)`,
            }}
          >
            <h3>Banner Ad Here (Playwire)</h3>
            <p style={{ fontSize: "0.8em" }}>
              {size[0]}x{size[1]}
            </p>
            <p style={{ fontSize: "0.6em" }}>Unit: {unitType}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// gameUI re-renders constantly during play (timers, HUD state) with this
// slot in its tree; every prop is a scalar except `types`, a fresh array
// literal each parent render — compare its entries, not its identity, so
// the ad subtree drops out of every gameplay commit entirely.
function propsEqual(a, b) {
  if (
    a.selectorId !== b.selectorId ||
    a.screenW !== b.screenW ||
    a.screenH !== b.screenH ||
    a.vertThresh !== b.vertThresh ||
    a.showAdvertisementText !== b.showAdvertisementText
  )
    return false;
  if (a.types === b.types) return true;
  if (!a.types || !b.types || a.types.length !== b.types.length) return false;
  for (let i = 0; i < a.types.length; i++) {
    if (a.types[i][0] !== b.types[i][0] || a.types[i][1] !== b.types[i][1])
      return false;
  }
  return true;
}

export default memo(PlaywireAd, propsEqual);
