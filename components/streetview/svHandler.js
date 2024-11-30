import React, { useState, useEffect, useRef } from "react";

const SvEmbedIframe = (params) => {
  const iframeRef = useRef(null);
  const [iframeSrc, setIframeSrc] = useState(`/svEmbed`);


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
    if (iframeRef.current) {
      iframeRef.current.contentWindow.postMessage({ type: "updateProps", props: passableParams }, "*");
    }
  };

  useEffect(() => {
    // reload iframe when lat or long changes
    console.log("lat or long changed", params.lat, params.long);
    setIframeSrc(`/svEmbed?nm=${params.nm}&npz=${params.npz}&showRoadLabels=${params.showRoadLabels}&lat=${params.lat}&long=${params.long}&showAnswer=${params.showAnswer}&hidden=false`);
  }, [params?.lat, params?.long]);

  useEffect(() => {
    sendMessageToIframe();

  }, [JSON.stringify(params)]);

  useEffect(() => {
    // listen to events from iframe (onLoad) call params.onLoad
    const handleMessage = (event) => {
      console.log("Received message from iframe", event.data);
      if (event.data && typeof event.data === "object" && event.data.type === "onLoad") {
        params.onLoad();
      }
    };

    if (typeof window !== "undefined") {
      window.onmessage = handleMessage;
    }
    return () => {
      window.onmessage = null;
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

  return (
    <div>
      <iframe
        ref={iframeRef}
        src={iframeSrc} // Dynamically update the iframe src
        width="100%"
        height="100%"
        className={`svframe ${params?.hidden ? "svhidden" : ""}`}
        style={{ border: "none", position: "fixed", top: 0, left: 0}}
        title="Street View Embed"
        frameBorder="0"
        onLoad={() => sendMessageToIframe()}
      ></iframe>
    </div>
  );
};

export default SvEmbedIframe;
