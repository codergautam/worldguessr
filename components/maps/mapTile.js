import { useState } from "react";
import { toast } from "react-toastify";
import { FaHeart, FaTrash, FaUser, FaMapMarkerAlt } from "react-icons/fa";
import formatNumber from "../utils/fmtNumber";
import { FaPencil } from "react-icons/fa6";

export default function MapTile({
    onPencilClick,
    showEditControls,
    map,
    onHeart,
    onClick,
    country,
    searchTerm,
    canHeart,
    showReviewOptions,
    secret,
    refreshHome,
    bgImage,
    forcedWidth
}) {
    const backgroundImage = bgImage ? bgImage : (country ? `url("https://flagcdn.com/h240/${country?.toLowerCase()}.png")` : "");
    const [mapResubmittable, setMapResubmittable] = useState(map.resubmittable);

    // Define escapeRegExp outside of highlightMatch so it exists before being called
    const escapeRegExp = (string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const highlightMatch = (text, searchTerm) => {
        if (!searchTerm || !text || typeof searchTerm !== 'string') return text;
        if (searchTerm.length < 3) return text;

        const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');

        return text.split(regex).map((part, index) =>
            part?.toLowerCase() === searchTerm?.toLowerCase() ? (
                <span key={index} className="highlight-match">{part}</span>
            ) : part
        );
    };

    const handleHeartClick = (e) => {
        e.stopPropagation();
        if (!canHeart) return;
        onHeart();
    };

    // Rest of the component remains unchanged
    const onReview = (e, mapId, accepted) => {
        e.stopPropagation();
        let reject_reason = null;
        if (!accepted) {
            reject_reason = prompt("Please enter a reason for rejecting this map:");
            if (reject_reason === null) return;
        }

        fetch(window.cConfig.apiUrl + `/api/map/approveRejectMap`, {
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
                if (res.ok) {
                    toast.success(data.message);
                    refreshHome({ removeMap: mapId });
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
            fetch(window.cConfig.apiUrl + `/api/map/delete`, {
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
                    if (res.ok) {
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
                toast.error("An error occurred while trying to delete the map. Please try again later.");
            });
        }
    };

    return (
        <div
            className={`map-tile ${country ? 'country' : ''}`}
            onClick={onClick}
            style={backgroundImage ? { backgroundImage,

                backgroundSize: 'cover',
                backgroundRepeat: 'no-repeat',
                width: forcedWidth ? forcedWidth : undefined
             } : {}}
        >
            <div className={`map-tile__header ${country ? 'country' : ''}`}>
                <div className="map-tile__mapdetails">
                    <div className="map-tile__content">
                        {/* Top section with title and actions */}
                        <div className="map-tile__top-section">
                            <div className="map-tile__name">
                                <h3>{highlightMatch(map.name, searchTerm)}</h3>

                                {/* Status indicators */}
                                {!country && (map.in_review || map.reject_reason) && map.yours && !map.accepted && (
                                    <div className={`map-tile__status ${map.reject_reason ? 'rejected' : 'in-review'}`}>
                                        {!map.accepted && map.resubmittable && map.reject_reason && (
                                            <span>Rejected</span>
                                        )}
                                        {!map.accepted && !map.reject_reason && <span>In Review</span>}
                                    </div>
                                )}
                            </div>

                            {/* Actions - only show if not country and has creator name and not in review */}
                            {!country && map.created_by_name && !map.in_review && !map.reject_reason && (
                                <div className="map-tile__actions">
                                    <button
                                        className={`map-tile__heart ${!canHeart ? 'disabled' : ''} ${map.hearted ? 'hearted' : ''}`}
                                        onClick={handleHeartClick}
                                        disabled={!canHeart}
                                    >
                                        {map.hearts}&nbsp;<FaHeart />
                                    </button>

                                    {showEditControls && map.yours && (
                                        <div className="map-tile__controls">
                                            <button
                                                className="map-tile__edit"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    fetch(window.cConfig.apiUrl + `/api/map/action`, {
                                                        method: 'POST',
                                                        headers: {
                                                            'Content-Type': 'application/json'
                                                        },
                                                        body: JSON.stringify({
                                                            secret,
                                                            action: 'get',
                                                            mapId: map.id
                                                        })
                                                    }).then(res => {
                                                        res.json().then(data => {
                                                            if (res.ok) {
                                                                const fullMap = data.map;
                                                                onPencilClick({
                                                                    ...map,
                                                                    data: fullMap.data,
                                                                    description_long: fullMap.description_long
                                                                });
                                                            } else {
                                                                toast.error(data.message);
                                                            }
                                                        }).catch(err => {
                                                            console.error(err);
                                                            toast.error("An error occurred while trying to retrieve the map data. Please try again later.");
                                                        });
                                                    }).catch(err => {
                                                        console.error(err);
                                                        toast.error("An error occurred while trying to retrieve the map data. Please try again later.");
                                                    });
                                                }}
                                            >
                                                <FaPencil />
                                            </button>
                                            <button
                                                className="map-tile__delete"
                                                onClick={(e) => onDelete(e, map.id)}
                                            >
                                                <FaTrash />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Bottom section with author info - always at bottom */}
                        <div className="map-tile__bottom-section">
                            {!country && map.created_by_name && (
                                <div className="map-tile__author">
                                    <FaUser size={12} />
                                    {!process.env.NEXT_PUBLIC_COOLMATH && (
                                        <>
                                            {highlightMatch(map.created_by_name, searchTerm)}
                                            &nbsp;•&nbsp;
                                        </>
                                    )}
                                    {map.accepted && (
                                        <span>
                                            <FaMapMarkerAlt size={12} />
                                            &nbsp;{formatNumber(map.locations, 2)}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Review options for staff */}
                    {showReviewOptions && (
                        <div className="map-tile__review-options" onClick={(e) => e.stopPropagation()}>
                            <button className="accept" onClick={(e) => onReview(e, map.id, true)}>
                                Accept
                            </button>
                            <button className="reject" onClick={(e) => onReview(e, map.id, false)}>
                                Reject
                            </button>
                            <label>
                                Resubmittable?
                                <input
                                    type="checkbox"
                                    checked={mapResubmittable}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        setMapResubmittable(!mapResubmittable);
                                    }}
                                />
                            </label>
                        </div>
                    )}
                </div>
            </div>

            {/* Reject reason */}
            {map.yours && map.reject_reason && (
                <div className="map-tile__reject-reason">
                    <strong>Reject Reason:</strong> {map.reject_reason}
                </div>
            )}
        </div>
    );
}