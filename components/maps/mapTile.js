import { useState } from "react";
import { toast } from "react-toastify";
import formatNumber from "../utils/fmtNumber";
import { FaHeart, FaPencil, FaTrash } from "react-icons/fa6";

export default function MapTile({ onPencilClick, showEditControls, map, onHeart, onClick, country, searchTerm, canHeart, showReviewOptions, secret, refreshHome }) {
  const backgroundImage = country ? `url("https://flagcdn.com/h240/${country?.toLowerCase()}.png")` : "";

  const highlightMatch = (text, searchTerm) => {
    if (!searchTerm || !text || typeof searchTerm !== 'string') return text;
    if(searchTerm.length < 3) return text;

    const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');

    function escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return text.split(regex).map((part, index) =>
      part?.toLowerCase() === searchTerm?.toLowerCase() ? (
        <span key={index} style={{ backgroundColor: 'darkOrange' }}>{part}</span>
      ) : part
    );
  };

  const handleHeartClick = (e) => {
    e.stopPropagation(); // Prevent onClick from firing
    if(!canHeart) return;

    onHeart();
  };

  const onReview = (e, mapId, accepted) => {
    e.stopPropagation();
    let reject_reason = null;
    if(!accepted) {
      reject_reason = prompt("Please enter a reason for rejecting this map:");
      if(reject_reason === null) return;
    }

    fetch(`/api/map/approveRejectMap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        secret,
        mapId,
        action: accepted ? 'approve' : 'reject',
        rejectReason: reject_reason,
        resubmittable: mapResubmittable
      })
    }).then(res => {
      res.json().then(data => {
        if(res.ok) {
          toast.success(data.message);
          refreshHome({removeMap: mapId});
        } else {
          toast.error(data.message);
          refreshHome();
        }
      }).catch(err => {
        console.error(err);
        toast.error("An error occurred while trying to review the map. Please try again later.");
      });
    }).catch(err => {
      console.error(err);
      toast.error("An error occurred while trying to review the map. Please try again later.");
    });
  };

  const onDelete = (e, mapId) => {
    e.stopPropagation();

    if (confirm("Are you sure you want to delete this map?")) {
      fetch(`/api/map/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          secret,
          mapId
        })
      }).then(res => {
        res.json().then(data => {
          if(res.ok) {
            toast.success(data.message);
            refreshHome();
          } else {
            toast.error(data.message);
          }
        }).catch(err => {
          console.error(err);
          toast.error("An error occurred while trying to delete the map. Please try again later.");
        });
      }).catch(err => {
        console.error(err);
        try {
          err.json().then(data => {
            toast.error(data.message);
          });
        } catch {
          toast.error("An error occurred while trying to delete the map. Please try again later.");
        }
      });
    }
  };

  const [mapResubmittable, setMapResubmittable] = useState(map.resubmittable);

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
          <div className="map-tile__name" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <p>{highlightMatch(map.name, searchTerm)}</p>
            {/* Review Queue Status and Reject Reason */}
            {!country && (map.in_review || map.reject_reason) && map.yours && !map.accepted && (
              <div className={`map-tile__status ${map.reject_reason ? 'rejected' : 'in-review'}`}>
                {!map.accepted && map.resubmittable && map.reject_reason && (
                  <span>Rejected</span>
                )}
                {!map.accepted && !map.reject_reason && <span>In Review</span>}

                { showReviewOptions && (
                  // accept and reject buttons
                  <div className="map-tile__review-options" onClick={(e) => e.stopPropagation()}>
                    <button className="accept" onClick={(e) => onReview(e, map.id, true)}>Accept</button>
                    <button className="reject" onClick={(e) => onReview(e, map.id, false)}>Reject</button>
                    {/* reject resubmittable */}
                    resubmittable?
                    <input type="checkbox" id="resubmittable" name="resubmittable" checked={mapResubmittable} onChange={(e) => {
                      e.stopPropagation();
                      setMapResubmittable(!mapResubmittable);
                    }} />
                  </div>
                )}
              </div>
            )}
          </div>
          {!map.countryMap && map.created_by_name && (
            <div className="map-tile__author">
              by {highlightMatch(map.created_by_name, searchTerm)}

              {map.accepted && (
                <span style={{color: 'rgba(255, 255, 255, 0.5)'}}>&nbsp; &middot; {formatNumber(map.locations, 3)} locations</span>
              )}

            </div>
          )}

{map.locations && (
            <div className="map-tile__author">

                <span style={{color: 'rgba(255, 255, 255, 0.5)'}}>

                 </span>
                </div>
              )}
        </div>
        {!country && map.created_by_name && !map.in_review && !map.reject_reason && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className={`map-tile__heart ${!canHeart ? 'disabled' : ''}`} onClick={handleHeartClick} disabled={!canHeart}>
              {map.hearts}&nbsp;
              <FaHeart color={map.hearted ? "red" : "white"} size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexDirection: 'column' }}>
            {showEditControls && map.yours && (
              <button className="map-tile__delete" onClick={(e) => onDelete(e, map.id)}>
                <FaTrash color="red" size={10} />
              </button>
            )}
            {showEditControls && map.yours && (
              <button className="map-tile__edit" onClick={(e) => {
                e.stopPropagation()
                onPencilClick(map)
              }}>
                <FaPencil color="white" size={10} />
              </button>
            )}
            </div>
          </div>
        )}
      </div>

      {/* {!country && (
        <div className="map-tile__description">
          {highlightMatch(map.description_short, searchTerm)}
        </div>
      )} */}
      {map.yours && map.reject_reason && (
        <div className="map-tile__reject-reason">
          <p>Reject Reason: {map.reject_reason}</p>
        </div>
      )}
    </div>
  );
}
