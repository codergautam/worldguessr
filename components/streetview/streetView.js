import React, { useEffect, useRef } from "react";

const StreetView = ({
  nm = false,
  npz = false,
  showRoadLabels = true,
  lat,
  long,
  panoId,
  heading,
  showAnswer = false,
  hidden = false,
  idle = false,
  slowEnter = false,
  refreshKey = 0,
  onLoad,
  onError,
}) => {
  const iframeRef = useRef(null);
  const previousKey = useRef(null);

  const buildSrc = () => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

    const view = panoId
      ? `pano=${encodeURIComponent(panoId)}`
      : `location=${lat},${long}`;
    const headingParam = heading !== null && heading !== undefined ? `&heading=${heading}` : '';
    return `https://www.google.com/maps/embed/v1/streetview?${view}&key=${key}&fov=100&language=en${headingParam}`;
  };

  useEffect(() => {
    if (!iframeRef.current || (!panoId && (lat == null || long == null))) return;
    const key = `${panoId || `${lat},${long}`}:${refreshKey}`;
    if (previousKey.current === key && iframeRef.current.getAttribute('src')) return;
    iframeRef.current.src = buildSrc();
    previousKey.current = key;
  }, [lat, long, panoId, heading, refreshKey]);

  if (!panoId && (lat == null || long == null)) return null;

  return (
    <iframe
      ref={iframeRef}
      className={`${(npz && nm && !showAnswer) ? 'nmpz' : ''} ${hidden ? "hidden" : ""} ${idle ? "sv-idle" : ""} ${slowEnter ? "streetview--duel-enter" : ""} streetview`}
      referrerPolicy="no-referrer-when-downgrade"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
      onLoad={() => onLoad?.()}
      onError={() => onError?.()}
      loading="eager"
      style={{
        width: "100vw",
        height: "calc(100vh + 300px)",
        zIndex: 100,
        transform: "translateY(-285px)",
        border: "none",
        backgroundColor: "#1a1a2e",
      }}
      id="streetview"
      title="Google Street View"
    />
  );
};

export default StreetView;
