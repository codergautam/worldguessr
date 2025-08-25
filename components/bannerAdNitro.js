import { useEffect, useState, useRef } from "react";
import useWindowDimensions from "./useWindowDimensions";
import sendEvent from "./utils/sendEvent";

const AD_REFRESH_SEC = 30; // refresh ad every 30 seconds (NitroPay uses seconds)

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
}) {
  const [type, setType] = useState(
    findAdType(screenW, screenH, types, vertThresh)
  );
  const [isClient, setIsClient] = useState(false);
  const adDivRef = useRef(null);

  useEffect(() => {
    if (window.location.hostname === "localhost") setIsClient("debug");
    else setIsClient(true);
  }, []);

  useEffect(() => {
    setType(findAdType(screenW, screenH, types, vertThresh));
  }, [screenW, screenH, JSON.stringify(types), vertThresh]);

  // NitroPay ad management
  useEffect(() => {
    if (type === -1 || !isClient || isClient === "debug") return;

    const config = {
      refreshTime: AD_REFRESH_SEC,
      renderVisibleOnly: true,
      "report": {
        "enabled": true,
        "icon": true,
        "wording": "Report Ad",
        "position": "top-right"
      },
      // demo: isClient === "debug",
      // sizes: [[types[type][0], types[type][1]]], update: instead of only choosing the best size, include the sizes that are smaller than the best (both width and height)
      sizes: types
        .filter((t) => t[0] <= types[type][0] && t[1] <= types[type][1])
        .map((t) => [t[0], t[1]]),
      report: {
        load: () => {
          sendEvent(`ad_request_${types[type][0]}x${types[type][1]}_${unit}`);
        },
        // Add other analytics hooks as needed
      },
    };

    window.nitroAds.createAd(unit, config);

    return () => {
      // window.nitroAds.destroy(unit);
    };
  }, [type, isClient, unit]);

  if (type === -1) return null;
  if (!isClient) return null;

  return (
    <div
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
          backgroundColor: "rgba(0,0,0,0.5)",
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
                backgroundColor: `rgba(0, 0, 0, ${isClient === "debug"?0.5:0})`,
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