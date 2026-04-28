import { useState, useEffect } from "react";
import nameFromCode from "./utils/nameFromCode";
import { useTranslation } from '@/components/useTranslations';
import ContinentIcon from './ContinentIcon';
import { continentKey } from './utils/continentLocale';

function countryDiv({country, onPress, index, interactive, lang}) {
  const fullName = nameFromCode(country, lang);
  return (
    <button
      key={country}
      className={`countryGuessrBtn ${interactive ? '' : 'countryGuessrBtn--noHover'}`}
      style={{ animationDelay: `${index * 0.07}s` }}
      onClick={() => interactive && onPress(country)}
      title={fullName}
    >
      <img
        className="countryGuessrBtn__flag"
        src={`https://flagcdn.com/w80/${country?.toLowerCase()}.png`}
        alt={fullName}
      />
      <span className="countryGuessrBtn__name">{fullName}</span>
    </button>
  )
}

function continentDiv({continent, onPress, index, interactive, text}) {
  const fullName = text(continentKey(continent));
  return (
    <button
      key={continent}
      className={`countryGuessrBtn countryGuessrBtn--continent ${interactive ? '' : 'countryGuessrBtn--noHover'}`}
      style={{ animationDelay: `${index * 0.06}s` }}
      onClick={() => interactive && onPress(continent)}
      title={fullName}
    >
      <ContinentIcon continent={continent} size={34} className="countryGuessrBtn__emoji" />
      <span className="countryGuessrBtn__name">{fullName}</span>
    </button>
  )
}

export default function CountryBtns({ countries, onCountryPress, shown, mode, compact }) {
  const { t: text, lang } = useTranslation("common");
  const isContinent = mode === "continent" || (countries?.length === 6 && countries?.includes?.("Africa"));
  const [interactive, setInteractive] = useState(false);

  // Disable hover/click briefly when new options appear to prevent ghost hover
  useEffect(() => {
    setInteractive(false);
    const timer = setTimeout(() => setInteractive(true), 500);
    return () => clearTimeout(timer);
  }, [countries]);

  // Only mount the buttons once the container is shown. Otherwise they mount while
  // the parent is display:none (during map-switch loading), which stalls the
  // `cardSlideIn` animation — when the container later becomes display:flex the
  // animation doesn't re-trigger and the buttons stay stuck at opacity 0.
  return (
    <div className={`countryGuessrOptions ${shown ? "shown" : ""} ${isContinent ? "continentMode" : ""} ${compact ? "compactMode" : ""}`}>
      <p className="countryGuessrPrompt">{isContinent ? text("whichContinent") : text("whichCountry")}</p>
      <div className="countryGuessrBtnRow">
        {shown && countries.map((item, i) => {
          if (isContinent) {
            return continentDiv({ continent: item, onPress: onCountryPress, index: i, interactive, text })
          }
          return countryDiv({ country: item, onPress: onCountryPress, index: i, interactive, lang })
        })}
      </div>
    </div>
  )
}
