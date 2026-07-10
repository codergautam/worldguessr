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

  const buildSrc = () => {
    const headingParam = (heading !== null && heading !== undefined) ? `&heading=${heading}` : '';
    const pitchParam = (false && pitch !== null && pitch !== undefined) ? `&pitch=${pitch}` : '';
    return `https://www.google.com/maps/embed/v1/streetview?location=${lat},${long}&key=AIzaSyA_t5gb2Mn37dZjhsaJ4F-OPp1PWDxqZyI&fov=100&language=en${headingParam}${pitchParam}`;
  };

  // Update iframe src when location or refreshKey changes
  // DON'T reset hasLoaded - keep showing old content until new loads
  useEffect(() => {
    if (iframeRef.current && (lat && long || panoId)) {
      const locationKey = `${lat}-${long}-${panoId}`;
      const locationChanged = prevLocationRef.current !== null && prevLocationRef.current !== locationKey;
      const refreshKeyChanged = prevRefreshKeyRef.current !== refreshKey;
      // A src-less element means the iframe was recreated while the location
      // refs survived (lat/long blipped null — the null render below tears
      // the DOM down but not this component instance — then the SAME
      // location came back, so the key comparison alone would skip). An
      // unset src is never valid: it reads back as "" and any reassignment
      // navigates the frame to the site itself (same-origin self-embed →
      // duplicate WS → 'uac' kick).
      const srcMissing = !iframeRef.current.getAttribute('src');

      // Update if location changed, refreshKey changed, or first time
      if (locationChanged || refreshKeyChanged || !prevLocationRef.current || srcMissing) {
        window.googleMapsIframeStartTime = performance.now();
        setLoading(true);
        setHasLoaded(false); // Hide iframe (black bg shows), then fade in when loaded
        iframeRef.current.src = buildSrc();
      }
      prevLocationRef.current = locationKey;
      prevRefreshKeyRef.current = refreshKey;
    }
  }, [lat, long, panoId, heading, pitch, refreshKey]);

  // Reload location logic. NEVER self-assign an empty src: iframe.src reads
  // back "" when unset, and assigning "" resolves against the page's base
  // URL — the pano frame would load worldguessr inside itself, whose copy
  // opens a second WS on the same account and gets the real tab uac-kicked.
  const reloadLocation = () => {
    const iframe = document.getElementById("streetview");
    if (!iframe) return;
    const cur = iframe.getAttribute('src');
    if (cur) {
      iframe.src = cur;
    } else if ((lat && long) || panoId) {
      // Recover a src-less frame instead of reloading "nothing".
      iframe.src = buildSrc();
    }
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