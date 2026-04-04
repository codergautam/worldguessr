import { useState } from 'react';
import { asset } from '@/lib/basePath';
import { useTranslation } from '@/components/useTranslations';
import sendEvent from './utils/sendEvent';
import ContinentIcon from './ContinentIcon';

export default function CountryGuessrConfig({ onStart, onBack }) {
  const { t: text } = useTranslation("common");
  const [selected, setSelected] = useState("all");

  // "all" = country guesser world, "continent" = continent guesser, rest = country guesser with region filter
  const TILES = [
    { id: "all", label: text("world"), emoji: "🌐" },
    { id: "continent", label: text("continentGuesser"), emoji: "🗺️" },
    { id: "Africa", label: "Africa" },
    { id: "Asia", label: "Asia" },
    { id: "Europe", label: "Europe" },
    { id: "North America", label: "N. America" },
    { id: "South America", label: "S. America" },
    { id: "Oceania", label: "Oceania" },
  ];

  function handlePlay() {
    if (selected === "continent") {
      sendEvent("casual_mode_configured", { challenge: "continent", region: "all" });
      onStart({ subMode: "continent", region: "all" });
    } else {
      sendEvent("casual_mode_configured", { challenge: "country", region: selected });
      onStart({ subMode: "country", region: selected });
    }
  }

  return (
    <div className="countryGuessr-config" style={{
      backgroundImage: `url("${asset('/street2.webp')}")`,
    }}>
      <div className="countryGuessr-config__sidebar">
        <h1 className="home__title g2_nav_title">{text("countryGuesser")}</h1>

        <div className="g2_nav_hr" />

        <button className="g2_nav_text countryGuessr-config__back" onClick={onBack}>
          ← {text("back")}
        </button>
      </div>

      <div className="countryGuessr-config__content">
        <h2 className="countryGuessr-config__heading">{text("pickChallenge")}</h2>

        <div className="countryGuessr-config__regions">
          {TILES.map((t) => (
            <button
              key={t.id}
              className={`countryGuessr-config__region-btn ${selected === t.id ? "active" : ""}`}
              onClick={() => setSelected(t.id)}
            >
              {t.emoji
                ? <span className="countryGuessr-config__region-emoji">{t.emoji}</span>
                : <ContinentIcon continent={t.id} size={24} className="countryGuessr-config__region-emoji" />
              }
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <button
          className="gameBtn g2_green_button countryGuessr-config__play-btn"
          onClick={handlePlay}
        >
          {text("play")}
        </button>
      </div>
    </div>
  );
}
