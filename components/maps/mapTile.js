import { FaHeart, FaUser } from "react-icons/fa6";

export default function MapTile({ map, onHeart, onClick, hearted, country, searchTerm }) {
  // map => { slug, name, created_at, plays, hearts, id, created_by_name, description_short }

  const backgroundImage = country ? `url("https://flagcdn.com/h240/${country.toLowerCase()}.png")` : "";

  const highlightMatch = (text, searchTerm) => {
    if (!searchTerm || !text || typeof searchTerm !== 'string') return text;
    if(searchTerm.length < 3) return text;
    
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.split(regex).map((part, index) =>
      part.toLowerCase() === searchTerm.toLowerCase() ? (
        <span key={index} style={{ backgroundColor: 'darkOrange' }}>{part}</span>
      ) : part
    );
  };

  return (
    <div className={`map-tile ${country && 'country'}`} onClick={onClick} style={{
      backgroundImage,
      objectFit: "cover",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      backgroundSize: "cover"
    }}>
      <div className={`map-tile__header ${country && 'country'}`}>
        <div className="map-tile__mapdetails">
          <div className="map-tile__name">{highlightMatch(map.name, searchTerm)}</div>
          {!map.countryMap && (
            <div className="map-tile__author">
              by {highlightMatch(map.created_by_name, searchTerm)}
            </div>
          )}
        </div>
        {!country && (
          <button className="map-tile__heart" onClick={onHeart}>
            {map.hearts}&nbsp;
            <FaHeart color={hearted ? "red" : "white"} size={20} />
          </button>
        )}
      </div>
      {!country && (
        <div className="map-tile__description">
          {highlightMatch(map.description_short, searchTerm)}
        </div>
      )}
    </div>
  );
}
