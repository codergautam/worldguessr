import { useState } from 'react';
import { asset } from '@/lib/basePath';
import { useTranslation } from '@/components/useTranslations';
import sendEvent from './utils/sendEvent';

export default function CountryGuessrConfig({ onStart, onBack }) {
  const { t: text } = useTranslation("common");
  const [subMode, setSubMode] = useState("country");
  const [region, setRegion] = useState("all");

  const REGIONS = [
    { id: "all", label: text("world"), emoji: "🌐" },
    { id: "Africa", label: "Africa", emoji: "🌍" },
    { id: "Asia", label: "Asia", emoji: "🌏" },
    { id: "Europe", label: "Europe", emoji: "🌍" },
    { id: "North America", label: "N. America", emoji: "🌎" },
    { id: "South America", label: "S. America", emoji: "🌎" },
    { id: "Oceania", label: "Oceania", emoji: "🌏" },
  ];

  const showWarning = subMode === "continent" && region !== "all";

  return (
    <div className="countryGuessr-config" style={{
      backgroundImage: `url("${asset('/street2.webp')}")`,
    }}>
      <div className="countryGuessr-config__sidebar">
        <h1 className="home__title g2_nav_title">{text("countryGuesser")}</h1>

        <div className="g2_nav_hr" />

        <div className="g2_nav_group">
          <button
            className={`g2_nav_text ${subMode === "country" ? "countryGuessr-config--selected" : ""}`}
            onClick={() => setSubMode("country")}
          >
            {text("countryGuesser")}
          </button>
          <button
            className={`g2_nav_text ${subMode === "continent" ? "countryGuessr-config--selected" : ""}`}
            onClick={() => setSubMode("continent")}
          >
            {text("continentGuesser")}
          </button>
        </div>

        <div className="g2_nav_hr" />

        <button className="g2_nav_text countryGuessr-config__back" onClick={onBack}>
          ← {text("back")}
        </button>
      </div>

      <div className="countryGuessr-config__content">
        <h2 className="countryGuessr-config__heading">{text("regionFilter")}</h2>

        <div className="countryGuessr-config__regions">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              className={`countryGuessr-config__region-btn ${region === r.id ? "active" : ""}`}
              onClick={() => setRegion(r.id)}
            >
              <span className="countryGuessr-config__region-emoji">{r.emoji}</span>
              <span>{r.label}</span>
            </button>
          ))}
        </div>

        {showWarning && (
          <p className="countryGuessr-config__warning">
            {text("continentWorldWarning")}
          </p>
        )}

        <button
          className="gameBtn g2_green_button countryGuessr-config__play-btn"
          onClick={() => {
            sendEvent("casual_mode_configured", { challenge: subMode, region });
            onStart({ subMode, region });
          }}
        >
          {text("play")}
        </button>
      </div>
    </div>
  );
}
