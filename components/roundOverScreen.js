import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FaTrophy, FaClock, FaStar } from "react-icons/fa";

export default function RoundOverScreen({
  history,
  points,
  time,
  maxPoints,
  onHomePress,
  buttonText,
}) {
  const [animatedPoints, setAnimatedPoints] = useState(0);
  const [stars, setStars] = useState([]);
  const { t: text } = useTranslation("common");

  useEffect(() => {
    let start = 0;
    const end = points;
    const duration = 1000; // Duration of the animation in milliseconds
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

    return () => clearInterval(interval); // Cleanup interval on component unmount
  }, [points]);

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
        <button className="play-again-btn" onClick={onHomePress}>
          {buttonText ?? text("home")}
        </button>
      </div>
    </div>
  );
}
