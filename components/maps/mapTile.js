import { memo, useState } from "react";
import { toast } from "react-toastify";
import { FaHeart, FaTrash, FaUser, FaMapMarkerAlt } from "react-icons/fa";
import formatNumber from "../utils/fmtNumber";
import { FaPencil } from "react-icons/fa6";
import { GLOW_DARK, HoverGlowName } from "../utils/usernameWithFlag";

function MapTile({
    onPencilClick,
    showEditControls,
    map,
    onHeart,
    onClick,
    // Stable-callback variant of onClick: receives the map, so the parent can
    // pass ONE function to every tile and the memo below actually holds.
    onSelect,
    // Localized display name (country maps). A string prop instead of cloning
    // the map object per render — object clones defeated the memo too.
    displayName,
    country,
    searchTerm,
    canHeart,
    showReviewOptions,
    secret,
    refreshHome,
    bgImage,
    forcedWidth,
    textColor
}) {
    // Accept either a raw URL or the legacy `url("...")` form, and derive a
    // plain src for a real <img> so the browser can lazy-load + decode async.
    const imageUrl = bgImage
        ? bgImage.replace(/^url\(\s*["']?/, '').replace(/["']?\s*\)$/, '')
        : (country ? `https://flagcdn.com/h240/${country?.toLowerCase()}.png` : "");
    const [mapResubmittable, setMapResubmittable] = useState(map.resubmittable);

    // Define escapeRegExp outside of highlightMatch so it exists before being called
    const escapeRegExp = (string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const highlightMatch = (text, searchTerm) => {
        if (!searchTerm || !text || typeof searchTerm !== 'string') return text;
        if (searchTerm.length < 2) return text;

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
        onHeart(map);
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
            className={`map-tile wg-glowHover ${country ? 'country' : ''} ${!imageUrl ? 'no-image' : ''}`}
            onClick={onSelect ? () => onSelect(map) : onClick}
            // The whole tile acts as a button; role="button" also opts it into
            // the app-wide delegated click sound (audio.js watches [role="button"]).
            role="button"
            style={forcedWidth ? { width: forcedWidth } : {}}
        >
            {/* Top half: Image (only if present) — real <img> so the browser
                lazy-loads/decodes off the main thread instead of us painting
                a CSS background for every offscreen tile. */}
            {imageUrl && (
                <div className="map-tile-image">
                    <img
                        src={imageUrl}
                        // Flags at the density the tile actually renders:
                        // ~140 CSS px wide, so h120 for 1x screens and h240
                        // only on retina. h240-for-everyone doubled decode.
                        srcSet={country ? `https://flagcdn.com/h120/${country?.toLowerCase()}.png 1x, https://flagcdn.com/h240/${country?.toLowerCase()}.png 2x` : undefined}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        // classList, not setState: with up to ~90 flags
                        // trickling in, a React re-render per onLoad turned
                        // image arrival into a render storm. The CSS fade
                        // (.loaded) is untouched.
                        onLoad={(e) => e.currentTarget.classList.add("loaded")}
                    />
                </div>
            )}

            {/* Bottom half: Content */}
            <div className="map-tile-content">
                <div className="map-tile__top-section">
                    <div className="map-tile__name" title={displayName || map.name}>
                        <h3 style={textColor ? { color: textColor } : {}}>{highlightMatch(displayName || map.name, searchTerm)}</h3>
                        
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

                    {/* Actions */}
                    {!country && map.created_by_name && !map.in_review && !map.reject_reason && (
                        <div className="map-tile__actions">
                            <button
                                className={`map-tile__heart ${!canHeart ? 'disabled' : ''} ${map.hearted ? 'hearted' : ''}`}
                                onClick={handleHeartClick}
                                disabled={!canHeart}
                            >
                                {formatNumber(map.hearts, 2)}&nbsp;<FaHeart />
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

                <div className="map-tile__bottom-section">
                    {!country && map.created_by_name && (
                        <div className="map-tile__author">
                            {map.accepted && (
                                <span className="map-tile__locations">
                                    <FaMapMarkerAlt size={12} />
                                    &nbsp;{formatNumber(map.locations, 2)}
                                </span>
                            )}
                            {!process.env.NEXT_PUBLIC_COOLMATH && (
                                <span className="map-tile__username">
                                    {map.accepted && <>&nbsp;•&nbsp;</>}
                                    <FaUser size={12} />
                                    &nbsp;
                                    {/* The real name box owns truncation whether or not a glow is
                                        equipped. Animated glows rest as a static shadow, cross-fade
                                        in while this tile is hovered, then fade smoothly back out;
                                        ownBox keeps both paint layers inside the 34px clip relief. */}
                                    <HoverGlowName
                                        sku={map.created_by_glow}
                                        surface={GLOW_DARK}
                                        ownBox
                                        className="wg-name-clip"
                                    >
                                        {highlightMatch(map.created_by_name, searchTerm)}
                                    </HoverGlowName>
                                </span>
                            )}
                        </div>
                    )}
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

                {/* Reject reason */}
                {map.yours && map.reject_reason && (
                    <div className="map-tile__reject-reason">
                        <strong>Reject Reason:</strong> {map.reject_reason}
                    </div>
                )}
            </div>
        </div>
    );
}

export default memo(MapTile);
