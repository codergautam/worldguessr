import React, { useState, useEffect, useRef } from "react";

const StreetView = ({
  nm = false,
  npz = false,
  showRoadLabels = true,
  lat,
  long,
  panoId,
  heading,
  pitch,
  showAnswer = false,
  hidden = false,
  refreshKey = 0,
  onLoad
}) => {
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const iframeRef = useRef(null);
  const prevLocationRef = useRef(null);
  const prevRefreshKeyRef = useRef(refreshKey);

  // Update iframe src when location or refreshKey changes
  // DON'T reset hasLoaded - keep showing old content until new loads
  useEffect(() => {
    if (iframeRef.current && (lat && long || panoId)) {
      const newSrc = `https://www.google.com/maps/embed/v1/streetview?location=${lat},${long}&key=AIzaSyA_t5gb2Mn37dZjhsaJ4F-OPp1PWDxqZyI&fov=100&language=en`;

      const locationKey = `${lat}-${long}-${panoId}`;
      const locationChanged = prevLocationRef.current !== null && prevLocationRef.current !== locationKey;
      const refreshKeyChanged = prevRefreshKeyRef.current !== refreshKey;

      // Update if location changed, refreshKey changed, or first time
      if (locationChanged || refreshKeyChanged || !prevLocationRef.current) {
        console.log(`[PERF] StreetView: Setting Google Maps iframe src for lat=${lat}, long=${long}`);
        window.googleMapsIframeStartTime = performance.now();
        setLoading(true);
        setHasLoaded(false); // Hide iframe (black bg shows), then fade in when loaded
        iframeRef.current.src = newSrc;
      }
      prevLocationRef.current = locationKey;
      prevRefreshKeyRef.current = refreshKey;
    }
  }, [lat, long, panoId, heading, pitch, refreshKey]);

  // Reload location logic
  const reloadLocation = () => {
    const iframe = document.getElementById("streetview");
    if (iframe) iframe.src = iframe.src;
  };
  if(typeof window !== 'undefined')  window.reloadLoc = reloadLocation;

  if((!lat || !long) && !panoId) {
    return null;
  }

  // const iframeSrc = panoId ?
  //   `https://www.google.com/maps/embed/v1/streetview?pano=${panoId}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=100&language=iw${heading !== null ? `&heading=${heading}` : ''}${pitch !== null ? `&pitch=${pitch}` : ''}` :
  //   `https://www.google.com/maps/embed/v1/streetview?location=${lat},${long}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=100&language=iw${heading !== null ? `&heading=${heading}` : ''}${pitch !== null ? `&pitch=${pitch}` : ''}`;

  // disable panoId
  const iframeSrc = `https://www.google.com/maps/embed/v1/streetview?location=${lat},${long}&key=AIzaSyA_t5gb2Mn37dZjhsaJ4F-OPp1PWDxqZyI&fov=100&language=en`;

  return (
    <div style={{
      position: "absolute",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      backgroundColor: "#000",
      zIndex: 100,
      overflow: "hidden",
      visibility: hidden ? "hidden" : "visible",
    }}>
      <iframe
        ref={iframeRef}
        className={`${(npz && nm && !showAnswer) ? 'nmpz' : ''} streetview`}
        src={iframeSrc}
        referrerPolicy="no-referrer-when-downgrade"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
        onLoad={() => {
          if (window.googleMapsIframeStartTime) {
            console.log(`[PERF] StreetView: Google Maps iframe loaded in ${(performance.now() - window.googleMapsIframeStartTime).toFixed(2)}ms`);
          }
          setLoading(false);
          setHasLoaded(true);
          if (onLoad && (lat && long || panoId)) {
            onLoad();
          }
        }}
        loading="eager"
        style={{
          width: "100vw",
          height: "calc(100vh + 300px)",
          transform: "translateY(-285px)",
          border: "none",
          opacity: hasLoaded ? 1 : 0,
          transition: "opacity 0.15s ease-out",
          pointerEvents: hasLoaded ? "auto" : "none",
        }}
        id="streetview"
      />
    </div>
  );
};

export default StreetView;
