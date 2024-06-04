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
import ol, { DoubleClickZoom, KeyboardZoom, MouseWheelZoom } from 'ol/interaction';
import { Zoom } from 'ol/control';
import { Circle } from 'ol/geom';
const hintMul = 5000000 / 20000; //5000000 for all countries (20,000 km)

const MapComponent = ({ session, pinPoint, setPinPoint, answerShown, location, setKm, guessing, multiplayerSentGuess, playingMultiplayer, multiplayerGameData, showHint, currentId, round, gameOptions }) => {
  const mapRef = useRef();
  const [map, setMap] = useState(null);
  const [randomOffsetS, setRandomOffsetS] = useState([0, 0]);
  const plopSound = useRef();
  const vectorSource = useRef(new VectorSource());

  function drawHint(initialMap, location, randomOffset) {
    // create a circle overlay 10000km radius from location

    let lat = location.lat;
    let long = location.long
    let center = fromLonLat([long, lat]);
    center = [center[0] + randomOffset[0], center[1] + randomOffset[1]];
    // move it a bit randomly so it's not exactly on the location but location is inside the circle
    const circle = new Feature(new Circle(center, hintMul * gameOptions.maxDist));
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
        zoom: 1,
        zoomFactor: 2.5,
      }),
    });

    var duration = 400;
    initialMap.addControl(new Zoom({
      duration: duration
    }));
    initialMap.addInteraction(new MouseWheelZoom({
      duration: duration
    }));
    initialMap.addInteraction(new DoubleClickZoom({
      duration: duration
    }));
    initialMap.addInteraction(new KeyboardZoom({
      duration: duration
    }));


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
      if (!answerShown && !guessing) {
        const clickedCoord = initialMap.getEventCoordinate(e.originalEvent);
        const clickedLatLong = toLonLat(clickedCoord);
        console.log(clickedLatLong);
        setPinPoint({ lat: clickedLatLong[1], lng: clickedLatLong[0] });
        if(plopSound.current) plopSound.current.play();
      }
    }
    initialMap.on('click', onMapClick);

    setMap(initialMap);

    return () => {
      initialMap.setTarget(undefined);
      // if(mapRef.current) mapRef.current.removeEventListener('mousedown', mouseDown);

      initialMap.un('click', onMapClick);
    };
  }, [answerShown, setPinPoint, guessing]);

  // Update pin point and add line
  useEffect(() => {
    if (!map) return;

    vectorSource.current.clear();

    // remove old pin point
    // no clue why this is needed twice but it is
    for (let i = 0; i < 2; i++) {
      map.getLayers().getArray().forEach((layer) => {
        if (layer instanceof VectorLayer) {
          map.removeLayer(layer);
        }
      });
    }

    if (location && showHint) drawHint(map, location, randomOffsetS, gameOptions.maxDist);
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

    if (answerShown && location && pinPoint && (!playingMultiplayer || multiplayerSentGuess)) {
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
      if (playingMultiplayer) {
        // Add other players' guesses
        multiplayerGameData.players.forEach((player) => {
          if (player.g.findIndex((g) => g.r === round) !== -1) {
            const playerGuess = player.g.find((g) => g.r === round);
            if (playerGuess.lat === pinPoint.lat && playerGuess.long === pinPoint.lng) return;
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
      if (distanceInKm > 100) distanceInKm = Math.round(distanceInKm);
      else if (distanceInKm > 10) distanceInKm = parseFloat(distanceInKm.toFixed(1));
      else distanceInKm = parseFloat(distanceInKm.toFixed(2));
      setKm(distanceInKm);
    }

  }, [map, pinPoint, answerShown, location, setKm, randomOffsetS, showHint]);

  useState(() => {
    // let maxPivots = [10, 25].map((v, i) => v * 0.8).map((v, i) => v * (Math.random() - 0.5) * 2);
    let maxPivots = [0, 0];
    const radiusProj = hintMul * gameOptions.maxDist;

    // move it a bit randomly so it's not exactly on the location but location is inside the circle (0 -> radiusProj)
    const randomAngle = Math.random() * 2 * Math.PI;
    const randomRadius = Math.random() * radiusProj;
    maxPivots[0] += Math.cos(randomAngle) * randomRadius;
    maxPivots[1] += Math.sin(randomAngle) * randomRadius;

    console.log('maxPivots', maxPivots);
    setRandomOffsetS([maxPivots[0], maxPivots[1]]);
  }, [location, gameOptions]);

  return (
    <>
    <div ref={mapRef} id='miniMapContent'></div>
    <audio ref={plopSound} src="/plop.mp3" preload="auto"></audio>
    </>
  );
};

export default MapComponent;
