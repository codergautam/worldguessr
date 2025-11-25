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
  onLoad
}) => {
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef(null);
  const prevLocationRef = useRef(null);

  // Reset loading state when location changes
  useEffect(() => {
    setLoading(true);
  }, [lat, long, panoId]);

  // Update iframe src when location changes
  useEffect(() => {
    if (iframeRef.current && (lat && long || panoId)) {
      const newSrc = panoId ?
        `https://www.google.com/maps/embed/v1/streetview?pano=${panoId}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=100&language=iw${heading !== null ? `&heading=${heading}` : ''}${pitch !== null ? `&pitch=${pitch}` : ''}` :
        `https://www.google.com/maps/embed/v1/streetview?location=${lat},${long}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=100&language=iw${heading !== null ? `&heading=${heading}` : ''}${pitch !== null ? `&pitch=${pitch}` : ''}`;

      // Track location changes using a simple string key to avoid URL comparison issues
      const locationKey = `${lat}-${long}-${panoId}`;
      const locationChanged = prevLocationRef.current !== null && prevLocationRef.current !== locationKey;

      // Update if location changed OR if this is the first time we have a location
      if (locationChanged || !prevLocationRef.current) {
        setLoading(true);
        // Force reload by setting src directly on the DOM element
        iframeRef.current.src = newSrc;
      }
      prevLocationRef.current = locationKey;
    }
  }, [lat, long, panoId, heading, pitch]);

  // Reload location logic
  const reloadLocation = () => {
    const iframe = document.getElementById("streetview");
    if (iframe) iframe.src = iframe.src;
  };
  if(typeof window !== 'undefined')  window.reloadLoc = reloadLocation;

  if((!lat || !long) && !panoId) {
    return null;
  }

  const iframeSrc = panoId ?
    `https://www.google.com/maps/embed/v1/streetview?pano=${panoId}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=100&language=iw${heading !== null ? `&heading=${heading}` : ''}${pitch !== null ? `&pitch=${pitch}` : ''}` :
    `https://www.google.com/maps/embed/v1/streetview?location=${lat},${long}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=100&language=iw${heading !== null ? `&heading=${heading}` : ''}${pitch !== null ? `&pitch=${pitch}` : ''}`;

  return (
    <iframe
      ref={iframeRef}
      className={`${(npz && nm && !showAnswer) ? 'nmpz' : ''} ${hidden ? "hidden" : ""} streetview`}
      src={iframeSrc}
      referrerPolicy="no-referrer-when-downgrade"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
      onLoad={() => {
        setLoading(false);
        if (onLoad && (lat && long || panoId)) {
          onLoad();
        }
      }}
      style={{
        width: "100vw",
        height: "calc(100vh + 300px)",
        zIndex: 100,
        transform: "translateY(-285px)",
      }}
      id="streetview"
    />
  );
};

export default StreetView;
