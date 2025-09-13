import React, { useEffect, useRef, useState } from "react";
import fixBranding from "../utils/fixBranding";

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

  const lastZoomlog = useRef(null);
  const lastPovlog = useRef(null);
  // Add debounce timers and data refs
  const zoomDebounceTimer = useRef(null);
  const povDebounceTimer = useRef(null);
  const lastZoomData = useRef(null);
  const lastPovData = useRef(null);

  // Refs to track current state for event listeners
  const nmRef = useRef(nm);
  const showAnswerRef = useRef(showAnswer);

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
  const initialPovSetRef = useRef(false);
  const panoChangedHandledRef = useRef(false);
  const fallbackExecutedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const googleMapsDivId = "googlemaps";

  // Helper to determine whether to use iframe or SDK
  const shouldUseEmbed = (showRoadLabels && ((!nm && !npz) || (nm && npz)));

  // Debounced logging functions
  const logZoomChange = (zoom) => {
    const now = Date.now();

    // Clear existing timer
    if (zoomDebounceTimer.current) {
      clearTimeout(zoomDebounceTimer.current);
    }

    // Store the latest zoom data
    lastZoomData.current = {
      type: 'zoom_changed',
      timestamp: now,
      zoom: zoom
    };

    // Check if we should log immediately (if last log was more than 500ms ago)
    if (!lastZoomlog.current || (now - lastZoomlog.current) >= 500) {
      // console.log('REPLAY_EVENT:', lastZoomData.current);
      lastZoomlog.current = now;
    } else {
      // Set a timer to log the final state after 500ms of no changes
      zoomDebounceTimer.current = setTimeout(() => {
        if (lastZoomData.current) {
          // console.log('REPLAY_EVENT:', {
          //   ...lastZoomData.current,
          //   timestamp: Date.now() // Update timestamp to current time
          // });
          lastZoomlog.current = Date.now();
          lastZoomData.current = null;
        }
      }, 500);
    }
  };

  const logPovChange = (pov) => {
    const now = Date.now();

    // Clear existing timer
    if (povDebounceTimer.current) {
      clearTimeout(povDebounceTimer.current);
    }

    // Store the latest pov data
    lastPovData.current = {
      type: 'pov_changed',
      timestamp: now,
      pov: {
        heading: pov.heading,
        pitch: pov.pitch
      }
    };

    // Check if we should log immediately (if last log was more than 500ms ago)
    if (!lastPovlog.current || (now - lastPovlog.current) >= 500) {
      // console.log('REPLAY_EVENT:', lastPovData.current);
      lastPovlog.current = now;
    } else {
      // Set a timer to log the final state after 500ms of no changes
      povDebounceTimer.current = setTimeout(() => {
        if (lastPovData.current) {
          // console.log('REPLAY_EVENT:', {
          //   ...lastPovData.current,
          //   timestamp: Date.now() // Update timestamp to current time
          // });
          lastPovlog.current = Date.now();
          lastPovData.current = null;
        }
      }, 500);
    }
  };

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
    if ((!lat || !long) && !panoId || !document.getElementById(googleMapsDivId)) {
      return;
    }

    const panoramaOptions = {
      pov: { heading: 0, pitch: 0 },
      zoom: 0,
      motionTracking: false,
      linksControl: showAnswer || !nm,
      clickToGo: showAnswer || !nm,
      panControl: true, // Always show pan control (includes compass)
      zoomControl: showAnswer || !npz, // Only show zoom when allowed
      addressControl: false,
      showRoadLabels: showRoadLabels,
      disableDefaultUI: false,
      fullscreenControl: false,
      imageDateControl: false,
    };

    // Use panoId if available, otherwise use lat/lng position
    if (panoId) {
      panoramaOptions.pano = panoId;
    } else {
      panoramaOptions.position = { lat, lng: long };
    }

    // console.log("Creating StreetViewPanorama with options:", panoramaOptions);

    panoramaRef.current = new google.maps.StreetViewPanorama(
      document.getElementById(googleMapsDivId),
      panoramaOptions
    );

    // Initial setup - will be properly set in pano_changed event
    setTimeout(() => {
      panoramaRef.current.setZoom(0);
    }, 100);
      onLoad();

    // Event logging for replay system
    panoramaRef.current.addListener("pano_changed", () => {
      const currentPanoId = panoramaRef.current.getPano();

      panoChangedHandledRef.current = true; // Mark that pano_changed has handled setup
      setLoading(false);
      cleanMetaTags();

      // Set POV to point towards road only on initial load (not when user moves)
      if (!initialPovSetRef.current) {
        const photographerPov = panoramaRef.current.getPhotographerPov();

        if (photographerPov && photographerPov.heading !== undefined) {
          const newPov = {
            heading: photographerPov.heading,
            pitch: 0 // Always use level pitch for consistency
          };
          panoramaRef.current.setPov(newPov);
          initialPovSetRef.current = true;
        }
      }

      // Log pano change event
      const panoId = panoramaRef.current.getPano();
      const position = panoramaRef.current.getPosition();
      // console.log('REPLAY_EVENT:', {
      //   type: 'pano_changed',
      //   timestamp: Date.now(),
      //   panoId: panoId,
      //   position: {
      //     lat: position.lat(),
      //     lng: position.lng()
      //   }
      // });
    });

    panoramaRef.current.addListener("position_changed", () => {
      const pos = panoramaRef.current.getPosition();
      const curLat = pos.lat();
      const curLng = pos.lng();

      // Log position change event
      // console.log('REPLAY_EVENT:', {
      //   type: 'position_changed',
      //   timestamp: Date.now(),
      //   position: {
      //     lat: curLat,
      //     lng: curLng
      //   }
      // });

      if(nmRef.current && !showAnswerRef.current && curLat !== lat && curLng !== long) {
        // If NM is enabled and position changed, move back to original position
        panoramaRef.current.setPosition({ lat, lng: long });
      }
    });

    // Log POV (pan/tilt) changes with debouncing
    panoramaRef.current.addListener("pov_changed", () => {
      const pov = panoramaRef.current.getPov();
      logPovChange(pov);
    });

    // Log zoom changes with debouncing
    panoramaRef.current.addListener("zoom_changed", () => {
      const zoom = panoramaRef.current.getZoom();
      logZoomChange(zoom);
    });

    // Log when panorama becomes visible
    // panoramaRef.current.addListener("visible_changed", () => {
    //   const visible = panoramaRef.current.getVisible();
    //   console.log('REPLAY_EVENT:', {
    //     type: 'visible_changed',
    //     timestamp: Date.now(),
    //     visible: visible
    //   });
    // });

    // Log status changes (for error handling)
    panoramaRef.current.addListener("status_changed", () => {
      const status = panoramaRef.current.getStatus();

      if (status === google.maps.StreetViewStatus.ZERO_RESULTS) {
        console.error("ZERO_RESULTS - No Street View data found for this location");
      } else if (status === google.maps.StreetViewStatus.UNKNOWN_ERROR) {
        console.error("UNKNOWN_ERROR - Street View request could not be processed");
      } else if (status === google.maps.StreetViewStatus.OK) {

        // Fallback: If pano_changed doesn't fire when using panoId directly
        if (panoId && !fallbackExecutedRef.current) {
          // Use requestAnimationFrame to wait for next frame when panorama data is ready
          requestAnimationFrame(() => {
            if (!panoChangedHandledRef.current && !fallbackExecutedRef.current && loading) {
              fallbackExecutedRef.current = true; // Prevent multiple executions
              setLoading(false);
              cleanMetaTags();

              // Set initial POV if needed
              if (!initialPovSetRef.current) {
                const photographerPov = panoramaRef.current.getPhotographerPov();

                if (photographerPov && photographerPov.heading !== undefined) {
                  const newPov = {
                    heading: photographerPov.heading,
                    pitch: 0
                  };
                  panoramaRef.current.setPov(newPov);
                  initialPovSetRef.current = true;
                }
              }
            }
          });
        }
      }
    });

  };

  // Main useEffect for handling embed or SDK
  useEffect(() => {
    setLoading(true);
    initialPovSetRef.current = false; // Reset flag for new location
    panoChangedHandledRef.current = false; // Reset flag for new location
    fallbackExecutedRef.current = false; // Reset flag for new location

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
      // Clear debounce timers
      if (zoomDebounceTimer.current) {
        clearTimeout(zoomDebounceTimer.current);
      }
      if (povDebounceTimer.current) {
        clearTimeout(povDebounceTimer.current);
      }

      if (panoramaRef.current) {
        // Clear all event listeners
        google.maps.event.clearListeners(panoramaRef.current, "pano_changed");
        google.maps.event.clearListeners(panoramaRef.current, "position_changed");
        google.maps.event.clearListeners(panoramaRef.current, "pov_changed");
        google.maps.event.clearListeners(panoramaRef.current, "zoom_changed");
        google.maps.event.clearListeners(panoramaRef.current, "visible_changed");
        google.maps.event.clearListeners(panoramaRef.current, "status_changed");
        panoramaRef.current.setVisible(false);
        panoramaRef.current = null;
      }
    };
  }, [lat, long, panoId, showRoadLabels, shouldUseEmbed]);

  // Handle nm/npz changes without reinitializing panorama
  useEffect(() => {
    // Update refs to current values
    nmRef.current = nm;
    showAnswerRef.current = showAnswer;

    if (!shouldUseEmbed && panoramaRef.current && !showAnswer) {
      panoramaRef.current.setOptions({
        linksControl: showAnswer || !nm,
        clickToGo: showAnswer || !nm,
        panControl: true, // Always show pan control (includes compass)
        zoomControl: showAnswer || !npz, // Only show zoom when allowed
        addressControl: false,
        fullscreenControl: false,
        imageDateControl: false,
      });
    }
  }, [nm, npz, shouldUseEmbed, showAnswer]);

  useEffect(() => {
    if(showAnswer) {
    if(!shouldUseEmbed) {
      // nm,npz off temporarily
      console.log("temporarily disabling nm,npz");
        panoramaRef.current.setOptions({
          linksControl: true,
          clickToGo: true,
          panControl: true,
          zoomControl: true,
          addressControl: false,
          fullscreenControl: false,
          imageDateControl: false,
        });
      }
  }
  }, [showAnswer]);

  if((!lat || !long) && !panoId) {
    return null;
  }


  return shouldUseEmbed ? (
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
