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
  const iframeRef = useRef(null);
  const prevLocationRef = useRef(null);
  const prevRefreshKeyRef = useRef(refreshKey);

  // Reset loading state when location changes
  useEffect(() => {
    setLoading(true);
  }, [lat, long, panoId]);

  // Update iframe src when location or refreshKey changes
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
    <iframe
      ref={iframeRef}
      className={`${(npz && nm && !showAnswer) ? 'nmpz' : ''} ${hidden ? "hidden" : ""} streetview`}
      src={iframeSrc}
      referrerPolicy="no-referrer-when-downgrade"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
      onLoad={() => {
        if (window.googleMapsIframeStartTime) {
          console.log(`[PERF] StreetView: Google Maps iframe loaded in ${(performance.now() - window.googleMapsIframeStartTime).toFixed(2)}ms`);
        }
        setLoading(false);
        if (onLoad && (lat && long || panoId)) {
          onLoad();
        }
      }}
      loading="lazy"
      style={{
        width: "100vw",
        height: "calc(100vh + 300px)",
        zIndex: 100,
        transform: "translateY(-285px)",
        border: "none",
      }}
      id="streetview"
    />
  );
};

export default StreetView;
