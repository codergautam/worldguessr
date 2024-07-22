import { Modal } from "react-responsive-modal";
import { useTranslation } from 'next-i18next';

export default function SettingsModal({ shown, onClose, options, setOptions }) {
    const { t: text } = useTranslation("common");

    const handleUnitsChange = (event) => {
        setOptions((prevOptions) => ({ ...prevOptions, units: event.target.value }));
    };

    const handleMapTypeChange = (event) => {
        setOptions((prevOptions) => ({ ...prevOptions, mapType: event.target.value }));
    };

    if(!options) return null;

    return (
        <Modal id="" styles={{
            modal: {
                zIndex: 100,
                background: 'black',
                color: 'white',
                padding: '20px',
                borderRadius: '10px',
                fontFamily: "'Arial', sans-serif",
                maxWidth: '500px',
                textAlign: 'center'
            },
            closeButton: {
                backgroundColor: 'white'
            }
        }} open={shown} center onClose={onClose}>
            <span style={{
                marginBottom: '20px',
                fontSize: '24px',
                fontWeight: 'bold'
            }}>{text("settings")}</span>

            <div style={{ marginBottom: '10px' }}>
                <label htmlFor="units">{text("units")}: </label>
                <select id="units" value={options.units} onChange={handleUnitsChange}>
                    <option value="metric">{text("metric")}</option>
                    <option value="imperial">{text("imperial")}</option>
                </select>
            </div>

            <div>
                <label htmlFor="mapType">{text("mapType")}: </label>
                <select id="mapType" value={options.mapType} onChange={handleMapTypeChange}>
                    <option value="m">{text("normal")}</option>
                    <option value="s">{text("satellite")}</option>
                    <option value="p">{text("terrain")}</option>
                    <option value="y">{text("hybrid")}</option>
                </select>
            </div>
        </Modal>
    );
}