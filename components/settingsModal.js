import { Modal } from "react-responsive-modal";
import { useTranslation } from '@/components/useTranslations';

export default function SettingsModal({ shown, onClose, options, setOptions, inCrazyGames }) {
    const { t: text } = useTranslation("common");

    const handleUnitsChange = (event) => {
        setOptions((prevOptions) => ({ ...prevOptions, units: event.target.value }));
    };

    const handleMapTypeChange = (event) => {
        setOptions((prevOptions) => ({ ...prevOptions, mapType: event.target.value }));
    };

    const handleLanguageChange = (event) => {
        setOptions((prevOptions) => ({ ...prevOptions, language: event.target.value }));
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
            { !inCrazyGames && (
                        <>
            <div>
                <label htmlFor="mapType">{text("language")}: </label>
                <select id="mapType" value={options.language} onChange={handleLanguageChange}>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="ru">Русский</option>
                </select>
            </div>

            {/* disableVideoAds checkbox */}
            <div style={{ marginTop: '20px' }}>
                <input type="checkbox" id="disableVideoAds" checked={options.disableVideoAds} onChange={() => setOptions((prevOptions) => ({ ...prevOptions, disableVideoAds: !prevOptions.disableVideoAds }))} />
                <label htmlFor="disableVideoAds" style={{ marginLeft: '10px' }}>{text("disableVideoAds")}</label>
            </div>
            </>
            )}

            {inCrazyGames && (
                <a href="/privacy-crazygames" target="_blank" rel="noreferrer" style={{ marginTop: '20px', display: 'block', color: "white" }}>Privacy Policy</a>
            )}


        </Modal>
    );
}