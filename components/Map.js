import React, { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { Icon, Style, Stroke } from 'ol/style';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj';
import { getDistance } from 'ol/sphere';
import ol from 'ol/interaction';

const MapComponent = ({ pinPoint, setPinPoint, guessed, location, setKm, height, guessing, multiplayerSentGuess, playingMultiplayer, multiplayerGameData, currentId, round }) => {
  const mapRef = useRef();
  const [map, setMap] = useState(null);
  const vectorSource = useRef(new VectorSource());
  // Initialize map on first render
  useEffect(() => {
    const initialMap = new Map({
      target: mapRef.current,
      layers: [
        // osm
        new TileLayer({
          source: new XYZ({
            // url: 'https://{a-c}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
            url: '	https://cdn.lima-labs.com/{z}/{x}/{y}.png?api=demo',
          }),
        }),
        new VectorLayer({ source: vectorSource.current })
      ],
      view: new View({
        center: fromLonLat([2, 35]),
        zoom: 2,
        zoomFactor: 1.8,
      }),
    });

    const mouseDown = (e) => {
      if (!guessed && !guessing) {
        e.preventDefault();
        const pixel = initialMap.getEventPixel(e);
        const clickedCoord = initialMap.getCoordinateFromPixel(pixel);
        const clickedLatLong = toLonLat(clickedCoord);
        setPinPoint({ lat: clickedLatLong[1], lng: clickedLatLong[0] });
      }
    };
    mapRef.current.addEventListener('mousedown', mouseDown);

    setMap(initialMap);

    return () => {
      initialMap.setTarget(undefined);
      if(mapRef.current) mapRef.current.removeEventListener('mousedown', mouseDown);
    };
  }, [guessed, setPinPoint, guessing]);

  // Update pin point and add line
  useEffect(() => {
    if (!map) return;

    vectorSource.current.clear();

    if (pinPoint) {
      const pinFeature = new Feature({
        geometry: new Point(fromLonLat([pinPoint.lng, pinPoint.lat])),
      });
      const pinLayer = new VectorLayer({
        source: new VectorSource({
          features: [pinFeature]
        }),
        style: new Style({
          image: new Icon({
            anchor: [0.5, 1],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            scale: 0.45,
            src: '/src.png'
          })
        })
      });
      map.addLayer(pinLayer);
      // clear old layers
      map.getLayers().forEach((layer) => {
        if (layer instanceof VectorLayer) {
          map.removeLayer(layer);
        }
      });
    }

    if (guessed && location && pinPoint && (!playingMultiplayer || multiplayerSentGuess)) {
      const lineLayer = new VectorLayer({
        source: new VectorSource({
          features: [
            new Feature({
              geometry: new LineString([
                fromLonLat([pinPoint.lng, pinPoint.lat]),
                fromLonLat([location.long, location.lat]),
              ]),
            })
          ]
        }),
        style: new Style({
          stroke: new Stroke({
            color: '#f00',
            width: 2
          })
        })
      });

      map.addLayer(lineLayer);
      const destFeature = new Feature({
        geometry: new Point(fromLonLat([location.long, location.lat])),
      });
      const pinLayer = new VectorLayer({
        source: new VectorSource({
          features: [destFeature]
        }),
        style: new Style({
          image: new Icon({
            anchor: [0.5, 1],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            scale: 0.45,
            src: '/dest.png'
          })
        })
      });
      map.addLayer(pinLayer);
      if(playingMultiplayer) {
        // Add other players' guesses
        multiplayerGameData.players.forEach((player) => {
          console.log(player, round)
          if(player.g.findIndex((g) => g.r === round) !== -1) {
            const playerGuess = player.g.find((g) => g.r === round);
            if(playerGuess.lat === pinPoint.lat && playerGuess.long === pinPoint.lng) return;
            const playerFeature = new Feature({
              geometry: new Point(fromLonLat([playerGuess.long, playerGuess.lat])),
            });
            const playerLayer = new VectorLayer({
              source: new VectorSource({
                features: [playerFeature]
              }),
              style: new Style({
                image: new Icon({
                  anchor: [0.5, 1],
                  anchorXUnits: 'fraction',
                  anchorYUnits: 'fraction',
                  scale: 0.45,
                  src: '/src2.png'
                })
              })
            });
            map.addLayer(playerLayer);
          }
        });
      }



      setTimeout(() => {
      map.getView().animate({ center: fromLonLat([location.long, location.lat]), zoom: 5, duration: 3000 });
      }, 100);

      // Calculate distance

      let distanceInKm = getDistance([pinPoint.lng, pinPoint.lat], [location.long, location.lat]) / 1000;
      if(distanceInKm > 100) distanceInKm = Math.round(distanceInKm);
      else if(distanceInKm > 10) distanceInKm = parseFloat(distanceInKm.toFixed(1));
      else distanceInKm = parseFloat(distanceInKm.toFixed(2));
      setKm(distanceInKm);
    }

  }, [map, pinPoint, guessed, location, setKm]);

  return (
    <div ref={mapRef} style={{ height: height, width: '100%', cursor: 'crosshair' }}></div>
  );
};

export default MapComponent;
