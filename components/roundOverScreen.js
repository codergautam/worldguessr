import React, { useState, useEffect } from "react";
import { useTranslation } from "@/components/useTranslations";
import { FaTrophy, FaClock, FaStar } from "react-icons/fa";
import msToTime from "./msToTime";

export default function RoundOverScreen({
  history,
  points,
  time,
  maxPoints,
  button1Press,
  button1Text,
  button2Press,
  button2Text,
  duel,
  data,
}) {

    // duel: true if the game is a duel
  // data: {winner: boolean (true if you won), draw: boolean (true if it was a draw), oldElo, newElo, timeElapsed}

  const [animatedPoints, setAnimatedPoints] = useState(0);
  const [animatedElo, setAnimatedElo] = useState(data?.oldElo || 0);
  const [stars, setStars] = useState([]);
  const { t: text } = useTranslation("common");

  useEffect(() => {
    let start = 0;
    const end = points;
    const duration = 1000;
    const stepTime = duration / end ** 0.5;

    const interval = setInterval(() => {
      start++;
      const increment = Math.pow(start, 2);
      if (increment < end) {
        setAnimatedPoints(increment);
      } else {
        setAnimatedPoints(end);
        clearInterval(interval);
      }
    }, stepTime);

    return () => clearInterval(interval);
  }, [points]);

  useEffect(() => {
    if (duel && data && typeof data.oldElo === "number" && typeof data.newElo === "number") {
      const { oldElo, newElo } = data;
      const duration = 1500;
      const stepTime = duration / Math.abs(newElo - oldElo);

      let currentElo = oldElo;
      const interval = setInterval(() => {
        currentElo += currentElo < newElo ? 1 : -1;
        setAnimatedElo(currentElo);
        if (currentElo === newElo) clearInterval(interval);
      }, stepTime);

      return () => clearInterval(interval);
    }
  }, [duel, data]);

  useEffect(() => {
    let newStars = [];
    if (animatedPoints >= 24000) {
      newStars = [
        "/platinum_star.png",
        "/platinum_star.png",
        "/platinum_star.png",
      ];
    } else if (animatedPoints >= 22500) {
      newStars = ["/platinum_star.png", "/platinum_star.png", "gold"];
    } else if (animatedPoints >= 20000) {
      newStars = ["/platinum_star.png", "gold", "gold"];
    } else if (animatedPoints >= 17500) {
      newStars = ["gold", "gold", "gold"];
    } else if (animatedPoints >= 15000) {
      newStars = ["gold", "gold", "#CD7F32"];
    } else if (animatedPoints >= 12500) {
      newStars = ["gold", "#CD7F32", "#CD7F32"];
    } else if (animatedPoints >= 10000) {
      newStars = ["#CD7F32", "#CD7F32", "#CD7F32"];
    } else if (animatedPoints >= 7500) {
      newStars = ["#CD7F32", "#CD7F32", "#b6b2b2"];
    } else if (animatedPoints >= 5000) {
      newStars = ["#CD7F32", "#b6b2b2", "#b6b2b2"];
    } else {
      newStars = ["#b6b2b2", "#b6b2b2", "#b6b2b2"];
    }

    setStars(newStars);
  }, [animatedPoints]);

  if (duel && data) {
    const { winner, draw, oldElo, newElo } = data;
    const eloChange = newElo - oldElo;

    return (
      <div className="round-over-screen">
        <div className="round-over-content">
        <span className="round-over-title bigSpan">{draw ? text("draw") : winner ? text("victory") : text("defeat")}</span>

        <div className="round-over-details">
          { typeof data.oldElo === "number" && typeof data.newElo === "number" && (
            <>
          <span className="elo-label">{text("elo")}:</span>
          <span className="elo-value">{animatedElo}</span>
          <span
            className="elo-change"
            style={{ color: eloChange >= 0 ? "green" : "red" }}
          >
            {eloChange > 0 ? `+${eloChange}` : eloChange}
          </span>
          </>
        )}

{ data.timeElapsed > 0 && (
          <div className="time-elapsed">
          <FaClock /> {text("timeTakenTemplate", { t:

            msToTime(data.timeElapsed) })}
        </div>
        )}
        </div>



        {button1Press && button1Text && (
          <button className="play-again-btn" onClick={button1Press}>
            {button1Text ?? text("home")}
          </button>
        )}
        &nbsp;
        {button2Press && button2Text && (
          <button className="play-again-btn" onClick={button2Press}>
            {button2Text ?? text("home")}
          </button>
        )}
      </div>
    </div>
    );
  }

  return (
    <div className="round-over-screen">
      <div className="round-over-content">
        <span className="round-over-title bigSpan">{text("roundOver")}!</span>
        <div className="star-container">
          {stars.map((star, index) => (
            <div
              key={index}
              className="star"
              style={{ animationDelay: `${index * 0.5}s` }}
            >
              {typeof star === "string" && star.endsWith(".png") ? (
                <img
                  src={star}
                  alt={`Star ${index}`}
                  style={{
                    width: "32px",
                    height: "32px",
                  }}
                />
              ) : (
                <FaStar className="star" style={{ color: star }} />
              )}
            </div>
          ))}
        </div>
        <div className="round-over-details">
          <div className="detail-item">
            <FaTrophy className="detail-icon" />
            <span className="detail-text">
              {text("pointsEarnedTemplate", {
                p: `${animatedPoints.toFixed(0)} / ${maxPoints}`,
              })}
            </span>
          </div>
          {time > 0 && (
            <div className="detail-item">
              <FaClock className="detail-icon" />
              <span className="detail-text">
                {text("timeTakenTemplate", { t: time })}
              </span>
            </div>
          )}
          {history && history.length > 0 && (
            <div className="historyContainer">
              <h3>{text("history")}</h3>
              {history.map((h, index) => (
                <div key={index} className="historyItem">
                  <a
                    href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${h.lat},${h.long}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>
                      #{index + 1} -{" "}
                      {text("pointsEarnedTemplate", { p: h.points })}
                    </span>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
        {button1Press && button1Text && (
          <button className="play-again-btn" onClick={button1Press}>
            {button1Text ?? text("home")}
          </button>
        )}
        {button2Press && button2Text && (
          <button className="play-again-btn" onClick={button2Press}>
            {button2Text ?? text("home")}
          </button>
        )}
      </div>
    </div>
  );
}
