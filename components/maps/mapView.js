import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-toastify";
import { FaSearch, FaPlus, FaArrowLeft, FaMapMarkedAlt, FaChevronDown, FaChevronUp } from "react-icons/fa";
import MakeMapForm from "./makeMap";
import MapTile from "./mapTile";
import { backupMapHome } from "../utils/backupMapHome.js";
import config from "@/clientConfig";
import { useMapSearch } from "../hooks/useMapSearch";
import { asset } from '@/lib/basePath';
import nameFromCode from "../utils/nameFromCode";
import { useTranslation } from '@/components/useTranslations';

export default function MapView({
    gameOptions,
    setGameOptions,
    showOptions,
    showTimerOption,
    close,
    session,
    text,
    onMapClick,
    chosenMap,
    showAllCountriesOption,
    hideCountryGuessrModes,
    makeMap,
    setMakeMap,
    initMakeMap,
    searchTerm,
    setSearchTerm,
    searchResults,
    setSearchResults
}) {
    const { lang } = useTranslation();
    const [mapHome, setMapHome] = useState({
        message: text("loading") + "...",
    });
    const [heartingMap, setHeartingMap] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [searchLoading, setSearchLoading] = useState(false);
    const [expandedSections, setExpandedSections] = useState({});
    // Cache the container's content-box width so getMapsPerRow doesn't have
    // to query the DOM (and re-layout) on every render.
    const containerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(0);

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
    }, [session?.token?.secret]);

    // Track the .mapView content width via ResizeObserver. This replaces a
    // window 'resize' listener + per-render document.querySelector — both
    // were causing layout thrash on low-end devices when scrolling.
    useEffect(() => {
        const node = containerRef.current;
        if (!node) return;
        // Seed from current size so the first paint computes correctly.
        setContainerWidth(node.clientWidth);
        if (typeof ResizeObserver === 'undefined') return;
        let raf = 0;
        const ro = new ResizeObserver((entries) => {
            // Coalesce rapid notifications into a single state update.
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const entry = entries[entries.length - 1];
                const w = entry?.contentRect?.width ?? node.clientWidth;
                setContainerWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
            });
        });
        ro.observe(node);
        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, []);    function createMap(map) {
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
            const wasExpanded = !!prev[sectionKey];

            // Only scroll UP to the section header when going from expanded -> collapsed
            // and the header is above the viewport. Never scroll down (e.g. on "Show all").
            if (wasExpanded) {
                setTimeout(() => {
                    const sectionElement = document.getElementById(sectionKey + "_map_view_section");
                    if (!sectionElement) return;
                    const sectionTop = sectionElement.getBoundingClientRect().top;
                    if (sectionTop < 0) {
                        sectionElement.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                }, 100);
            }

            return {
                ...prev,
                [sectionKey]: !wasExpanded
            };
        });
    };

    const getRowsForSection = (section) => {
        if (section === "popular") return 4;
        if (section === "spotlight") return 1; // Spotlight should show 1 row by default
        return 2;
    };

    const getMapsPerRow = useCallback((section = "default") => {
        const isCountry = section === 'countryMaps';
        const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;

        if (!containerWidth) {
            if (winW >= 1400) return isCountry ? 9 : 6;
            if (winW >= 1200) return isCountry ? 8 : 5;
            if (winW >= 1000) return isCountry ? 6 : 4;
            if (winW >= 800) return isCountry ? 5 : 3;
            return isCountry ? 3 : 2;
        }

        // ResizeObserver gives the content-box width already, so no padding
        // subtraction is needed here. Gap/min-width below must match the CSS.
        let gridGap;
        let minTileWidth;
        if (winW <= 480) {
            gridGap = 8;
            minTileWidth = isCountry ? 95 : 140;
        } else if (winW <= 800) {
            gridGap = isCountry ? 10 : 12;
            minTileWidth = isCountry ? 110 : 160;
        } else {
            gridGap = isCountry ? 12 : 16;
            minTileWidth = isCountry ? 125 : 160;
        }

        const tilesPerRow = Math.floor((containerWidth + gridGap) / (minTileWidth + gridGap));
        return Math.max(1, tilesPerRow);
    }, [containerWidth]);    if (makeMap.open) {
        return (
            <div className="mapView" ref={containerRef}>
                <div className="map-header">
                    <div className="map-header-left">
                        <button
                            onClick={() => setMakeMap({ ...makeMap, open: false })}
                            className="map-back-btn"
                        >
                            <FaArrowLeft /> {text("back")}
                        </button>
                        <h1 className="map-title">
                            {makeMap?.edit ? text("editMap") : text("makeMap")}
                        </h1>
                    </div>
                </div>
                <MakeMapForm map={makeMap} setMap={setMakeMap} createMap={createMap} />
            </div>
        );
    }

    return (
        <div className="mapView" ref={containerRef}>
            {/* Sticky Header Container */}
            <div className="map-sticky-header">
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
                            <FaPlus /> {text("makeMap")}
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
                        <div>
                            <label htmlFor="nmpz">{text('nmpz')}&nbsp;</label>
                            <input id="nmpz"
                            name="nmpz"
                            type="checkbox" checked={gameOptions.nm && gameOptions.npz} onChange={(e) => {
                                setGameOptions({ ...gameOptions, nm: e.target.checked, npz: e.target.checked })
                            }} />
                        </div>

                        {showTimerOption && (
                        <div className="map-option-timer">
                            <label htmlFor="enableTimer">{text('enableTimer')}&nbsp;</label>
                            <input id="enableTimer"
                            name="enableTimer"
                            type="checkbox" checked={gameOptions.timePerRound > 0} onChange={(e) => {
                                setGameOptions({ ...gameOptions, timePerRound: e.target.checked ? 30 : 0 })
                            }} />
                            {gameOptions.timePerRound > 0 && (
                                <div className="timer-slider">
                                    <input
                                        type="range"
                                        min="10"
                                        max="300"
                                        step="10"
                                        value={gameOptions.timePerRound}
                                        onChange={(e) => setGameOptions({ ...gameOptions, timePerRound: parseInt(e.target.value) })}
                                    />
                                    <span className="timer-slider-value">{gameOptions.timePerRound}s</span>
                                </div>
                            )}
                        </div>
                        )}
                    </div>
                )}

                {/* Category Pills Navigation */}
                <div className="map-category-pills">
                    <button className="map-category-pill" onClick={() => document.getElementById("spotlight_map_view_section")?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                        {text("spotlight")}
                    </button>
                    <button className="map-category-pill" onClick={() => document.getElementById("popular_map_view_section")?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                        {text("popular")}
                    </button>
                    <button className="map-category-pill" onClick={() => document.getElementById("recent_map_view_section")?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                        {text("recent")}
                    </button>
                </div>
            </div>

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
                    {/* Singleplayer Mode Tiles */}
                    {showAllCountriesOption && (searchTerm.length === 0 ||
                      [text("allCountries"), !hideCountryGuessrModes && text("countryGuesser"), !hideCountryGuessrModes && text("continentGuesser")].some(
                        label => label && label?.toLowerCase().includes(searchTerm?.toLowerCase())
                      )) && (
                        <div className="singleplayer-mode-tiles">
                            {((searchTerm.length === 0) || text("allCountries")?.toLowerCase().includes(searchTerm?.toLowerCase())) && (
                                <MapTile
                                    bgImage={`url("${asset('/world.jpg')}")`}
                                    map={{ name: text("allCountries"), slug: "all" }}
                                    onClick={() => onMapClick({ name: text("allCountries"), slug: "all" })}
                                    searchTerm={searchTerm}
                                />
                            )}
                            {!hideCountryGuessrModes && ((searchTerm.length === 0) || text("countryGuesser")?.toLowerCase().includes(searchTerm?.toLowerCase())) && (
                                <MapTile
                                    bgImage={`url("${asset('/flags.jpg')}")`}
                                    map={{ name: text("countryGuesser"), slug: "__countryGuesser" }}
                                    onClick={() => onMapClick({ name: text("countryGuesser"), slug: "__countryGuesser" })}
                                    searchTerm={searchTerm}
                                />
                            )}
                            {!hideCountryGuessrModes && ((searchTerm.length === 0) || text("continentGuesser")?.toLowerCase().includes(searchTerm?.toLowerCase())) && (
                                <MapTile
                                    bgImage={`url("${asset('/continents.jpg')}")`}
                                    map={{ name: text("continentGuesser"), slug: "__continentGuesser" }}
                                    onClick={() => onMapClick({ name: text("continentGuesser"), slug: "__continentGuesser" })}
                                    searchTerm={searchTerm}
                                />
                            )}
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
                            .filter((k) => (!process.env.NEXT_PUBLIC_COOLMATH) || k !== "recent")
                            .map((section, si) => {
                                const mapsArray = section === "recent" && searchResults.length > 0
                                    ? searchResults
                                    : (Array.isArray(mapHome[section]) ? mapHome[section] : []).filter((map) => {
                                        const localizedName = (section === "countryMaps" && map.countryMap) ? nameFromCode(map.countryMap, lang) : map.name;
                                        return localizedName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            map.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            map.description_short?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            map.created_by_name?.toLowerCase().includes(searchTerm?.toLowerCase());
                                    });

                                if (mapsArray.length === 0) return null;

                                const isExpanded = expandedSections[section] || section === "recent";
                                const rows = getRowsForSection(section);
                                const mapsPerRow = getMapsPerRow(section);
                                
                                let defaultMaxMaps = rows * mapsPerRow;
                                if (mapsArray.length > mapsPerRow && mapsArray.length < defaultMaxMaps) {
                                    defaultMaxMaps = Math.floor(mapsArray.length / mapsPerRow) * mapsPerRow;
                                } else if (mapsArray.length <= mapsPerRow) {
                                    defaultMaxMaps = mapsArray.length;
                                }

                                const shouldShowExpandButton = mapsArray.length > defaultMaxMaps && section !== "recent";
                                const displayedMaps = isExpanded ? mapsArray : mapsArray.slice(0, defaultMaxMaps);

                                return (
                                    <div key={si} className={`map-section${section === "spotlight" ? " map-section--spotlight" : ""}${section === "popular" ? " map-section--popular" : ""}`}>
                                        <h2
                                            id={section + "_map_view_section"}
                                            className="map-section-title"
                                        >
                                            {text(section)}
                                            {["myMaps", "likedMaps", "reviewQueue"].includes(section) &&
                                             ` (${mapsArray.length})`}
                                        </h2>
                                        <div className="map-section-container">
                                            <div className={`map-grid${section === 'countryMaps' ? ' country-maps' : ''}`}>
                                                {displayedMaps.map((map, i) => {
                                                    const displayMap = (section === "countryMaps" && map.countryMap)
                                                        ? { ...map, name: nameFromCode(map.countryMap, lang) }
                                                        : map;
                                                    return (<MapTile
                                                        key={map.id || i}
                                                        map={displayMap}
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
                                                    );
                                                })}
                                            </div>

                                            {shouldShowExpandButton && (
                                                <button
                                                    className="show-more-btn"
                                                    onClick={() => toggleSection(section)}
                                                >
                                                    {isExpanded ? (
                                                        <>
                                                            <FaChevronUp />
                                                            {text("showLess")}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <FaChevronDown />
                                                            {text("showAll")}
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