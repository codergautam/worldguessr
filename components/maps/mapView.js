  import React, { useState, useEffect, useCallback } from "react";
  import { toast } from "react-toastify";
  import MakeMapForm from "./makeMap";
  import MapTile from "./mapTile";
  import { ScrollMenu } from "react-horizontal-scrolling-menu";
  import "react-horizontal-scrolling-menu/dist/styles.css";
  import config from "@/clientConfig";
import { backupMapHome } from "../utils/backupMapHome.js";



  export default function MapView({ gameOptions, mapModalClosing, setGameOptions, showOptions, close, session, text, onMapClick, chosenMap, showAllCountriesOption, makeMap, setMakeMap, initMakeMap, searchTerm, setSearchTerm, searchResults, setSearchResults }) {

      const [mapHome, setMapHome] = useState({
          message: text("loading") + "...",
      });
      const [heartingMap, setHeartingMap] = useState("");

      function refreshHome(removeMapId) {

          console.log("refreshing home", removeMapId);
          // if removeMapId is set, remove it from the mapHome temporarily
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

          window.cConfig = config();

          let backupMapHomeTimeout = setTimeout(() => {
                setMapHome( backupMapHome ); // revert to backup if fetch takes too long
          }, 5000);

          fetch(window.cConfig.apiUrl + "/api/map/mapHome", {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
              },
              body: JSON.stringify(
                  session?.token?.secret ? {
                      secret: session?.token?.secret,
                      inCG: window.inCrazyGames
                  } : {}
              ),
          })
              .then((res) => res.json())
              .then((data) => {
                  setMapHome(data);
                    clearTimeout(backupMapHomeTimeout); // clear the timeout if fetch is successful
              })
              .catch(() => {
                  setMapHome(backupMapHome);
              });
      }
      useEffect(() => {
          refreshHome();
      }, [session?.token?.secret]);



      function createMap(map) {
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
          <div className={`mapView ${mapModalClosing ? "slideout_right" : ""}`}>
              {makeMap.open && (<div className="mapViewNavbar g2_container">
                  <div className="mapViewLeft">
                      <button
                          onClick={() =>
                              makeMap.open
                                  ? setMakeMap({ ...makeMap, open: false })
                                  : close()
                          }
                          className="mapViewClose g2_red_button"
                      >
                          {makeMap.open ? text("back") : text("close")}
                      </button>
                  </div>

                  <h1 className="mapViewTitle">
                      {makeMap.open ? makeMap?.edit ? "Edit Map" : "Make Map" : text("maps")}
                  </h1>

                  <div className="mapViewRight">
                      {!makeMap.open && session?.token?.secret && (
                          <button
                              onClick={() => {

                                  // disable for crazygames users
                                  // if(inCrazyGames) {
                                  //   toast.error("Please play on WorldGuessr.com to use this feature");
                                  //   return;
                                  // }
                                  // temporarily disabled
                                  // toast.error("Feature disabled temporarily due to maintenance");
                                  // return;

                                  if (makeMap.edit) {
                                      setMakeMap({
                                          ...initMakeMap,
                                          open: true,
                                      });
                                  } else setMakeMap({ ...makeMap, open: true })
                              }}
                              className="mapViewMake g2_green_button"
                          >
                              Make Map
                          </button>
                      )}
                  </div>
              </div>)}

              {!makeMap.open && <div style={{ width: "100%", display: "flex", justifyContent: "flex-end" }}>
                  <button
                      onClick={() => {
                          if (makeMap.edit) {
                              setMakeMap({
                                  ...initMakeMap,
                                  open: true,
                              });
                          } else setMakeMap({ ...makeMap, open: true })
                      }}
                      className="g2_green_button3 g2_button_style"
                      style={{ width: "minContent", fontSize: "1.1em", paddingRight: "40px", paddingLeft: "40px" }}>Make Map</button>
                  <div style={{ width: "0%" }}></div>
              </div>}


              {showOptions && (
                  <div style={{ display: "flex", flexDirection: 'column', alignItems: 'center', marginBottom: '5px', marginTop: '5px' }}>
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



              {!makeMap.open && (
                  <div>
                      {mapHome?.message && (
                          <span className="bigSpan">{mapHome?.message}</span>
                      )}

                      <center>
                          {showAllCountriesOption && ((searchTerm.length === 0) || (text("allCountries")?.toLowerCase().includes(searchTerm?.toLowerCase()))) && (
                              <MapTile map={{ name: text("allCountries"), slug: "all" }} onClick={() => onMapClick({ name: text("allCountries"), slug: "all" })} searchTerm={searchTerm} />
                          )}
                      </center>

                      {hasResults ? (
                          Object.keys(mapHome)
                              .filter((k) => k !== "message")
                              .filter((k) => !process.env.NEXT_PUBLIC_COOLMATH || k !== "recent") //coolmath doesnt want unmoderated maps
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
                                      <>
                                          <h2 id={section + "_map_view_section"} className="mapSectionTitle">{text(section)}{["myMaps", "likedMaps", "reviewQueue"].includes(section) && ` (${mapsArray.length})`}</h2>
                                          <div className={`mapSection section-${section} g2_container`} key={si}>


                                              <div className={`mapSectionMaps`}>
                                                  <ScrollMenu drag scrollContainerClassName={(section == "recent") ? "mapSectionWrap" : ""}>
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
                                                                          {mapsArray.slice(i, i + 3).map((tileMap, index) => (
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
                                                          mapsArray.map((map, i) => {
                                                              if (i % (section === "popular" ? 3 : 1) === 0) {
                                                                  return (
                                                                      <div
                                                                          style={{
                                                                              display: "flex",
                                                                              flexDirection: "column",
                                                                          }}
                                                                          key={i}
                                                                      >
                                                                          {mapsArray.slice(i, i + (section === "popular" ? 3 : 1)).map((tileMap, index) => (
                                                                              <MapTile
                                                                                  key={i + index}
                                                                                  map={tileMap}
                                                                                  canHeart={session?.token?.secret && heartingMap !== mapsArray[i + index].id}
                                                                                  onClick={() => onMapClick(tileMap)}
                                                                                  country={tileMap.countryMap}
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
                                                                                          data: map.data.map((loc) => {
                                                                                              return JSON.stringify(loc);
                                                                                          }),
                                                                                      });
                                                                                  }}
                                                                                  onHeart={() => {
                                                                                      heartMap(mapsArray[i + index]);
                                                                                  }}
                                                                              />
                                                                          ))}
                                                                      </div>
                                                                  );
                                                              } else return null;
                                                          })
                                                      )}
                                                  </ScrollMenu>
                                              </div>

                                          </div>
                                      </>
                                  ) : null;
                              })
                      ) : (
                          // make sure not loading
                          (!mapHome?.message ||

                              (process.env.NEXT_PUBLIC_COOLMATH &&
                                  searchTerm.length > 0 &&
                                  (!hasResults || hasResults.filter((k) => k !== "recent").length === 0))
                          ) &&
                          (
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