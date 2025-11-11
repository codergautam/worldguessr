import React, { useState } from "react";

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

  // Reload location logic
  const reloadLocation = () => {
    const iframe = document.getElementById("streetview");
    if (iframe) iframe.src = iframe.src;
  };
  if(typeof window !== 'undefined')  window.reloadLoc = reloadLocation;

  if((!lat || !long) && !panoId) {
    return null;
  }

  return (
    <iframe
      className={`${(npz && nm && !showAnswer) ? 'nmpz' : ''} ${hidden ? "hidden" : ""} streetview`}
      src={panoId ?
        `https://www.google.com/maps/embed/v1/streetview?pano=${panoId}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=100&language=iw${heading !== null ? `&heading=${heading}` : ''}${pitch !== null ? `&pitch=${pitch}` : ''}` :
        `https://www.google.com/maps/embed/v1/streetview?location=${lat},${long}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=100&language=iw${heading !== null ? `&heading=${heading}` : ''}${pitch !== null ? `&pitch=${pitch}` : ''}`
      }
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
