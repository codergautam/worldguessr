import React, { useState } from "react";
import StreetView from "../components/streetView.js";
import Head from "next/head.js";

const TestPage = () => {
  const [lat, setLat] = useState(40.7129); // Latitude for NYC
  const [long, setLong] = useState(-74.0060); // Longitude for NYC
  const [nm, setNm] = useState(false);
  const [npz, setNpz] = useState(false);
  const [showRoadLabels, setShowRoadLabels] = useState(true);
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <>
    <Head>
       <script
  src="https://maps.googleapis.com/maps/api/js?v=weekly"
  defer
></script>
    </Head>
    <div style={{ }}>

      <div style={{ marginBottom: "20px",
        position: "fixed",
        zIndex: 10000,
        top: 0,
        left: 0,
       }}>
      <h1>StreetView Test Page</h1>

        <h3>Controls</h3>
        <label>
          Latitude:
          <input
            type="number"
            value={lat}
            onChange={(e) => setLat(parseFloat(e.target.value))}
          />
        </label>
        <label>
          Longitude:
          <input
            type="number"
            value={long}
            onChange={(e) => setLong(parseFloat(e.target.value))}
          />
        </label>

        <label>
          No Movement (nm):
          <input
            type="checkbox"
            checked={nm}
            onChange={(e) => setNm(e.target.checked)}
          />
        </label>
        <label>
          No Zoom (npz):
          <input
            type="checkbox"
            checked={npz}
            onChange={(e) => setNpz(e.target.checked)}
          />
        </label>
        <label>
          Show Road Labels:
          <input
            type="checkbox"
            checked={showRoadLabels}
            onChange={(e) => setShowRoadLabels(e.target.checked)}
          />
        </label>
        <label>
          Show Answer:
          <input
            type="checkbox"
            checked={showAnswer}
            onChange={(e) => setShowAnswer(e.target.checked)}
          />
        </label>
      </div>

      <StreetView
        lat={lat}
        long={long}
        nm={nm}
        npz={npz}
        showRoadLabels={showRoadLabels}
        showAnswer={showAnswer}
      />
    </div>
    </>
  );
};

export default TestPage;
