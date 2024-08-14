import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import MakeMapForm from "./makeMap";
import MapTile from "./mapTile";
import { ScrollMenu, VisibilityContext } from "react-horizontal-scrolling-menu";
import "react-horizontal-scrolling-menu/dist/styles.css";

// Initial state for creating a map
const initMakeMap = {
  open: false,
  progress: false,
  name: "",
  description_short: "",
  description_long: "",
  data: "",
};

export default function MapView({ close, session, text, onMapClick }) {
  const [makeMap, setMakeMap] = useState(initMakeMap);
  const [mapHome, setMapHome] = useState({
    message: text("loading") + "...",
  });

  useEffect(() => {
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
  }, []);

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
        action: "create",
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
          toast.error("Unexpected Error creating map - 1");
          setMakeMap({ ...makeMap, progress: false });
          return;
        }
        console.log(json);
        if (res.ok) {
          toast.success("Map created");
          setMakeMap(initMakeMap);
        } else {
          setMakeMap({ ...makeMap, progress: false });
          toast.error(json.message);
        }
      })
      .catch((e) => {
        console.error(e);
        setMakeMap({ ...makeMap, progress: false });
        toast.error("Unexpected Error creating map - 2");
      });
  }

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
            {makeMap.open ? "Back" : "Close"}
          </button>
        </div>

        <h1 className="mapViewTitle">
          {makeMap.open ? "Make Map" : "Community Maps"}
        </h1>

        <div className="mapViewRight">
          {!makeMap.open && session?.token?.secret && (
            <button
              onClick={() => setMakeMap({ ...makeMap, open: true })}
              className="mapViewMake"
            >
              Make Map
            </button>
          )}
        </div>
      </div>

      {!makeMap.open && (
        <div>
          {mapHome?.message && (
            <span className="bigSpan">{mapHome?.message}</span>
          )}

          {Object.keys(mapHome)
            .filter((k) => k !== "message")
            .map((section, si) => {
              const mapsArray = mapHome[section];

              return (
                <div className="mapSection" key={si}>
                  <h2 className="mapSectionTitle">{text(section)}</h2>

                  <div className="mapSectionMaps">
                    <ScrollMenu
                      // LeftArrow={LeftArrow}
                      // RightArrow={RightArrow}
                      drag
                    >
                      {mapsArray.map((map, i) => (
                        <MapTile
                          key={i}
                          map={map}
                          onClick={() => onMapClick(map)}
                        />
                      ))}

                    </ScrollMenu>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {makeMap.open && (
        <MakeMapForm map={makeMap} setMap={setMakeMap} createMap={createMap} />
      )}
    </div>
  );
}

// Arrow components
// const LeftArrow = () => {
//   const { isFirstItemVisible, scrollPrev } = React.useContext(VisibilityContext);

//   return (
//     <button
//       disabled={isFirstItemVisible}
//       onClick={() => scrollPrev()}
//       className="arrow"
//     >
//       {"<"}
//     </button>
//   );
// };

// const RightArrow = () => {
//   const { isLastItemVisible, scrollNext } = React.useContext(VisibilityContext);

//   return (
//     <button
//       disabled={isLastItemVisible}
//       onClick={() => scrollNext()}
//       className="arrow"
//     >
//       {">"}
//     </button>
//   );
// };
