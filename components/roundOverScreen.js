
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FaTrophy, FaClock, FaStar } from 'react-icons/fa';

export default function RoundOverScreen({ history, points, time, maxPoints, onHomePress,buttonText }) {
  const [animatedPoints, setAnimatedPoints] = useState(0);
  const [stars, setStars] = useState(0);
  const { t: text } = useTranslation("common");

  useEffect(() => {
    let start = 0;
    const end = points;
    const duration = 1000; // Duration of the animation in milliseconds
    const intervalTime = 10; // Interval time in milliseconds
    const stepTime = duration / (end ** 0.5);

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
    if (animatedPoints >= 10000) {
      setStars(3);
    } else if (animatedPoints >= 7500) {
      setStars(2);
    } else if (animatedPoints >= 5000) {
      setStars(1);
    } else {
      setStars(0);
    }
  }, [animatedPoints]);

  return (
    <div className="round-over-screen">
      <div className="round-over-content">
        <span className="round-over-title bigSpan">{text("roundOver")}!</span>
        <div className="star-container">
          {[...Array(stars)].map((_, index) => (
            <FaStar key={index} className="star" style={{ animationDelay: `${index * 0.5}s` }} />
          ))}
          {[...Array(3 - stars)].map((_, index) => (
            <FaStar key={index} className="star empty" style={{ animationDelay: `${(stars + index) * 0.5}s` }} />
          ))}
        </div>
        <div className="round-over-details">
          <div className="detail-item">
            <FaTrophy className="detail-icon" />
            <span className="detail-text">{text("pointsEarnedTemplate", {p:  `${animatedPoints.toFixed(0)} / ${maxPoints}`})}</span>
          </div>
          { time > 0 && (
          <div className="detail-item">
            <FaClock className="detail-icon" />
            <span className="detail-text">{text("timeTakenTemplate", {t: time})}</span>
          </div>
          )}

{ history && history.length > 0 && (
        <div className="historyContainer">
          <h3>{text("history")}</h3>
          {/* eah has  {lat: latLong.lat, long: latLong.long, guessLat: pinPoint.lat, guessLong: pinPoint.lng,
            points
            make it a link that goes to https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=lat,lng
            */}
          {history.map((h, index) => (
            <div key={index} className="historyItem">
              <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${h.lat},${h.long}`} target="_blank" rel="noreferrer">
              <span>#{index + 1} - {text("pointsEarnedTemplate", {p: h.points})}</span>
              </a>
            </div>
          ))}
          </div>
      )}
        </div>
        <button className="play-again-btn" onClick={() => onHomePress()}>{buttonText??text("home")}</button>
      </div>
    </div>
  );
}
