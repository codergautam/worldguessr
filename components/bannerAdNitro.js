import { useEffect, useState, useRef } from "react";
import useWindowDimensions from "./useWindowDimensions";
import sendEvent from "./utils/sendEvent";

const AD_REFRESH_SEC = 30; // refresh ad every 30 seconds (NitroPay uses seconds)
// Creatives leak inside NitroPay's iframes on every refresh (detached
// documents/video/canvas the vendor code never releases), so a long-lived slot
// grows without bound — a tab left on the home menu for hours climbs into the
// GBs. Recycling the slot (destroy + recreate) makes that garbage collectable;
// refreshes continue uninterrupted and memory sawtooths instead of climbing.
const SLOT_RECYCLE_MS = 10 * 60 * 1000;

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

export default function Ad({
  types,
  unit,
  vertThresh = 0.3,
  screenW,
  screenH,
  showAdvertisementText = true,
  position = "top-right"
}) {
  const [type, setType] = useState(
    findAdType(screenW, screenH, types, vertThresh)
  );
  const [isClient, setIsClient] = useState(false);
  const adDivRef = useRef(null);
  // Bumped on a timer to force the createAd effect through its cleanup
  // (destroyAll + container clear) and back — see SLOT_RECYCLE_MS.
  const [slotEpoch, setSlotEpoch] = useState(0);

  useEffect(() => {
    if (window.location.hostname === "localhost") setIsClient("debug");
    else setIsClient(true);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setSlotEpoch((e) => e + 1), SLOT_RECYCLE_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setType(findAdType(screenW, screenH, types, vertThresh));
  }, [screenW, screenH, JSON.stringify(types), vertThresh]);

  // NitroPay ad management
  // Dep on the actual chosen size (w,h) — not just `type` index — so a resize
  // that swaps types (e.g. [[728,90]] → [[320,50]]) still tears down and
  // recreates the ad even when the index stays 0. Without this, NitroPay
  // keeps the old creative loaded inside a div that's now sized differently.
  const chosenW = type === -1 ? null : types[type]?.[0];
  const chosenH = type === -1 ? null : types[type]?.[1];
  useEffect(() => {
    if (type === -1 || !isClient || isClient === "debug") return;
    if (chosenW == null || chosenH == null) return;

    const config = {
      refreshTime: AD_REFRESH_SEC,
      renderVisibleOnly: true,
      // renderVisibleOnly only delays the FIRST render until in-viewport;
      // refreshVisibleOnly is what pauses the refresh timer while the ad
      // isn't visible (hidden/background tab, scrolled off-screen). Without
      // it a backgrounded tab keeps reloading creatives every 30s forever.
      refreshVisibleOnly: true,
      "report": {
        "enabled": true,
        "icon": false,
        "wording": "Report Ad",
        "position": position,
        "load": () => {
          sendEvent(`ad_request_${chosenW}x${chosenH}_${unit}`);
        },
      },
      // demo: isClient === "debug",
      sizes: types
        .filter((t) => t[0] <= chosenW && t[1] <= chosenH)
        .map((t) => [t[0], t[1]]),
    };

    let cancelled = false;
    let resolvedAds = null; // NitroAd | NitroAd[] | null

    // createAd can return: NitroAd | Promise<NitroAd> | Promise<NitroAd[]> | null
    const destroyAll = (ads) => {
      if (!ads) return;
      const list = Array.isArray(ads) ? ads : [ads];
      for (const ad of list) {
        try { ad?.onNavigate?.(); } catch (e) {}
      }
    };

    try {
      const result = window.nitroAds.createAd(unit, config);
      if (result && typeof result.then === "function") {
        result
          .then((ads) => {
            if (cancelled) destroyAll(ads);
            else resolvedAds = ads;
          })
          .catch(() => {});
      } else {
        resolvedAds = result;
      }
    } catch (error) {
      console.error("Error creating Nitro ad:", error);
    }

    return () => {
      cancelled = true;
      destroyAll(resolvedAds);
      // Clear the slot's DOM so NitroPay's next createAd paints into a clean
      // container and doesn't stack iframes from the previous size.
      if (adDivRef.current) {
        try { adDivRef.current.innerHTML = ""; } catch (e) {}
      }
    };
  }, [chosenW, chosenH, isClient, unit, slotEpoch]);

  if (type === -1 || !types[type]) return null;
  if (!isClient) return null;

  return (
    <div
      className="nitro-ad-slot"
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
          height: types[type][1],
          width: types[type][0],
          textAlign: "center",
          position: "relative",
        }}
        id={unit}
        ref={adDivRef}
      >
        {isClient === "debug" && (
          <>
            <div
              style={{
                position: "absolute",
                bottom: "10px",
                left: "0",
                width: "100%",
                color: "white",
                zIndex: 2,
                backgroundColor: `rgba(0, 0, 0, 0.5)`
              }}
            >
              <h3>Banner Ad Here (Nitro)</h3>
              <p style={{ fontSize: "0.8em" }}>
                {/* Ad size: {types[type][0]}x{types[type][1]} */}
                Ad sizes: { types
        .filter((t) => t[0] <= types[type][0] && t[1] <= types[type][1]).map((t) => `${t[0]}x${t[1]}`).join(", ") }
              </p>
              <p style={{ fontSize: "0.6em" }}>Unit: {unit}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}