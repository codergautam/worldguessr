import { useEffect, useState, useRef } from "react";
import sendEvent from "./utils/sendEvent";

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

export default function CrazyGamesBanner({
  types,
  id,
  vertThresh = 0.3,
  screenW,
  screenH,
}) {
  const [type, setType] = useState(
    findAdType(screenW, screenH, types, vertThresh)
  );
  const [isClient, setIsClient] = useState(false);
  const containerRef = useRef(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (window.location.hostname === "localhost") setIsClient("debug");
    else setIsClient(true);
  }, []);

  useEffect(() => {
    setType(findAdType(screenW, screenH, types, vertThresh));
  }, [screenW, screenH, JSON.stringify(types), vertThresh]);

  useEffect(() => {
    if (type === -1 || !isClient || isClient === "debug") return;
    if (!window.CrazyGames?.SDK?.banner) return;

    function requestBanner() {
      try {
        window.CrazyGames.SDK.banner.requestBanner({
          id: id,
          width: types[type][0],
          height: types[type][1],
        }).then(() => {
          if (!requestedRef.current) {
            sendEvent(`cg_banner_${types[type][0]}x${types[type][1]}`);
            requestedRef.current = true;
          }
        }).catch((e) => console.log("[CG Banner] Request error:", e.message || e));
      } catch (e) {
        console.log("[CG Banner] Request error:", e);
      }
    }

    // Initial request after short delay to ensure DOM is mounted
    const initTimer = setTimeout(requestBanner, 200);
    // Auto-refresh every 30 seconds
    const refreshInterval = setInterval(requestBanner, 30000);

    return () => {
      clearTimeout(initTimer);
      clearInterval(refreshInterval);
    };
  }, [type, isClient, id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (requestedRef.current && window.CrazyGames?.SDK?.banner) {
        try {
          window.CrazyGames.SDK.banner.clearBanner(id);
        } catch (e) {}
      }
    };
  }, [id]);

  if (type === -1) return null;
  if (!isClient) return null;

  return (
    <div
      ref={containerRef}
      id={id}
      style={{
        width: types[type][0],
        height: types[type][1],
        backgroundColor: isClient === "debug" ? "rgba(0,0,0,0.5)" : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isClient === "debug" && (
        <div style={{ color: "white", textAlign: "center" }}>
          <h3>CG Banner</h3>
          <p style={{ fontSize: "0.8em" }}>
            {types[type][0]}x{types[type][1]}
          </p>
        </div>
      )}
    </div>
  );
}
