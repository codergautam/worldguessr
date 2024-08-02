import { useState } from "react";
import mapConst from "./mapConst";
import { toast } from "react-toastify";
import { FaCopy } from "react-icons/fa6";
import parseMapData from "../utils/parseMapData";

export default function MakeMapForm({ map, setMap, createMap }) {
  // map => { slug, name, created_at, created_by, plays, hearts, data, _id, created_by_name, description_short, description_long }
  const [formData, setFormData] = useState({
    name: map.name,
    description_short: map.description_short,
    description_long: map.description_long,
    data: map.data || []
  });
  const [uploaded, setUploaded] = useState(false);

  const handleFormChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleDataChange = (index, value) => {
    const updatedData = [...formData.data];
    updatedData[index] = value;
    setFormData({ ...formData, data: updatedData });
  };

  const handleAddUrl = () => {
    setFormData({ ...formData, data: [...formData.data, ""] });
  };

  const handleDeleteUrl = (index) => {
    const updatedData = formData.data.filter((_, i) => i !== index);
    setFormData({ ...formData, data: updatedData });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if(formData.data.length < mapConst.MIN_LOCATIONS) {
      toast.error(`Need at least ${mapConst.MIN_LOCATIONS} locations`);
      return;
    }
    if(formData.data.length > mapConst.MAX_LOCATIONS) {
      toast.error(`Too many locations`);
      return;
    }

    if(!formData.name || !formData.description_short || !formData.description_long) {
      toast.error("Missing fields");
      return;
    }

    setMap({ ...map, ...formData, progress: true });
    createMap(formData);
  };


  function handleFileUpload(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      try {
        let parsed = parseMapData(text);
        if (!parsed) {
          toast.error("Failed to parse file");
          return
        }
        parsed = parsed.map((loc) => JSON.stringify(loc));
        if(parsed.length > mapConst.MAX_LOCATIONS) {
          toast.error(`More than ${mapConst.MAX_LOCATIONS} locations in file`);
          return;
        }
        toast.success("Parsed " + parsed.length + " locations");
        setUploaded(true);
        setFormData({ ...formData, data: parsed });
      } catch (e) {
        toast.error("Invalid file format");
      }
    };
    reader.readAsText(file);
  }

  return (
    <>
      <div className="make-map-form" style={{ gap: 0 }}>
        <h2>Rules</h2>
        <li>Use a descriptive name</li>
        <li>Add at least 25 locations</li>
        <li>You can make 1 map an hour</li>
        <li>Keep all details in English (no NSFW)</li>
      </div>

      <form className="make-map-form" onSubmit={handleSubmit}>
      <h2>Basic Info</h2>

        <label>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            Name <span style={{ color: formData.name.length < mapConst.MIN_NAME_LENGTH ? 'red' : 'green', marginLeft: '8px' }}>({formData.name.length} / {mapConst.MAX_NAME_LENGTH})</span>
          </div>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleFormChange}
            maxLength={mapConst.MAX_NAME_LENGTH}
            minLength={mapConst.MIN_NAME_LENGTH}
            style={{ display: 'block', marginTop: '8px' }}
          />
        </label>

        <label>
          <div style={{ display: 'flex', alignItems: 'center' }}>
          Short Description <span style={{ color: formData.description_short.length < mapConst.MIN_SHORT_DESCRIPTION_LENGTH ? 'red' : 'green', marginLeft: '8px' }}>({formData.description_short.length} / {mapConst.MAX_SHORT_DESCRIPTION_LENGTH})</span>
          </div>
          <input
            type="text"
            name="description_short"
            value={formData.description_short}
            onChange={handleFormChange}
            maxLength={mapConst.MAX_SHORT_DESCRIPTION_LENGTH}
            minLength={mapConst.MIN_SHORT_DESCRIPTION_LENGTH}
          />
        </label>
        <label>
          <div style={{ display: 'flex', alignItems: 'center' }}>
          Long Description <span style={{ color: formData.description_long.length < mapConst.MIN_LONG_DESCRIPTION_LENGTH ? 'red' : 'green', marginLeft: '8px' }}>({formData.description_long.length} / {mapConst.MAX_LONG_DESCRIPTION_LENGTH})</span>
          </div>
          <textarea
            name="description_long"
            value={formData.description_long}
            onChange={handleFormChange}
          />
        </label>
        </form>

        <div className="make-map-form" style={{ gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>

          <h2 style={{marginBottom: '10px'}}>Locations</h2>

          <button type="button" style={{padding:'3px',marginLeft: '10px'}} onClick={() => {
            // Copy the entered locations to the clipboard
            if(formData.data.length === 0) {
              toast.error("No locations to copy");
              return;
            }
            navigator.clipboard.writeText(JSON.stringify(formData.data));
            toast.success("Copied entered locations to clipboard");
          }}>
          <FaCopy />
            </button>


          { formData.data.length < mapConst.MIN_LOCATIONS && <span style={{ color: 'red', marginLeft: '8px' }}>({mapConst.MIN_LOCATIONS - formData.data.length} more needed)</span> }
          { formData.data.length >= mapConst.MIN_LOCATIONS && <span style={{ color: 'green', marginLeft: '8px' }}>({formData.data.length} / {mapConst.MAX_LOCATIONS})</span> }
          </div>
          { !uploaded && (
            <>
          <h3>Either enter them Manually...</h3>


          <span style={{marginBottom: '5px'}}>

<li>Visit Google Maps on a desktop computer</li>
<li>Drag the orange figure onto the map to open a streetview</li>
<li>Copy the URL from the address bar of your browser into the textbox</li>
<li>You can add also add JSON strings with {`{lat, lng, heading, pitch, zoom}`}</li>

          </span>

          {formData.data.map((url, index) => (
            <div key={index} className="url-input-container">
              <input
                type="text"
                name={`url-${index}`}
                value={url}
                onChange={(e) => handleDataChange(index, e.target.value)}
                className="url-input"
              />
              <button
                type="button"
                className="delete-button"
                onClick={() => handleDeleteUrl(index)}
              >
                &#10006; {/* X symbol */}
              </button>
              {/* Placeholder for validation icon */}
              <span className="validation-icon">
                {/* You can insert your validation logic here */}
              </span>
            </div>
          ))}
          <button type="button" className="add-button" onClick={handleAddUrl}>
            + Add URL
          </button>
          <br/>
          </>
          )}
          <h3>
            { uploaded ? "Bulk Uploaded":"...or Bulk Upload a file" }
            </h3>
            { !uploaded && (
          <span>Supports JSON format from <a style={{color: "cyan"}} href="https://map-generator.vercel.app/" target="_blank" rel="noreferrer">map-generator.vercel.app</a></span>
            )}
          { !uploaded && (
            <label htmlFor="file-upload" className="add-button button"  style={{cursor: 'pointer', padding: '8px 16px'}}>
              <input type="file" accept=".json" onChange={handleFileUpload} style={{overflow: 'hidden', width: 0, height: 0, opacity: 0}} id="file-upload" />
              Upload File
            </label>
          )}
          {
            uploaded && (
              <button type="button" className="add-button" onClick={() => {
                setFormData({ ...formData, data: [] });
              setUploaded(false)
              }}>
                Clear Upload
              </button>
            )
          }
        </div>
        <div className="make-map-form" style={{ gap: 0 }}>
        <button type="submit"
        onClick={handleSubmit}
        disabled={map.progress}
        >
          {map.progress ? "Loading..." : "Publish"}
        </button>
      </div>
    </>
  );
}
