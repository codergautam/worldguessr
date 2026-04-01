import React, { useState, useEffect } from "react";
import StreetView from "../components/streetview/streetView";
import Head from "next/head";

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
        lat: parseFloat(searchParams.get("lat")),
        long: parseFloat(searchParams.get("long")),
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
        // Use functional update to avoid stale closure
        setProps(prev => ({ ...prev, ...event.data.props }));
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
