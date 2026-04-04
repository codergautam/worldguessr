import { useState, useEffect } from "react";
import nameFromCode from "./utils/nameFromCode";
import { useTranslation } from '@/components/useTranslations';
import ContinentIcon from './ContinentIcon';
import { continentKey } from './utils/continentLocale';

function countryDiv({country, onPress, index, interactive}) {
  return (
    <button
      key={country}
      className={`countryGuessrBtn ${interactive ? '' : 'countryGuessrBtn--noHover'}`}
      style={{ animationDelay: `${index * 0.07}s` }}
      onClick={() => interactive && onPress(country)}
    >
      <img
        className="countryGuessrBtn__flag"
        src={`https://flagcdn.com/w80/${country?.toLowerCase()}.png`}
        alt={nameFromCode(country)}
      />
      <span className="countryGuessrBtn__name">{nameFromCode(country)}</span>
    </button>
  )
}

function continentDiv({continent, onPress, index, interactive, text}) {
  return (
    <button
      key={continent}
      className={`countryGuessrBtn countryGuessrBtn--continent ${interactive ? '' : 'countryGuessrBtn--noHover'}`}
      style={{ animationDelay: `${index * 0.06}s` }}
      onClick={() => interactive && onPress(continent)}
    >
      <ContinentIcon continent={continent} size={28} className="countryGuessrBtn__emoji" />
      <span className="countryGuessrBtn__name">{text(continentKey(continent))}</span>
    </button>
  )
}

export default function CountryBtns({ countries, onCountryPress, shown, mode, compact }) {
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
    <div className={`countryGuessrOptions ${shown ? "shown" : ""} ${isContinent ? "continentMode" : ""} ${compact ? "compactMode" : ""}`}>
      <p className="countryGuessrPrompt">{isContinent ? text("whichContinent") : text("whichCountry")}</p>
      <div className="countryGuessrBtnRow">
        {countries.map((item, i) => {
          if (isContinent) {
            return continentDiv({ continent: item, onPress: onCountryPress, index: i, interactive, text })
          }
          return countryDiv({ country: item, onPress: onCountryPress, index: i, interactive })
        })}
      </div>
    </div>
  )
}
