import { FaHeart, FaUser } from "react-icons/fa6";

export default function MapTile({ map, onHeart, onClick, hearted, country }) {
  // map => { slug, name, created_at, plays, hearts, id, created_by_name, description_short }

  const backgroundImage = country ? `url("https://flagcdn.com/h240/${country.toLowerCase()}.png")` : "";

  return (
    <div className={`map-tile ${country&&'country'}`} onClick={onClick} style={{
       backgroundImage,
       objectFit: "cover",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "cover"
      }}>
      <div className={`map-tile__header ${country&&'country'}`}>
        <div className="map-tile__mapdetails">
          <div className="map-tile__name">{map.name}</div>
          { !map.countryMap &&
          <div className="map-tile__author">by {map.created_by_name}</div>
}
        </div>
        { !country && (
        <button className="map-tile__heart" onClick={onHeart}>
          {map.hearts}&nbsp;
          <FaHeart color={hearted ? "red" : "white"} size={20} />
        </button>
        )}
      </div>
      {!country && <div className="map-tile__description">{map.description_short}</div> }
    </div>
  );
}
