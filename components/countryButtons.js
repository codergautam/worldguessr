import nameFromCode from "./utils/nameFromCode";

function countryDiv({country, onPress}) {
  return (
            <div key={country} className="countryCard countryGuessrCard" style={{backgroundImage: `url(https://flagcdn.com/w160/${country?.toLowerCase()}.png)`}}
            onClick={() => {
                onPress(country)
            }}
            >
                <h3 className="countryName">{nameFromCode(country)}</h3>
            </div>
  )

}
export default function CountryBtns({ countries, onCountryPress, shown }) {

  return (
    <div className={`countryGuessrOptions ${shown?"shown":""}`}>
    {countries.map((country) => {
        return countryDiv({country, onPress: onCountryPress})
    })}
    </div>
  )

}