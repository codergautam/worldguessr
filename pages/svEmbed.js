import React, { useState, useEffect } from "react";
import StreetView from "../components/streetview/streetView";
import Head from "next/head";
import { decodeCoord } from "../components/streetview/coordsObfuscation";

const SvEmbed = () => {
  const [props, setProps] = useState({
    nm: false,
    npz: false,
    showRoadLabels: true,
    lat: null,
    long: null,
    panoId: null,
    heading: null,
    pitch: null,
    showAnswer: false,
    hidden: false,
  });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      setProps({
        nm: searchParams.get("nm") === "true",
        npz: searchParams.get("npz") === "true",
        showRoadLabels: searchParams.get("showRoadLabels") !== "false",
        // Decode obfuscated coordinates; fall back to plain lat/long for backwards compatibility
        lat: decodeCoord(searchParams.get("_elat")) ?? parseFloat(searchParams.get("lat")),
        long: decodeCoord(searchParams.get("_elon")) ?? parseFloat(searchParams.get("long")),
        panoId: searchParams.get("pano") || searchParams.get("panoId"),
        heading: searchParams.get("heading") ? parseFloat(searchParams.get("heading")) : null,
        pitch: searchParams.get("pitch") ? parseFloat(searchParams.get("pitch")) : null,
        showAnswer: searchParams.get("showAnswer") === "true",
        hidden: searchParams.get("hidden") === "true",
      });
    }
  }, []);

  // PostMessage listener to update props dynamically
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && typeof event.data === "object" && event.data.type === "updateProps") {
        const incoming = { ...event.data.props };
        // Decode obfuscated coordinates sent via postMessage
        if (incoming._elat !== undefined) {
          incoming.lat = decodeCoord(incoming._elat);
          delete incoming._elat;
        }
        if (incoming._elon !== undefined) {
          incoming.long = decodeCoord(incoming._elon);
          delete incoming._elon;
        }
        // Use functional update to avoid stale closure
        setProps(prev => ({ ...prev, ...incoming }));
        // Increment refreshKey to force StreetView update even with same coords
        setRefreshKey(k => k + 1);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("message", handleMessage);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("message", handleMessage);
      }
    };
  }, []);

  return (
    <>
    <Head>
    {/* <script
      src="https://maps.googleapis.com/maps/api/js?v=weekly"
      defer
    ></script> */}

    </Head>
    <StreetView
      nm={props.nm}
      npz={props.npz}
      showRoadLabels={props.showRoadLabels}
      lat={props.lat}
      long={props.long}
      panoId={props.panoId}
      heading={props.heading}
      pitch={props.pitch}
      showAnswer={props.showAnswer}
      hidden={props.hidden}
      refreshKey={refreshKey}
      onLoad={() => {
        // send to parent window that the iframe has loaded
        if (typeof window !== "undefined") {
          window.parent.postMessage({ type: "onLoad" }, "*");
        }
      }}
    />
    </>
  );
};

export default SvEmbed;
