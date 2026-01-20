import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { FaSearch, FaPlus, FaArrowLeft, FaMapMarkedAlt, FaChevronDown, FaChevronUp } from "react-icons/fa";
import MakeMapForm from "./makeMap";
import MapTile from "./mapTile";
import { backupMapHome } from "../utils/backupMapHome.js";
import config from "@/clientConfig";
import { useMapSearch } from "../hooks/useMapSearch";

export default function MapView({
    gameOptions,
    mapModalClosing,
    setGameOptions,
    showOptions,
    close,
    session,
    text,
    onMapClick,
    chosenMap,
    showAllCountriesOption,
    makeMap,
    setMakeMap,
    initMakeMap,
    searchTerm,
    setSearchTerm,
    searchResults,
    setSearchResults
}) {
    const [mapHome, setMapHome] = useState({
        message: text("loading") + "...",
    });
    const [heartingMap, setHeartingMap] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [searchLoading, setSearchLoading] = useState(false);
    const [expandedSections, setExpandedSections] = useState({});

    const { handleSearch } = useMapSearch(session, setSearchResults, setSearchLoading);

    useEffect(() => {
        handleSearch(searchTerm);
    }, [searchTerm, handleSearch]);

    function refreshHome(removeMapId) {
        if (removeMapId) {
            setMapHome((prev) => {
                const newMapHome = { ...prev };
                Object.keys(newMapHome).forEach((section) => {
                    newMapHome[section] = newMapHome[section].filter((m) => m.id !== removeMapId.removeMap);
                });
                return newMapHome;
            });
            return;
        }

        setIsLoading(true);
        window.cConfig = config();

        let backupMapHomeTimeout = setTimeout(() => {
            setMapHome(backupMapHome);
            setIsLoading(false);
        }, 5000);

        const isAnon = !session?.token?.secret;
        const mapHomeUrl = window.cConfig.apiUrl + "/api/map/mapHome" + (isAnon ? "?anon=true" : "");
        fetch(mapHomeUrl, isAnon ? {
            method: "GET",
        } : {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                secret: session?.token?.secret,
                inCG: window.inCrazyGames
            }),
        })
        .then((res) => res.json())
        .then((data) => {
            setMapHome(data);
            setIsLoading(false);
            clearTimeout(backupMapHomeTimeout);
        })
        .catch(() => {
            setMapHome(backupMapHome);
            setIsLoading(false);
        });
    }

    useEffect(() => {
        refreshHome();

        // Add debounced resize listener to recalculate grid when window size changes
        let resizeTimeout;
        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                // Force re-render by updating state
                setExpandedSections(prev => ({ ...prev }));
            }, 150); // 150ms debounce
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(resizeTimeout);
        };
    }, [session?.token?.secret]);    function createMap(map) {
        if (!session?.token?.secret) {
            toast.error("Not logged in");
            return;
        }

        fetch(window.cConfig?.apiUrl + "/api/map/action", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: makeMap.edit ? "edit" : "create",
                mapId: makeMap.mapId,
                secret: session?.token?.secret,
                name: map.name,
                description_short: map.description_short,
                description_long: map.description_long,
                data: map.data,
            }),
        })
        .then(async (res) => {
            let json;
            try {
                json = await res.json();
            } catch (e) {
                toast.error("Max file limit 30mb");
                setMakeMap({ ...makeMap, progress: false });
                return;
            }
            if (res.ok) {
                toast.success("Map " + (makeMap.edit ? "edited" : "created"));
                setMakeMap(initMakeMap);
                refreshHome();
            } else {
                setMakeMap({ ...makeMap, progress: false });
                toast.error(json.message);
            }
        })
        .catch(() => {
            setMakeMap({ ...makeMap, progress: false });
            toast.error("Unexpected Error creating map - 2");
        });
    }

    function heartMap(map) {
        if (!session?.token?.secret) {
            toast.error("Not logged in");
            return;
        }

        setHeartingMap(map.id);

        fetch(window.cConfig?.apiUrl + "/api/map/heartMap", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                secret: session?.token?.secret,
                mapId: map.id,
            }),
        })
        .then(async (res) => {
            setHeartingMap("");
            let json;
            try {
                json = await res.json();
            } catch (e) {
                toast.error("Unexpected Error hearting map - 1");
                return;
            }
            if (res.ok && json.success) {
                toast(json.hearted ? text("heartedMap") : text("unheartedMap"), {
                    type: json.hearted ? 'success' : 'info'
                });

                const newHeartsCnt = json.hearts;
                setMapHome((prev) => {
                    const newMapHome = { ...prev };
                    Object.keys(newMapHome).forEach((section) => {
                        newMapHome[section] = newMapHome[section].map((m) => {
                            if (m.id === map.id) {
                                m.hearts = newHeartsCnt;
                                m.hearted = json.hearted;
                            }
                            return m;
                        });

                        if (section === "likedMaps") {
                            if (json.hearted) {
                                newMapHome[section].push(map);
                            } else {
                                newMapHome[section] = newMapHome[section].filter((m) => m.id !== map.id);
                            }
                        }
                    });
                    return newMapHome;
                });

                if (searchResults.length > 0) {
                    setSearchResults((prev) => {
                        return prev.map((m) => {
                            if (m.id === map.id) {
                                m.hearts = newHeartsCnt;
                                m.hearted = json.hearted;
                            }
                            return m;
                        });
                    });
                }
            } else {
                toast.error(text(json.message || json.error || "unexpectedError"));
            }
        })
        .catch((e) => {
            setHeartingMap("");
            console.log(e);
            toast.error("Unexpected Error hearting map - 2");
        });
    }

    const hasResults = searchResults.length > 0 || Object.keys(mapHome)
        .filter((k) => k !== "message")
        .some((section) => {
            const mapsArray = Array.isArray(mapHome[section]) ? mapHome[section].filter(
                (map) =>
                    map.name?.toLowerCase().includes(searchTerm?.toLowerCase()) ||
                    map.description_short?.toLowerCase().includes(searchTerm?.toLowerCase()) ||
                    map.created_by_name?.toLowerCase().includes(searchTerm?.toLowerCase())
            ) : [];
            return mapsArray.length > 0;
        });

    const toggleSection = (sectionKey) => {
        setExpandedSections(prev => {

        // scroll to section top if being collapsed and not in view
        setTimeout(() => {
            const sectionElement = document.getElementById(sectionKey + "_map_view_section");
            if (sectionElement) {
                const sectionTop = sectionElement.getBoundingClientRect().top;
                const sectionHeight = 100;
                const windowHeight = window.innerHeight;
                // If the section is being collapsed and is not in view, scroll to it
                console.log(sectionTop, sectionHeight, windowHeight);
                if (prev[sectionKey] && (sectionTop < 0 || sectionTop + sectionHeight > windowHeight)) {
                    sectionElement.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            }
        }, 100);

        // toggle the section
            return{
            ...prev,
            [sectionKey]: !prev[sectionKey]
        }});
    };

    const getRowsForSection = (section) => {
        if (section === "popular") return 2;
        if (section === "spotlight") return 1; // Spotlight should show 1 row by default
        return 2;
    };

    const getMapsPerRow = (section = "default") => {
        // Get the actual container width and calculate how many tiles can fit
        const container = document.querySelector('.mapView');
        if (!container) {
            // Fallback to screen width based calculation
            if (window.innerWidth >= 1400) return 6;
            if (window.innerWidth >= 1200) return 5;
            if (window.innerWidth >= 1000) return 4;
            if (window.innerWidth >= 768) return 3;
            return 2;
        }

        const containerWidth = container.clientWidth - 40; // Account for padding (20px each side)

        // Get grid gap - starts at 16px but changes based on screen size
        let gridGap = 16;
        if (window.innerWidth <= 480) gridGap = 8;
        else if (window.innerWidth <= 768) gridGap = 12;

        // Get minimum widths that match the CSS exactly - updated for better desktop experience
        let minTileWidth;
        if (section === "countryMaps") {
            // Country maps have smaller tiles
            if (window.innerWidth <= 360) minTileWidth = 100;
            else if (window.innerWidth <= 480) minTileWidth = 120;
            else if (window.innerWidth <= 768) minTileWidth = 150;
            else if (window.innerWidth <= 1000) minTileWidth = 170;
            else if (window.innerWidth <= 1200) minTileWidth = 180;
            else minTileWidth = 180;
        } else {
            // Regular maps - increased minimum widths for better desktop experience
            if (window.innerWidth <= 360) minTileWidth = 120;
            else if (window.innerWidth <= 480) minTileWidth = 140;
            else if (window.innerWidth <= 768) minTileWidth = 170;
            else if (window.innerWidth <= 1000) minTileWidth = 190;
            else if (window.innerWidth <= 1200) minTileWidth = 200;
            else if (window.innerWidth <= 1400) minTileWidth = 220;
            else minTileWidth = 200;
        }

        // Calculate how many tiles can fit using the same formula as CSS auto-fit
        const tilesPerRow = Math.floor((containerWidth + gridGap) / (minTileWidth + gridGap));
        return Math.max(1, tilesPerRow); // Ensure at least 1 tile per row
    };    if (makeMap.open) {
        return (
            <div className={`mapView ${mapModalClosing ? "slideout_right" : ""}`}>
                <div className="map-header">
                    <div className="map-header-left">
                        <button
                            onClick={() => setMakeMap({ ...makeMap, open: false })}
                            className="map-back-btn"
                        >
                            <FaArrowLeft /> {text("back")}
                        </button>
                        <h1 className="map-title">
                            {makeMap?.edit ? "Edit Map" : "Make Map"}
                        </h1>
                    </div>
                </div>
                <MakeMapForm map={makeMap} setMap={setMakeMap} createMap={createMap} />
            </div>
        );
    }

    return (
        <div className={`mapView ${mapModalClosing ? "slideout_right" : ""}`}>
            {/* Header */}
            <div className="map-header">
                <div className="map-header-left">
                    <button onClick={close} className="map-back-btn">
                        <FaArrowLeft /> {text("close")}
                    </button>
                    <h1 className="map-title">{text("maps")}</h1>
                </div>
                {session?.token?.secret && (
                    <button
                        onClick={() => setMakeMap({ ...makeMap, open: true })}
                        className="map-create-btn"
                    >
                        <FaPlus /> Make Map
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="map-search-section">
                <div className="map-search-container">
                    <FaSearch className="map-search-icon" />
                    <input
                        type="text"
                        placeholder={text("searchForMaps")}
                        className="map-search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Game Options */}
            {showOptions && (
                <div className="map-options">
                    {/* <div className="map-option">
                        <input
                            type="checkbox"
                            id="nm"
                            checked={gameOptions.nm}
                            onChange={(e) => setGameOptions({ ...gameOptions, nm: e.target.checked })}
                        />
                        <label htmlFor="nm">{text('nm')}</label>
                    </div>
                    <div className="map-option">
                        <input
                            type="checkbox"
                            id="npz"
                            checked={gameOptions.npz}
                            onChange={(e) => setGameOptions({ ...gameOptions, npz: e.target.checked })}
                        />
                        <label htmlFor="npz">{text('npz')}</label>
                    </div>
                    <div className="map-option">
                        <input
                            type="checkbox"
                            id="showRoadName"
                            checked={gameOptions.showRoadName}
                            onChange={(e) => setGameOptions({ ...gameOptions, showRoadName: e.target.checked })}
                        />
                        <label htmlFor="showRoadName">{text('showRoadName')}</label>

                    </div> */}

{/* <label>{text('degradedMaps')}</label>
 */}

    {/*  re enable only NMPZ (basically setGameOptions both nm and npz to e.target.checked) */}
    <div>
        <label htmlFor="nmpz">{text('nmpz')}&nbsp;</label>
        <input id="nmpz"
        name="nmpz"
        type="checkbox" checked={gameOptions.nm && gameOptions.npz} onChange={(e) => {
            setGameOptions({ ...gameOptions, nm: e.target.checked, npz: e.target.checked })
        }} />
    </div>

                </div>
            )}

            {/* Loading State */}
            {isLoading && (
                <div className="maps-loading">
                    <div className="maps-loading-spinner"></div>
                    <div className="maps-loading-text">{text("loading")}...</div>
                </div>
            )}

            {/* Content */}
            {!isLoading && (
                <>
                    {/* All Countries Option */}
                    {showAllCountriesOption &&
                     ((searchTerm.length === 0) ||
                      (text("allCountries")?.toLowerCase().includes(searchTerm?.toLowerCase()))) && (
                        <div className="all-countries-tile">
                            <MapTile
                            bgImage={"url(\"/world.jpg\")"}
                            forcedWidth="300px"
                                map={{ name: text("allCountries"), slug: "all" }}
                                onClick={() => onMapClick({ name: text("allCountries"), slug: "all" })}
                                searchTerm={searchTerm}
                            />
                        </div>
                    )}

                    {/* Map Sections */}
                    {hasResults ? (
                        // Ensure we have sections to iterate, and include "recent" if we have search results
                        (() => {
                            const sections = Object.keys(mapHome).filter((k) => k !== "message");
                            // Add "recent" if not present but we have search results
                            if (searchResults.length > 0 && !sections.includes("recent")) {
                                sections.push("recent");
                            }
                            return sections;
                        })()
                            .filter((k) => !process.env.NEXT_PUBLIC_COOLMATH || k !== "recent")
                            .map((section, si) => {
                                const mapsArray = section === "recent" && searchResults.length > 0
                                    ? searchResults
                                    : (Array.isArray(mapHome[section]) ? mapHome[section] : []).filter((map) =>
                                        map.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        map.description_short?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        map.created_by_name?.toLowerCase().includes(searchTerm?.toLowerCase())
                                    );

                                if (mapsArray.length === 0) return null;

                                const isExpanded = expandedSections[section] || section === "recent";
                                const rows = getRowsForSection(section);
                                const mapsPerRow = getMapsPerRow(section);
                                const defaultMaxMaps = rows * mapsPerRow;
                                const shouldShowExpandButton = mapsArray.length > defaultMaxMaps && section !== "recent";
                                const displayedMaps = isExpanded ? mapsArray : mapsArray.slice(0, defaultMaxMaps);

                                return (
                                    <div key={si} className="map-section">
                                        <h2
                                            id={section + "_map_view_section"}
                                            className="map-section-title"
                                        >
                                            {text(section)}
                                            {["myMaps", "likedMaps", "reviewQueue"].includes(section) &&
                                             ` (${mapsArray.length})`}
                                        </h2>
                                        <div className="map-section-container">
                                            <div className={`map-grid ${section === "countryMaps" ? "country-maps" : ""} ${section === "popular" ? "popular-maps" : ""} ${section === "spotlight" ? "spotlight-maps" : ""} ${!isExpanded && section !== "recent" ? "collapsed" : "expanded"}`}>
                                                {displayedMaps.map((map, i) => (
                                                    <MapTile
                                                        key={map.id || i}
                                                        map={map}
                                                        canHeart={session?.token?.secret && heartingMap !== map.id}
                                                        onClick={() => onMapClick(map)}
                                                        country={map.countryMap}
                                                        searchTerm={searchTerm}
                                                        secret={session?.token?.secret}
                                                        refreshHome={refreshHome}
                                                        showEditControls={
                                                            (map.yours && section === "myMaps") ||
                                                            session?.token?.staff
                                                        }
                                                        showReviewOptions={
                                                            session?.token?.staff && section === "reviewQueue"
                                                        }
                                                        onPencilClick={(map) => {
                                                            setMakeMap({
                                                                ...initMakeMap,
                                                                open: true,
                                                                edit: true,
                                                                mapId: map.id,
                                                                name: map.name,
                                                                description_short: map.description_short,
                                                                description_long: map.description_long,
                                                                data: map.data.map((loc) => JSON.stringify(loc)),
                                                            });
                                                        }}
                                                        onHeart={() => heartMap(map)}
                                                    />
                                                ))}
                                            </div>

                                            {shouldShowExpandButton && (
                                                <button
                                                    className="show-more-btn"
                                                    onClick={() => toggleSection(section)}
                                                >
                                                    {isExpanded ? (
                                                        <>
                                                            <FaChevronUp />
                                                            Show Less
                                                        </>
                                                    ) : (
                                                        <>
                                                            <FaChevronDown />
                                                            Show All
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                    ) : searchLoading ? (
                        <div className="maps-loading">
                            <div className="maps-loading-spinner"></div>
                            <div className="maps-loading-text">{text("loading")}...</div>
                        </div>
                    ) : (
                        <div className="no-results">
                            <FaMapMarkedAlt className="no-results-icon" />
                            <h3 className="no-results-title">{text("noResultsFound")}</h3>
                            <p className="no-results-text">
                                Try adjusting your search terms or browse our featured maps.
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}