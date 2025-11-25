import React, { useState, useEffect, useRef, useCallback } from "react";

const SvEmbedIframe = (params) => {
  const iframeRef = useRef(null);
  const [iframeSrc, setIframeSrc] = useState(null);
  const [fadeClass, setFadeClass] = useState("svframe-fade-in");
  const prevLocationRef = useRef(null);

  // Function to send updated params via postMessage to the iframe
  const sendMessageToIframe = useCallback(() => {
    let passableParams = {
      nm: params.nm,
      npz: params.npz,
      showRoadLabels: params.showRoadLabels ,
      lat: params.lat || null,
      long: params.long || null,
      showAnswer: params.showAnswer || false,
      hidden: false, onLoad: undefined };

    // Only include panoId, heading, pitch if we have complete data
    const shouldUsePanoId = params.panoId && (params.heading !== null && params.heading !== undefined) && (params.pitch !== null && params.pitch !== undefined);
    if (shouldUsePanoId) {
      passableParams.panoId = params.panoId;
      passableParams.heading = params.heading;
      passableParams.pitch = params.pitch;
    }
    if (iframeRef.current) {
      iframeRef.current.contentWindow.postMessage({ type: "updateProps", props: passableParams }, "*");
    }
  }, [params.nm, params.npz, params.showRoadLabels, params.lat, params.long, params.panoId, params.heading, params.pitch, params.showAnswer]);

  // Set iframe src only once initially when we first have lat/long
  useEffect(() => {
    if (!iframeSrc && params.lat && params.long) {
      // Only use panoId if we have proper heading/pitch data, otherwise fall back to lat/lng. Update: disable panoId entirely
      const shouldUsePanoId = false && params.panoId && (params.heading !== null && params.heading !== undefined) && (params.pitch !== null && params.pitch !== undefined);
      const panoParam = shouldUsePanoId ? `&pano=${params.panoId}` : '';
      const headingParam = shouldUsePanoId ? `&heading=${params.heading}` : '';
      const pitchParam = shouldUsePanoId ? `&pitch=${params.pitch}` : '';
      setIframeSrc(`/svEmbed?nm=${params.nm}&npz=${params.npz}&showRoadLabels=${params.showRoadLabels}&lat=${params.lat}&long=${params.long}${panoParam}${headingParam}${pitchParam}&showAnswer=${params.showAnswer}&hidden=false`);
    }
  }, [params?.lat, params?.long, params?.panoId, params?.heading, params?.pitch, params?.nm, params?.npz, params?.showRoadLabels, params?.showAnswer]);

  // Send postMessage for all prop updates (including location changes)
  useEffect(() => {
    // Only send message if we have valid coordinates
    if (iframeSrc && iframeRef.current && params.lat && params.long) {
      sendMessageToIframe();
    }
  }, [iframeSrc, sendMessageToIframe, params.lat, params.long]);

  useEffect(() => {
    // listen to events from iframe (onLoad) call params.onLoad
    const handleMessage = (event) => {
      // console.log("Received message from iframe", event.data);
      if (event.data && typeof event.data === "object" && event.data.type === "onLoad") {
        params.onLoad();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("message", handleMessage);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("message", handleMessage);
      }
    }
  }, []);

    // Watch for window.reloadLoc to reload the iframe
    useEffect(() => {
      window.reloadLoc = () => {
        if (iframeRef.current) {
          // Force reload by changing iframe src
          iframeRef.current.src = iframeRef.current.src;
        }
      }
      return () => {
        window.reloadLoc = null;
      }

    }, [JSON.stringify(params)]);



  // Handle fade transitions when location changes
  useEffect(() => {
    if (!params.lat || !params.long) return;

    const currentLocation = `${params.lat}-${params.long}-${params.panoId}`;
    if (prevLocationRef.current && prevLocationRef.current !== currentLocation) {
      // Fade out
      setFadeClass("svframe-fade-out");
      // After fade out completes, update location and fade in
      setTimeout(() => {
        setFadeClass("svframe-fade-in");
      }, 500); // Match transition duration
    } else if (!prevLocationRef.current) {
      // Initial load
      setFadeClass("svframe-fade-in");
    }
    prevLocationRef.current = currentLocation;
  }, [params?.lat, params?.long, params?.panoId]);

  // Don't unmount iframe when lat/long is temporarily null (during map changes)
  // This keeps the iframe loaded so postMessage can update it
  // Only return null if we've never had a valid iframeSrc
  if(!iframeSrc) {
    return null;
  }

  return (
    <div>
      <iframe
        ref={iframeRef}
        src={iframeSrc} // Dynamically update the iframe src
        width="100%"
        height="100%"
        className={`svframe ${params?.hidden ? "svhidden" : ""} ${fadeClass}`}
        style={{ border: "none", position: "fixed", top: 0, left: 0}}
        title="Street View Embed"
        frameBorder="0"
        onLoad={() => {
          // Only send message if we have valid coordinates
          if (params.lat && params.long) {
            sendMessageToIframe();
          }
        }}
      ></iframe>
    </div>
  );
};

export default SvEmbedIframe;
