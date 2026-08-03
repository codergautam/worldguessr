import { memo, useEffect, useRef, useState } from "react";
import { rampQue, activeUnitIds } from "./utils/playwire";
import sendEvent from "./utils/sendEvent";

// NO manual refresh timer here, on purpose: the account's unit config
// already refreshes 30s / in-view-only / limit 100 (verified in the user's
// ramp.settings dump, Aug 2) — the exact Nitro cadence. A triggerRefresh
// interval on top would double-refresh. If the cadence ever looks wrong,
// fix it with Playwire config-side, not here.
//
// NO destroy→re-add cycling, EVER (Aug 2, observed in #tychedebug):
// re-adding a unit that was destroyed stalls inside pageos — the new tag is
// created ("Create Tyche Tag") and then NOTHING follows (no price-floor
// prediction, no Slot Request; first-load stacks show spaAddAds arming a
// lazy-load spy whose handleViewable drives the fetch, and after a destroy
// that spy never fires for the replacement element). The box just sits
// blank. Consequences baked into this file and its call sites:
//   - The slot must be mounted ONCE and HIDDEN (display:none) to "remove"
//     it, not unmounted — hidden isn't viewable, so the config's inViewOnly
//     refresh pauses off-screen for free (home.js does this per screen, and
//     this file does it when the screen shrinks below the unit's fit rule).
//   - The bound type is STICKY: once a unit type has been added it never
//     re-keys, so a units array whose fitting type CHANGES with screen size
//     is forbidden until Playwire fixes the re-add path — one type per slot
//     per page life (multiple size variants of that type are fine).
//   - The Nitro-era 10-min recycle (idle-tab leak insurance) is GONE — it
//     was a destroy→re-add loop and would blank the ad 10 minutes in. Leak
//     insurance is now the overnight idle-tab heap check in the go-live
//     protocol; if Playwire leaks like Nitro did, take it up config-side.
// Unmount teardown below still destroys — correct for a REAL exit (leaving
// the page); just never follow it with another add in the same page life.

// Largest candidate that fits, same fitting rule the Nitro slot used: width
// within 90% of the screen, height within vertThresh of it. Later entries
// win, so order candidates smallest → largest. null = nothing fits.
function pickUnit(units, screenW, screenH, vertThresh) {
  let pick = null;
  for (const u of units) {
    if (u.w <= screenW * 0.9 && u.h <= screenH * vertThresh) pick = u;
  }
  return pick;
}

