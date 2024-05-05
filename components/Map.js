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
import { Circle } from 'ol/geom';
const hintRad = 5000000;

const MapComponent = ({ session, pinPoint, setPinPoint, guessed, location, setKm, height, guessing, multiplayerSentGuess, playingMultiplayer, multiplayerGameData, showHint, currentId, round }) => {
  const mapRef = useRef();
  const [map, setMap] = useState(null);
  const [randomOffsetS, setRandomOffsetS] = useState([0, 0]);
  const vectorSource = useRef(new VectorSource());

  function drawHint(initialMap, location, randomOffset) {
      // create a circle overlay 10000km radius from location

      let lat = location.lat+randomOffset[0];
      let long = location.long+randomOffset[1];
      // move it a bit randomly so it's not exactly on the location but location is inside the circle
      const circle = new Feature(new Circle(fromLonLat([long, lat]), hintRad));
      vectorSource.current.addFeature(circle);

      const circleLayer = new VectorLayer({
        source: new VectorSource({
          features: [circle]
        }),
        style: new Style({
          stroke: new Stroke({
            color: '#f00',
            width: 2
          })
        })
      });
      initialMap.addLayer(circleLayer);
  }
  // Initialize map on first render
  useEffect(() => {
    const initialMap = new Map({
      target: mapRef.current,
      layers: [
        // osm
        new TileLayer({
          source: new XYZ({
            // url: 'https://{a-c}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
            url: 'https://cdn.lima-labs.com/{z}/{x}/{y}.png?api=0430HugnWftuqjsktunChwMvi2HsvythMMwighNwoJtJascQA02',
          }),
        }),
        new VectorLayer({ source: vectorSource.current })
      ],
      view: new View({
        center: fromLonLat([2, 35]),
        zoom: 2,
        zoomFactor: 2.5,
      }),
    });



    // const mouseDown = (e) => {
    //   if (!guessed && !guessing) {
    //     e.preventDefault();
    //     const pixel = initialMap.getEventPixel(e);
    //     const clickedCoord = initialMap.getCoordinateFromPixel(pixel);
    //     const clickedLatLong = toLonLat(clickedCoord);
    //     setPinPoint({ lat: clickedLatLong[1], lng: clickedLatLong[0] });
    //   }
    // };
    // mapRef.current.addEventListener('mousedown', mouseDown);

    // use map click event to set pin point
    function onMapClick(e) {
      if (!guessed && !guessing) {
        const clickedCoord = initialMap.getEventCoordinate(e.originalEvent);
        const clickedLatLong = toLonLat(clickedCoord);
        setPinPoint({ lat: clickedLatLong[1], lng: clickedLatLong[0] });
      }
    }
    initialMap.on('click', onMapClick);

    setMap(initialMap);

    return () => {
      initialMap.setTarget(undefined);
      // if(mapRef.current) mapRef.current.removeEventListener('mousedown', mouseDown);

        initialMap.un('click', onMapClick);
    };
  }, [guessed, setPinPoint, guessing]);

  // Update pin point and add line
  useEffect(() => {
    if (!map) return;

    vectorSource.current.clear();

    // remove old pin point
    // no clue why this is needed twice but it is
    for(let i=0; i<2; i++) {
    map.getLayers().getArray().forEach((layer) => {
      if (layer instanceof VectorLayer) {
        map.removeLayer(layer);
      }
    });
    }

    if(location && showHint) drawHint(map, location, randomOffsetS);
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

  }, [map, pinPoint, guessed, location, setKm, randomOffsetS, showHint]);

  useState(() => {
    let maxPivots = [10, 25].map((v, i) => v * 0.8).map((v, i) => v * (Math.random() - 0.5) * 2);

    setRandomOffsetS([maxPivots[0], maxPivots[1]]);
  }, [location]);

  return (
    <div ref={mapRef} style={{ height: height, width: '100%', cursor: 'crosshair' }}></div>
  );
};

export default MapComponent;
