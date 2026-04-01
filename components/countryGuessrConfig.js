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
    { id: "North America", label: "North America", emoji: "🌎" },
    { id: "South America", label: "South America", emoji: "🌎" },
    { id: "Oceania", label: "Oceania", emoji: "🌏" },
  ];

  const showWarning = subMode === "continent" && region !== "all";

  return (
    <div className="countryGuessr-config">
      <div className="countryGuessr-config__inner" style={{
        background: `linear-gradient(0deg, rgba(0, 0, 0, 0.85) 0%, rgba(0, 30, 15, 0.6) 100%), url("${asset('/street2.webp')}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}>
        <h1 className="countryGuessr-config__title">{text("countryGuesser")}</h1>

        <p className="countryGuessr-config__subtitle">{text("pickChallenge")}</p>

        <div className="countryGuessr-config__modes">
          <button
            className={`countryGuessr-config__mode-btn ${subMode === "country" ? "active" : ""}`}
            onClick={() => setSubMode("country")}
          >
            <strong>🏳️ {text("countryGuesser")}</strong>
            <span>{text("countryGuessrDesc")}</span>
          </button>
          <button
            className={`countryGuessr-config__mode-btn ${subMode === "continent" ? "active" : ""}`}
            onClick={() => setSubMode("continent")}
          >
            <strong>🌎 {text("continentGuesser")}</strong>
            <span>{text("continentGuessrDesc")}</span>
          </button>
        </div>

        <div className="countryGuessr-config__divider" />

        <p className="countryGuessr-config__subtitle">{text("regionFilter")}</p>

        <div className="countryGuessr-config__regions">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              className={`countryGuessr-config__region-chip ${region === r.id ? "active" : ""}`}
              onClick={() => setRegion(r.id)}
            >
              {r.emoji} {r.label}
            </button>
          ))}
        </div>

        {showWarning && (
          <p className="countryGuessr-config__warning">
            {text("continentWorldWarning")}
          </p>
        )}

        <button className="g2_green_button countryGuessr-config__play-btn" onClick={() => {
          sendEvent("casual_mode_configured", { challenge: subMode, region });
          onStart({ subMode, region });
        }}>
          {text("play")}
        </button>

        <button className="countryGuessr-config__back-btn" onClick={onBack}>
          ← {text("back")}
        </button>
      </div>
    </div>
  );
}