// Reusable Playwire slot. `units` maps a Playwire unit type to its pixel
// sizes ([{ type: "standard_iab_head1", w: 300, h: 250 }]); `selectorId` is
// the div id RAMP injects into — must be unique per mounted slot.
function PlaywireAd({
  units,
  selectorId,
  screenW,
  screenH,
  vertThresh = 0.3,
  showAdvertisementText = true,
}) {
  const [isClient, setIsClient] = useState(false); // false | true | "debug"
  const adDivRef = useRef(null);
  // Last unit that fit. Once set it keeps the slot's DOM alive through
  // "nothing fits" spells (window squeezed small): unmounting there would
  // destroy the unit, and the later re-add stalls — see the header note.
  // Idempotent render-time ref write, safe under concurrent re-renders.
  const lastPickedRef = useRef(null);

  useEffect(() => {
    // ?pwtest forces real injection on localhost (for wiring checks through
    // a tunnel or against house ads without deploying).
    const debug =
      window.location.hostname === "localhost" &&
      !window.location.search.includes("pwtest");
    setIsClient(debug ? "debug" : true);
  }, []);

  const picked = pickUnit(units, screenW, screenH, vertThresh);
  if (picked) lastPickedRef.current = picked;
  // `sizing` is what the box renders at; `activeType` is what the effect
  // binds — a STRING (fresh array literals from the parent never churn the
  // slot) and STICKY (falls back to the last fit, so a no-fit resize never
  // re-keys the effect into a destroy).
  const sizing = picked || lastPickedRef.current;
  const activeType = sizing ? sizing.type : null;

  useEffect(() => {
    if (!activeType || !isClient || isClient === "debug") return;

    // The add runs through ramp.que, which can fire long after mount (the
    // stack loads on first interaction). If the slot unmounted in the
    // meantime, the stale callback must not inject into a container that no
    // longer exists — and if the add never ran, the queued teardown below
    // skips its destroy too.
    let alive = true;
    let added = false;

    // NEVER destroy before adding (Aug 2 lesson): getUnits() lists
    // CONFIG-REGISTERED units, not just units on the page (web_interstitial
    // shows up without ever being added), so a "destroy stale first" pass
    // fires on every mount and its async slot teardown races the fresh add —
    // the tag div lands in the DOM but its GPT query never runs (no
    // data-google-query-id, adFetchCount 0, blank box). The 100ms defer is
    // the race insurance instead: anything just queued settles before this
    // add, and a mount that dies young cancels the timer and never touches
    // RAMP at all.
    const addTimer = setTimeout(() => {
      rampQue(() => {
        if (!alive) return;
        try {
          window.ramp.spaAddAds([{ type: activeType, selectorId }]);
          added = true;
          sendEvent(`ad_request_${activeType}`);
        } catch (e) {}
      });
    }, 100);

    return () => {
      alive = false;
      clearTimeout(addTimer);
      rampQue(() => {
        if (!added) return;
        try {
          // CK's teardown recipe: match live ids by substring, not equality.
          const ids = activeUnitIds(activeType);
          if (ids.length) window.ramp.destroyUnits(ids);
        } catch (e) {}
      });
      // destroyUnits removes RAMP's nodes; clear the container too so a
      // fresh mount in some future page life starts from a clean div.
      if (adDivRef.current) {
        try {
          adDivRef.current.innerHTML = "";
        } catch (e) {}
      }
    };
  }, [activeType, selectorId, isClient]);

  if (!isClient) return null;
  // Nothing has EVER fit — nothing is bound, rendering nothing is safe.
  if (!sizing) return null;

  return (
    <div
      className="playwire-ad-slot"
      style={{
        position: "relative",
        // Doesn't fit right now → hide, never unmount (header note). Hidden
        // isn't viewable, so the inViewOnly refresh pauses here too.
        display: picked ? "inline-block" : "none",
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
          height: sizing.h,
          width: sizing.w,
          textAlign: "center",
          position: "relative",
        }}
        id={selectorId}
        ref={adDivRef}
        // The unit is selector-based in the RAMP config
        // (selectorBasedIabUnits) — the data-pw-* markers are its native
        // binding path, spaAddAds' selectorId the API one. Carry both so
        // whichever path the config resolves through finds the container.
        data-pw-desk={activeType}
        data-pw-mobi={activeType}
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
              {sizing.w}x{sizing.h}
            </p>
            <p style={{ fontSize: "0.6em" }}>Unit: {sizing.type}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// home.js re-renders constantly during gameplay (it owns all game state) and
// the slot sits in its tree, hidden, the whole time. Everything the slot
// renders derives from these props, so a content-compare memo keeps the ad
// subtree out of every gameplay commit. `units` is a fresh literal each
// parent render — compare its entries, not its identity.
function propsEqual(a, b) {
  if (
    a.selectorId !== b.selectorId ||
    a.screenW !== b.screenW ||
    a.screenH !== b.screenH ||
    a.vertThresh !== b.vertThresh ||
    a.showAdvertisementText !== b.showAdvertisementText
  )
    return false;
  if (a.units === b.units) return true;
  if (!a.units || !b.units || a.units.length !== b.units.length) return false;
  for (let i = 0; i < a.units.length; i++) {
    if (
      a.units[i].type !== b.units[i].type ||
      a.units[i].w !== b.units[i].w ||
      a.units[i].h !== b.units[i].h
    )
      return false;
  }
  return true;
}

export default memo(PlaywireAd, propsEqual);
