import React, { useEffect, useRef, useState } from "react";
import fixBranding from "../utils/fixBranding";

const StreetView = ({
  nm = false,
  npz = false,
  showRoadLabels = true,
  lat,
  long,
  showAnswer = false,
  hidden = false,
  onLoad
}) => {


  useEffect(()=>{

    const originalAppendChild = Element.prototype.appendChild;

    // Override appendChild
    Element.prototype.appendChild = function (element) {
        if (element.tagName === 'SCRIPT' && element.src.includes('QuotaService.RecordEvent')) {
            return element; // Do not append the script
        }

        return originalAppendChild.call(this, element);
    };

    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
          for (const node of mutation.addedNodes) {
              if (
                  node.tagName === 'STYLE' &&
                  (node.getAttribute('nonce') === 'undefined') || (node.innerText.includes('.mapsConsumerUiSceneCoreScene__root') || (node.innerText.includes('.dismissButton')))
              ) {
                  node.parentNode.removeChild(node);
              }
          }
      }
    });
    // head
    observer.observe(document.head, { childList: true });
      return () => {
        Element.prototype.appendChild = originalAppendChild;
        observer.disconnect();
      }

      },[])

  const panoramaRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const googleMapsDivId = "googlemaps";

  // Helper to determine whether to use iframe or SDK
  const shouldUseEmbed = (showRoadLabels && ((!nm && !npz) || (nm && npz)));

  // Reload location logic
  const reloadLocation = () => {
    if (shouldUseEmbed) {
      const iframe = document.getElementById("streetview");
      if (iframe) iframe.src = iframe.src;
    } else {
      if (panoramaRef.current) {
        panoramaRef.current.setVisible(false);
        panoramaRef.current = null; // Destroy old instance
      }
      initPanorama(); // Reinitialize the SDK instance
    }
  };
  if(typeof window !== 'undefined')  window.reloadLoc = reloadLocation;

  // Cleanup meta tags
  const cleanMetaTags = () => {
    const metaTags = document.querySelectorAll('meta[http-equiv="origin-trial"]');
    metaTags.forEach((meta) => meta.remove());

    fixBranding();

    setTimeout(() => {
      fixBranding();
    }, 1000);

  };

  // Initialize Google Maps SDK panorama
  const initPanorama = () => {
    if (!lat || !long || !document.getElementById(googleMapsDivId)) return;

    panoramaRef.current = new google.maps.StreetViewPanorama(
      document.getElementById(googleMapsDivId),
      {
        position: { lat, lng: long },
        pov: { heading: 0, pitch: 0 },
        zoom: 0,
        motionTracking: false,
        linksControl: !(nm && !showAnswer),
        clickToGo: !(nm && !showAnswer),
        panControl: !(npz && !showAnswer),
        zoomControl: !(npz && !showAnswer),
        showRoadLabels: showRoadLabels,
        disableDefaultUI: true,
      }
    );

    setTimeout(() => {
      panoramaRef.current.setPov(panoramaRef.current.getPhotographerPov());
      panoramaRef.current.setZoom(0);
    }, 100);
      onLoad();

    panoramaRef.current.addListener("pano_changed", () => {
      setLoading(false);
      cleanMetaTags();
    });

    panoramaRef.current.addListener("position_changed", () => {
      const pos = panoramaRef.current.getPosition();
      const curLat = pos.lat();
      const curLng = pos.lng();

      if(nm && !showAnswer && curLat !== lat && curLng !== long) {
        // If NM is enabled and position changed, move back to original position
        panoramaRef.current.setPosition({ lat, lng: long });
      }
    });

  };

  // Main useEffect for handling embed or SDK
  useEffect(() => {
    setLoading(true);

    if (shouldUseEmbed) {
      // Clean up the panorama if switching to embed
      if (panoramaRef.current) {
        panoramaRef.current.setVisible(false);
        panoramaRef.current = null;
      }
    } else {
      // Initialize SDK panorama
      initPanorama();
    }

    return () => {
      if (panoramaRef.current) {
        google.maps.event.clearListeners(panoramaRef.current, "pano_changed");
        google.maps.event.clearListeners(panoramaRef.current, "position_changed");
        panoramaRef.current.setVisible(false);
        panoramaRef.current = null;
      }
    };
  }, [lat, long, nm, npz, showRoadLabels, shouldUseEmbed]);

  useEffect(() => {
    if(showAnswer) {
    if(!shouldUseEmbed) {
      // nm,npz off temporarily
      console.log("temporarily disabling nm,npz");
        panoramaRef.current.setOptions({
          linksControl: true,
          clickToGo: true,
          panControl: false,
          zoomControl: false,
        });
      }
  }
  }, [showAnswer]);

  if(!lat && !long) {
    return null;
  }


  return shouldUseEmbed ? (
    <iframe
  className={`${(npz && nm && !showAnswer) ? 'nmpz' : ''} ${hidden ? "hidden" : ""} streetview`}
  src={`https://www.google.com/maps/embed/v1/streetview?location=${lat},${long}&key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&fov=100&language=iw`}
  referrerPolicy="no-referrer-when-downgrade"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
  onLoad={() => {
    setLoading(false);
      if (onLoad && lat && long) {
        onLoad(); // Ensure onLoad is called after 500ms delay
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

  ) : (
    <div
      id={googleMapsDivId}
      className={`streetview inverted ${(loading||hidden) ? "hidden" : ""}
      ${(npz&&!showAnswer) ? 'nmpz' : ''}
      `}
    ></div>
  );
};

export default StreetView;
