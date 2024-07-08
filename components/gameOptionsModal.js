import { useEffect, useState } from "react";
import {Modal} from "react-responsive-modal";
import nameFromCode from "./utils/nameFromCode";
import { useTranslation } from 'next-i18next'
export default function GameOptions({ shown, onClose, gameOptions, setGameOptions, singleplayer }) {
    const { t: text } = useTranslation("common");

    const [countries, setCountries] = useState({});

    useEffect(() => {
        fetch('/api/getCountries').then(res => res.json()).then(data => {
            setCountries(data)
        });
    }, [shown])

  return (
    <Modal id="infoModal" styles={{
      modal: {
          zIndex: 105,
          background: 'black',
          color: 'white',
          padding: '20px',
          borderRadius: '10px',
          fontFamily: "'Arial', sans-serif",
          maxWidth: '500px',
          textAlign: 'center',
      }
  }} open={shown} center onClose={onClose}>


<div className="countriesContainer">
{singleplayer && (
    <div style={{display: "flex", flexDirection: 'column'}}>
        <div>
            <span>{text('nm')}</span>
            <input type="checkbox" checked={gameOptions.nm} onChange={(e) => {
                setGameOptions({
                    ...gameOptions,
                    nm: e.target.checked
                })
            }
            } />
        </div>
        <div>
            <span>{text('npz')}</span>
            <input type="checkbox" checked={gameOptions.npz} onChange={(e) => {
                setGameOptions({
                    ...gameOptions,
                    npz: e.target.checked
                })
            }
            } />
        </div>
        <div>
            <span>{text('showRoadName')}</span>
            <input type="checkbox" checked={gameOptions.showRoadName} onChange={(e) => {
                setGameOptions({
                    ...gameOptions,
                    showRoadName: e.target.checked
                })
            }
            } />
        </div>
        </div>
    )}

    <div className="countryCard countryCardHeader" onClick={() => {
        setGameOptions({
            ...gameOptions,
            location: "all",
            maxDist: 20000
        })
        onClose();
    }}>
        <h3 className="countryName">{text("allCountries")}</h3>
    </div>
{Object.keys(countries).sort((b,a)=>countries[a]-countries[b]).map(country => {
    return (
        <div key={country} className="countryCard" style={{backgroundImage: `url(https://flagcdn.com/192x144/${country.toLowerCase()}.png)`, backgroundSize: 'cover'}}
        onClick={() => {
            setGameOptions({
                ...gameOptions,
                location: country,
                maxDist: countries[country]
            })
            onClose();
        }}
        >
            <h3 className="countryName">{nameFromCode(country)}</h3>
        </div>
    )
})}
</div>


      <button className="toggleMap" style={{
          fontSize: '16px',
          fontWeight: 'bold',
          color: 'white',
          background: 'green',
          border: 'none',
          borderRadius: '5px',
          padding: '10px 20px',
          cursor: 'pointer'
      }} onClick={() => {
          onClose();
      }}>
          Close
      </button>
  </Modal>
  )
}