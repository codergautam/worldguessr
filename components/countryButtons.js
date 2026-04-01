import { useState, useEffect } from "react";
import nameFromCode from "./utils/nameFromCode";
import { useTranslation } from '@/components/useTranslations';

const CONTINENT_EMOJIS = {
  "Africa": "🌍",
  "Asia": "🌏",
  "Europe": "🌍",
  "North America": "🌎",
  "South America": "🌎",
  "Oceania": "🌏",
};

function countryDiv({country, onPress, index, interactive}) {
  return (
    <button
      key={country}
      className={`cgBtn ${interactive ? '' : 'cgBtn--noHover'}`}
      style={{ animationDelay: `${index * 0.07}s` }}
      onClick={() => interactive && onPress(country)}
    >
      <img
        className="cgBtn__flag"
        src={`https://flagcdn.com/w80/${country?.toLowerCase()}.png`}
        alt={nameFromCode(country)}
      />
      <span className="cgBtn__name">{nameFromCode(country)}</span>
    </button>
  )
}

function continentDiv({continent, onPress, index, interactive}) {
  return (
    <button
      key={continent}
      className={`cgBtn cgBtn--continent ${interactive ? '' : 'cgBtn--noHover'}`}
      style={{ animationDelay: `${index * 0.06}s` }}
      onClick={() => interactive && onPress(continent)}
    >
      <span className="cgBtn__emoji">{CONTINENT_EMOJIS[continent] || "🌐"}</span>
      <span className="cgBtn__name">{continent}</span>
    </button>
  )
}

export default function CountryBtns({ countries, onCountryPress, shown, mode }) {
  const { t: text } = useTranslation("common");
  const isContinent = mode === "continent" || (countries?.length === 6 && countries?.includes?.("Africa"));
  const [interactive, setInteractive] = useState(false);

  // Disable hover/click briefly when new options appear to prevent ghost hover
  useEffect(() => {
    setInteractive(false);
    const timer = setTimeout(() => setInteractive(true), 500);
    return () => clearTimeout(timer);
  }, [countries]);

  return (
    <div className={`countryGuessrOptions ${shown ? "shown" : ""} ${isContinent ? "continentMode" : ""}`}>
      <p className="cgPrompt">{isContinent ? text("whichContinent") : text("whichCountry")}</p>
      <div className="cgBtnRow">
        {countries.map((item, i) => {
          if (isContinent) {
            return continentDiv({ continent: item, onPress: onCountryPress, index: i, interactive })
          }
          return countryDiv({ country: item, onPress: onCountryPress, index: i, interactive })
        })}
      </div>
    </div>
  )
}
