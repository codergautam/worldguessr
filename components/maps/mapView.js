import { toast } from "react-toastify";
import MakeMapForm from "./makeMap";
import MapTile from "./mapTile";
import { useState } from "react";

const initMakeMap = {
  open: false,
  progress: false,
  name: "",
  description_short: "",
  description_long: "",
  data: ""
};

export default function MapView({ close,session }) {

  const [makeMap, setMakeMap] = useState(initMakeMap);

  function createMap(map) {
    if(!session?.token?.secret) {
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
      }).catch((e) => {
        console.error(e);
        setMakeMap({ ...makeMap, progress: false });
        toast.error("Unexpected Error creating map - 2");
      })
  }

 return (
  <div className="mapView">
    <div className="mapViewNavbar">

    <div class="mapViewLeft">
    <button onClick={() => makeMap.open ? setMakeMap({ ...makeMap, open: false }) : close()} className="mapViewClose">
      {makeMap.open ? "Back" : "Close"}
    </button>
    </div>



    <h1 className="mapViewTitle">
      {makeMap.open ? "Make Map" : "Community Maps"}
      </h1>

    <div class="mapViewRight">
      {!makeMap.open && session?.token?.secret && (
    <button onClick={() => setMakeMap({ ...makeMap, open: true })} className="mapViewMake">
      Make Map
    </button>
      )}
    </div>
    </div>

      {!makeMap.open && (
        <div>

    <div className="mapSection">
      <h2 className="mapSectionTitle">Trending</h2>
      <div className="mapSectionMaps">
        <MapTile map={
          {
            slug: "slug",
            name: "name",
            created_at: "created_at",
            created_by: "created_by",
            plays: 0,
            hearts: 0,
            data: {},
            _id: "id",
            created_by_name: "created_by_name",
            description_short: "description_short",
            description_long: "description_long"
          }
        }/>
      </div>
    </div>

    <div className="mapSection">
      <h2 className="mapSectionTitle">Trending</h2>
      <div className="mapSectionMaps">
        <MapTile map={
          {
            slug: "slug",
            name: "name",
            created_at: "created_at",
            created_by: "created_by",
            plays: 0,
            hearts: 0,
            data: {},
            _id: "id",
            created_by_name: "created_by_name",
            description_short: "description_short",
            description_long: "description_long"
          }
        }/>
      </div>
    </div>
    </div>
      )}

      {makeMap.open && (
        <MakeMapForm map={makeMap} setMap={setMakeMap} createMap={createMap} />
      )}

</div>
 )
}