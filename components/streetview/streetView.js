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
      const headingParam = (heading !== null && heading !== undefined) ? `&heading=${heading}` : '';
      const pitchParam = (false && pitch !== null && pitch !== undefined) ? `&pitch=${pitch}` : '';
      const newSrc = `https://www.google.com/maps/embed/v1/streetview?location=${lat},${long}&key=AIzaSyA_t5gb2Mn37dZjhsaJ4F-OPp1PWDxqZyI&fov=100&language=en${headingParam}${pitchParam}`;

      const locationKey = `${lat}-${long}-${panoId}`;
      const locationChanged = prevLocationRef.current !== null && prevLocationRef.current !== locationKey;
      const refreshKeyChanged = prevRefreshKeyRef.current !== refreshKey;

      // Update if location changed, refreshKey changed, or first time
      if (locationChanged || refreshKeyChanged || !prevLocationRef.current) {
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

  // panoId path intentionally disabled — game resolves panoramas by lat/lng.
  return (
    <iframe
      ref={iframeRef}
      className={`${(npz && nm && !showAnswer) ? 'nmpz' : ''} ${hidden ? "hidden" : ""} streetview`}
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
        zIndex: 100,
        transform: "translateY(-285px)",
        border: "none",
        backgroundColor: "#1a1a2e", // Dark background to prevent white flash during loading
      }}
      id="streetview"
    />
  );
};

export default StreetView;