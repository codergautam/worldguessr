import { FaHeart, FaUser } from "react-icons/fa6";

export default function MapTile({ map, onHeart, onClick, hearted }) {
  // map => { slug, name, created_at, created_by, plays, hearts, data, _id, created_by_name, description_short, description_long }

  return (
    <div className="map-tile" onClick={onClick}>
      <div className="map-tile__header">
        <div className="map-tile__mapdetails">
        <div className="map-tile__name">{map.name}</div>



      <div className="map-tile__author">by {map.created_by_name}</div>

        </div>
        <button className="map-tile__heart" onClick={onHeart}>
          { map.hearts }&nbsp;
          <FaHeart color={hearted ? "red" : "white"} size={20} />
        </button>
      </div>
      <div className="map-tile__description">{map.description_short}</div>
    </div>
  );
}
