import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import MakeMapForm from "./makeMap";
import MapTile from "./mapTile";
import { ScrollMenu } from "react-horizontal-scrolling-menu";
import "react-horizontal-scrolling-menu/dist/styles.css";

const initMakeMap = {
  open: false,
  progress: false,
  name: "",
  description_short: "",
  description_long: "",
  data: "",
  edit: false,
  mapId: "",
};

export default function MapView({ gameOptions, setGameOptions, singleplayer, close, session, text, onMapClick, chosenMap, showAllCountriesOption }) {
  const [makeMap, setMakeMap] = useState(initMakeMap);
  const [mapHome, setMapHome] = useState({
    message: text("loading") + "...",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [heartingMap, setHeartingMap] = useState("");

  function refreshHome() {
    fetch("/api/map/mapHome", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        session?.token?.secret ? { secret: session?.token?.secret } : {}
      ),
    })
      .then((res) => res.json())
      .then((data) => {
        setMapHome(data);
      })
      .catch(() => {
        setMapHome({ message: "Failed to fetch" });
      });
    }
  useEffect(() => {
    refreshHome();
  }, [session?.token?.secret, text]);

  const debounce = (func, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => func(...args), delay);
    };
  };

  const handleSearch = useCallback(
    debounce((term) => {
      if (term.length > 3) {
        fetch("/api/map/searchMap", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: term, secret: session?.token?.secret }),
        })
          .then((res) => res.json())
          .then((data) => {
            setSearchResults(data);
          })
          .catch(() => {
            toast.error("Failed to search maps");
          });
      } else {
        setSearchResults([]);
      }
    }, 300),
    []
  );

  useEffect(() => {
    handleSearch(searchTerm);
  }, [searchTerm, handleSearch]);

  function createMap(map) {
    if (!session?.token?.secret) {
      toast.error("Not logged in");
      return;
    }

    fetch("/api/map/action", {
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
          toast.error("Unexpected Error - 1");
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

    fetch("/api/map/heartMap", {
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
          // update state
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

              if(section === "likedMaps") {
                if(json.hearted) {
                  newMapHome[section].push(map);
                } else {
                  newMapHome[section] = newMapHome[section].filter((m) => m.id !== map.id);
                }
              }
            });
            return newMapHome;
          });

          if(searchResults.length > 0) {
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

  const hasResults =
    Object.keys(mapHome)
      .filter((k) => k !== "message")
      .some((section) => {
        const mapsArray =
          section === "recent" && searchResults.length > 0
            ? searchResults
            : mapHome[section].filter(
                (map) =>
                  map.name?.toLowerCase().includes(searchTerm?.toLowerCase()) ||
                  map.description_short?.toLowerCase()
                    .includes(searchTerm?.toLowerCase()) ||
                  map.created_by_name?.toLowerCase()
                    .includes(searchTerm?.toLowerCase())
              );
        return mapsArray.length > 0;
      });

  return (
    <div className="mapView">
      <div className="mapViewNavbar">
        <div className="mapViewLeft">
          <button
            onClick={() =>
              makeMap.open
                ? setMakeMap({ ...makeMap, open: false })
                : close()
            }
            className="mapViewClose"
          >
            {makeMap.open ? text("back") : text("close")}
          </button>
        </div>

        <h1 className="mapViewTitle">
          {makeMap.open ? makeMap?.edit ? "Edit Map": "Make Map" : text("maps")}
        </h1>

        <div className="mapViewRight">
          {!makeMap.open && session?.token?.secret && (
            <button
              onClick={() => {
                if(makeMap.edit) {
                  setMakeMap({
                    ...initMakeMap,
                    open: true,
                  });
                } else setMakeMap({ ...makeMap, open: true })
              }}
              className="mapViewMake"
            >
              Make Map
            </button>
          )}
        </div>
      </div>

      {singleplayer && (
    <div style={{display: "flex", flexDirection: 'column', alignItems: 'center', marginBottom: '5px', marginTop: '5px'}}>
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

    { !makeMap.open && (
      <div className="mapSearch">
        <input
          type="text"
          placeholder={text("searchForMaps")}
          className="mapSearchInput"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
    )}

      {!makeMap.open && (
        <div>
          {mapHome?.message && (
            <span className="bigSpan">{mapHome?.message}</span>
          )}

          <center>
          {showAllCountriesOption && ((searchTerm.length === 0) || (text("allCountries")?.toLowerCase().includes(searchTerm?.toLowerCase()))) && (
            <MapTile map={{ name: text("allCountries"), slug: "all" }} onClick={()=>onMapClick({ name: text("allCountries"), slug: "all" })} searchTerm={searchTerm} />
          )}
          </center>

          {hasResults ? (
            Object.keys(mapHome)
              .filter((k) => k !== "message")
              .map((section, si) => {
                const mapsArray =
                  section === "recent" && searchResults.length > 0
                    ? searchResults
                    : mapHome[section].filter((map) =>
                        map.name?.toLowerCase()
                          .includes(searchTerm.toLowerCase()) ||
                        map.description_short?.toLowerCase()
                          .includes(searchTerm.toLowerCase()) ||
                        map.created_by_name?.toLowerCase()
                          .includes(searchTerm?.toLowerCase())
                      );

                return mapsArray.length > 0 ? (
                  <div className={`mapSection ${section==="recent"?"recent":""}`} key={si}>
                    <h2 className="mapSectionTitle">{text(section)}</h2>

                    <div className={`mapSectionMaps`}>
                      <ScrollMenu drag>
                        {section === "countryMaps" ? (
                          mapsArray.map((map, i) => {
                            if (i % 3 === 0) {
                              return (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                  }}
                                  key={i}
                                >
                                  {mapsArray
                                    .slice(i, i + 3)
                                    .map((tileMap, index) => (
                                      <MapTile
                                        key={i + index}
                                        map={tileMap}
                                        onClick={() => onMapClick(tileMap)}
                                        country={tileMap.countryMap}
                                        searchTerm={searchTerm}
                                      />
                                    ))}
                                </div>
                              );
                            } else return null;
                          })
                        ) : (
                          mapsArray.map((map, i) => (
                            <MapTile
                              key={i}
                              map={map}
                              canHeart={session?.token?.secret && heartingMap !== map.id}
                              onClick={() => onMapClick(map)}
                              country={map.countryMap}
                              searchTerm={searchTerm}
                              secret={session?.token?.secret}
                              refreshHome={refreshHome}
                              showEditControls={(map.yours && section==="myMaps") || session?.token?.staff}
                              showReviewOptions={session?.token?.staff && section === "reviewQueue"}

                              onPencilClick={(map) => {
                                // go back to editscreen
                                console.log("edit", map);
                                setMakeMap({
                                  ...initMakeMap,
                                  open: true,
                                  edit: true,
                                  mapId: map.id,
                                  name: map.name,
                                  description_short: map.description_short,
                                  description_long: map.description_long,
                                  data: map.data.map((loc) => {
                                    return JSON.stringify(loc);
                                  }),
                                });

                              }}
                              onHeart={() => {
                                heartMap(map);
                              }}
                            />
                          ))
                        )}
                      </ScrollMenu>
                    </div>
                  </div>
                ) : null;
              })
          ) : (
            // make sure not loading
            !mapHome?.message && (
              <div className="noResults">{text("noResultsFound")}</div>
            )
          )}
        </div>
      )}

      {makeMap.open && (
        <MakeMapForm map={makeMap} setMap={setMakeMap} createMap={createMap} />
      )}
    </div>
  );
}
