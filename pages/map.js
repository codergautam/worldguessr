import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import styles from '@/styles/MapPage.module.css';
import Navbar from '@/components/ui/navbar';
import { useTranslation } from '@/components/useTranslations'
import config from '@/clientConfig';
import { getHeaders } from '@/components/auth/auth';
import { toast } from 'react-toastify';

export default function MapPage({ }) {
  const router = useRouter();
  const [currentLocationIndex, setCurrentLocationIndex] = useState(0);
  const [locationUrls, setLocationUrls] = useState([]);
  const [fadeClass, setFadeClass] = useState(styles.iframe);
  const { t: text } = useTranslation('common');
  const [mapData, setMapData] = useState({});
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [selectedLocationIndex, setSelectedLocationIndex] = useState(0);

  useEffect(() => {
    const {apiUrl} = config()
    const queryParams = new URLSearchParams(window.location.search);
    let slug = router.query.s || router.query.slug || queryParams.get('s') || queryParams.get('slug');

    console.log('also can be the format /map/slug');
    const fullPath = window.location.pathname;
    if (fullPath.startsWith('/map/') && !slug) {
       slug = fullPath.split('/map/')[1];
    }

    if (!slug) return;

    console.log('fetching map data for', slug, getHeaders());
    fetch(apiUrl+`/api/map/publicData?slug=${slug}`,{
      headers: {
        authorization: getHeaders()?.authorization
      }
    }).then(async res => {
      if (res.ok) {
        const data = await res.json();
        console.log('fetched map data:', data);
        setMapData(data.mapData);
      } else {
        console.error('Failed to fetch map data:', res);
        if(res.status === 404) {
          router.push('/404');
        }
      }
    }).catch(err => {
      alert('An error occurred while fetching map data');
    });
  }, []);

  useEffect(() => {
    if (!mapData.data) return;

    const urls = mapData.data.map(location =>
      `//www.google.com/maps/embed/v1/streetview?key=AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ&location=${location.lat},${location.lng}&fov=60`
    );
    setLocationUrls(urls);

    const intervalId = setInterval(() => {
      setFadeClass(styles.iframe + ' ' + styles.fadeOut);
      setTimeout(() => {
        const newIndex = Math.floor(Math.random() * urls.length);
        setCurrentLocationIndex(newIndex);
        updateSelectedMarker(newIndex);
        setFadeClass(styles.iframe + ' ' + styles.fadeIn);
      }, 1000);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [mapData.data]);

  // Function to update selected marker without re-rendering map
  const updateSelectedMarker = (newIndex) => {
    setSelectedLocationIndex(newIndex);

    // Update marker styles without re-creating the map
    markersRef.current.forEach((marker, index) => {
      const isSelected = index === newIndex;
      const iconHtml = `
        <div style="
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background-color: ${isSelected ? '#4CAF50' : '#ffffff'};
          border: 3px solid ${isSelected ? '#ffffff' : '#4CAF50'};
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          cursor: pointer;
          transition: all 0.3s ease;
        "></div>
      `;

      marker.setIcon(window.L.divIcon({
        html: iconHtml,
        className: 'custom-marker',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      }));
    });
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapData.data || mapInstanceRef.current) return;

    // Load Leaflet CSS and JS if not already loaded
    if (!window.L) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      initMap();
    }

    function initMap() {
      if (mapInstanceRef.current) return;

      // Create map
      const map = window.L.map(mapRef.current, {
        center: [20, 0],
        zoom: 2,
        zoomControl: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        dragging: true
      });

      // Add dark tile layer
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);

      mapInstanceRef.current = map;

      // Add markers for each location
      mapData.data.forEach((location, index) => {
        const isSelected = index === selectedLocationIndex;
        const iconHtml = `
          <div style="
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background-color: ${isSelected ? '#4CAF50' : '#ffffff'};
            border: 3px solid ${isSelected ? '#ffffff' : '#4CAF50'};
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            cursor: pointer;
            transition: all 0.3s ease;
          "></div>
        `;

        const marker = window.L.marker([location.lat, location.lng], {
          icon: window.L.divIcon({
            html: iconHtml,
            className: 'custom-marker',
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          })
        }).addTo(map);

        marker.on('click', () => {
          setCurrentLocationIndex(index);
          updateSelectedMarker(index);

          setFadeClass(styles.iframe + ' ' + styles.fadeOut);
          setTimeout(() => {
            setFadeClass(styles.iframe + ' ' + styles.fadeIn);
          }, 500);
        });

        markersRef.current.push(marker);
      });

      // Fit map to show all markers
      if (mapData.data.length > 0) {
        const group = new window.L.featureGroup(markersRef.current);
        map.fitBounds(group.getBounds().pad(0.1));
      }
    }

    // Cleanup function
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current = [];
      }
    };
  }, [mapData.data]);

  const handlePlayButtonClick = () => {
    window.location.href = `/?map=${mapData.countryCode || mapData.slug}${window.location.search.includes('crazygames') ? '&crazygames=true' : ''}`;
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>{
          mapData?.name ? `${mapData.name} - WorldGuessr` :
        ""
        }</title>
        <meta name="description" content={`Explore the world on WorldGuessr, a free GeoGuessr alternative. `} />
        <link rel="icon" type="image/x-icon" href="/icon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>
      <style>
        {`
          .mainBody {
            user-select: auto !important;
            overflow: auto !important;
          }

          .custom-marker {
            background: none !important;
            border: none !important;
          }

          .custom-marker div:hover {
            transform: scale(1.2);
          }
        `}
      </style>
      <main className={styles.main}>
        <Navbar />

        {mapData?.name && (
          <>
            {mapData.in_review && (
              <div className={styles.statusMessage}>
                <p>⏳ This map is currently under review.</p>
              </div>
            )}

            {mapData.reject_reason && (
              <div className={styles.statusMessage}>
                <p>❌ This map has been rejected: {mapData.reject_reason}</p>
              </div>
            )}
          </>
        )}

        <div className={styles.branding}>
          <h1>WorldGuessr</h1>
          <center>
            <button onClick={() => window.location.href=`/${
              window.location.search.includes('crazygames') ? '?crazygames=true' : ''
            }`} className={styles.backButton}>
              ← {text('backToGame')}
            </button>
          </center>
        </div>

        {!mapData.name && (
          <div className={styles.statusMessage} style={{backgroundColor: 'green', color: 'white'}}>
            <center>
              <p>Loading map...</p>
            </center>
          </div>
        )}

        {mapData.name && (
          <div className={styles.mapHeader}>
            <div className={styles.mapImage}>
              {locationUrls.length > 0 && (
                <div className={styles.iframeContainer}>
                  <iframe
                    className={fadeClass}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    src={locationUrls[currentLocationIndex]}
                  ></iframe>
                </div>
              )}

              {mapData.countryCode && (
                <img src={`https://flagcdn.com/w2560/${mapData.countryCode?.toLowerCase()}.png`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
            </div>
            <div className={styles.mapInfo}>
              <h1>{mapData.name}</h1>
              <p>{mapData.description_short}</p>
            </div>
          </div>
        )}

        {mapData?.name && (
          <>
            <button className={styles.playButton} onClick={handlePlayButtonClick}>
              PLAY
            </button>

            {/* World Map Section */}
            {mapData.data && mapData.data.length > 0 && (
              <div className={styles.worldMapSection}>
                <h2>🌍 Locations Map</h2>
                <p style={{ textAlign: 'center', marginBottom: '1rem', opacity: 0.8 }}>
                  Click on any dot to preview that location above
                </p>
                <div className={styles.worldMapContainer}>
                  <div ref={mapRef} style={{ width: '100%', height: '100%' }}></div>
                </div>
              </div>
            )}

            <div className={styles.mapStats}>
              {typeof mapData.plays !== "undefined" && (
                <div className={styles.stat}>
                  <span className={styles.statIcon}>👥</span>
                  <span className={styles.statValue}>{mapData.plays.toLocaleString()}</span>
                  <span className={styles.statLabel}>Plays</span>
                </div>
              )}

              {mapData.data && (
                <div className={styles.stat}>
                  <span className={styles.statIcon}>📍</span>
                  <span className={styles.statValue}>{mapData.data.length.toLocaleString()}</span>
                  <span className={styles.statLabel}>Locations</span>
                </div>
              )}

              {typeof mapData.hearts !== "undefined" && (
                <div className={styles.stat}>
                  <span className={styles.statIcon}>❤️</span>
                  <span className={styles.statValue}>{mapData.hearts.toLocaleString()}</span>
                  <span className={styles.statLabel}>Hearts</span>
                </div>
              )}
            </div>

            <div className={styles.mapDescription}>
              <h2>About this map</h2>
              {mapData.description_long.split('\n').map((line, index) => <p key={index}>{line}</p>)}
              <p className={styles.mapAuthor}>
                Created by <strong>{mapData.created_by}</strong>
                {mapData.created_at && (
                  ` ${mapData.created_at} ago`
                )}
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}