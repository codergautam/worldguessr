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

export default function GameDistributionBanner({
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

  useEffect(() => {
    if (window.location.hostname === "localhost") setIsClient("debug");
    else setIsClient(true);
  }, []);

  useEffect(() => {
    setType(findAdType(screenW, screenH, types, vertThresh));
  }, [screenW, screenH, JSON.stringify(types), vertThresh]);

  useEffect(() => {
    if (type === -1 || !isClient || isClient === "debug") return;
    if (typeof gdsdk === "undefined" || typeof gdsdk.showAd === "undefined") return;

    function requestBanner() {
      try {
        gdsdk
          .showAd(gdsdk.AdType.Display, { containerId: id })
          .then(() => {
            sendEvent(`gd_banner_${types[type][0]}x${types[type][1]}`);
          })
          .catch((e) => console.log("[GD Banner] Request error:", e));
      } catch (e) {
        console.log("[GD Banner] Request error:", e);
      }
    }

    const initTimer = setTimeout(requestBanner, 200);
    const refreshInterval = setInterval(requestBanner, 30000);

    return () => {
      clearTimeout(initTimer);
      clearInterval(refreshInterval);
    };
  }, [type, isClient, id]);

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
          <h3>GD Banner</h3>
          <p style={{ fontSize: "0.8em" }}>
            {types[type][0]}x{types[type][1]}
          </p>
        </div>
      )}
    </div>
  );
}
