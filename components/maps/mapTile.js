import { FaHeart } from "react-icons/fa6";

export default function MapTile({ map, onHeart, onClick, country, searchTerm, canHeart }) {
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

  const handleHeartClick = (e) => {
    e.stopPropagation(); // Prevent onClick from firing
    if(!canHeart) return;

    onHeart();
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
          {!map.countryMap && map.created_by_name && (
            <div className="map-tile__author">
              by {highlightMatch(map.created_by_name, searchTerm)}
            </div>
          )}
        </div>
        {!country && map.created_by_name && (
          <button className={`map-tile__heart ${!canHeart ? 'disabled' : ''}`} onClick={handleHeartClick} disabled={!canHeart}>
            {map.hearts}&nbsp;
            <FaHeart color={map.hearted ? "red" : "white"} size={20} />
          </button>
        )}
      </div>

      {/* Review Queue Status and Reject Reason */}
      {!country && map.in_review && map.yours && !map.accepted && (
        <div className={`map-tile__status ${map.reject_reason ? 'rejected' : 'in-review'}`}>
          {!map.accepted && map.resubmittable && map.reject_reason && (
            <span>
              Rejected: {map.reject_reason}
            </span>
          )}
          {!map.accepted && !map.reject_reason && <span>In Review</span>}
        </div>
      )}

      {!country && (
        <div className="map-tile__description">
          {highlightMatch(map.description_short, searchTerm)}
        </div>
      )}
    </div>
  );
}
