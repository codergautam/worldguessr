import React, { useState, useEffect, useRef } from "react";

const SvEmbedIframe = (params) => {
  const iframeRef = useRef(null);
  const [iframeSrc, setIframeSrc] = useState(null);


  // Function to send updated params via postMessage to the iframe
  const sendMessageToIframe = () => {
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
  };

  useEffect(() => {
    console.log("SvEmbedIframe params changed", params);
    // reload iframe when lat or long changes
    // console.log("lat or long changed", params.lat, params.long);
    // Only use panoId if we have proper heading/pitch data, otherwise fall back to lat/lng
    const shouldUsePanoId = params.panoId && (params.heading !== null && params.heading !== undefined) && (params.pitch !== null && params.pitch !== undefined);
    const panoParam = shouldUsePanoId ? `&pano=${params.panoId}` : '';
    const headingParam = shouldUsePanoId ? `&heading=${params.heading}` : '';
    const pitchParam = shouldUsePanoId ? `&pitch=${params.pitch}` : '';
    setIframeSrc(`/svEmbed?nm=${params.nm}&npz=${params.npz}&showRoadLabels=${params.showRoadLabels}&lat=${params.lat}&long=${params.long}${panoParam}${headingParam}${pitchParam}&showAnswer=${params.showAnswer}&hidden=false`);
  }, [params?.lat, params?.long, params?.panoId, params?.heading, params?.pitch]);

  useEffect(() => {
    sendMessageToIframe();

  }, [JSON.stringify(params)]);

  useEffect(() => {
    // listen to events from iframe (onLoad) call params.onLoad
    const handleMessage = (event) => {
      // Only handle messages from our Street View iframe, ignore AdSense/Google messages
      if (!event.origin.includes(window.location.origin) && !event.origin.includes('/svEmbed')) {
        console.log("Ignoring message from external origin:", event.origin, event.data);
        return;
      }
      
      console.log("Received message from iframe", event.data);
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



  if(!params.lat && !params.long) {
    return null;
  }

  if(!iframeSrc) {
    return null;
  }

  // Completely remove iframe from DOM when hidden (prevents AdSense interference)
  if(params?.hidden) {
    return <div style={{ border: "none", position: "fixed", top: 0, left: 0, width: "100%", height: "100%" }}></div>;
  }

  return (
    <div>
      <iframe
        ref={iframeRef}
        src={iframeSrc} // Dynamically update the iframe src
        width="100%"
        height="100%"
        className="svframe"
        style={{ border: "none", position: "fixed", top: 0, left: 0}}
        title="Street View Embed"
        frameBorder="0"
        onLoad={() => sendMessageToIframe()}
      ></iframe>
    </div>
  );
};

export default SvEmbedIframe;
