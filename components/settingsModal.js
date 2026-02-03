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

    if (!options) return null;

    return (
        <Modal id="" styles={{
            modal: {
                zIndex: 100,
                color: 'white',
                padding: '0px',
                borderRadius: '10px',
                top: "0px",
                margin: "0",
                left: "0px",
                maxWidth: '500px',
                textAlign: 'center',
                position: "absolute",
                background: `linear-gradient(0deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 30, 15, 0.5) 100%), url("/street2.webp")`,
                objectFit: "cover",
                backgroundSize: "cover",
                backgroundPosition: "center",
            },
            closeButton: {
                backgroundColor: 'white'
            }
        }} classNames={
            {
                modal: 'g2_modal'
            }
        }
            open={shown} center onClose={onClose} showCloseIcon={false} animationDuration={0}>

            <div className="g2_nav_ui">
                <h1 className="g2_nav_title">{text("settings")}</h1>
                <div className="g2_nav_hr"></div>

                <button className="g2_nav_text singleplayer red" onClick={onClose}>{text("back")}</button>
            </div>
            <div className="g2_content settingsModal">
                <div style={{ height: "50px" }}></div>


                <div className="settingsModalInner">
                    <label htmlFor="units">{text("units")}: </label>
                    <select className="g2_input" id="units" value={options.units} onChange={handleUnitsChange}>
                        <option value="metric">{text("metric")}</option>
                        <option value="imperial">{text("imperial")}</option>
                    </select>
                </div>

                <div className="settingsModalInner">
                    <label htmlFor="mapType">{text("mapType")}: </label>
                    <select className="g2_input" id="mapType" value={options.mapType} onChange={handleMapTypeChange}>
                        <option value="m">{text("normal")}</option>
                        <option value="s">{text("satellite")}</option>
                        <option value="p">{text("terrain")}</option>
                        <option value="y">{text("hybrid")}</option>
                    </select>
                </div>

                {!inCrazyGames && (<>
                    <div className="settingsModalInner">
                        <label htmlFor="mapType">{text("language")}: </label>
                        <select className="g2_input" id="mapType" value={options.language} onChange={handleLanguageChange}>
                            <option value="en">English</option>
                            <option value="es">Español</option>
                            <option value="fr">Français</option>
                            <option value="de">Deutsch</option>
                            <option value="ru">Русский</option>
                        </select>
                    </div>
                    <div className="settingsModalInner">
                        <label htmlFor="ramUsage">Show RAM Usage</label>
                        <input className="g2_input" type="checkbox" id="ramUsage" checked={options.ramUsage} onChange={() => setOptions((prevOptions) => ({ ...prevOptions, ramUsage: !prevOptions.ramUsage }))} />
                    </div>
                </>
                )}


                {inCrazyGames && (
                    <a href="/privacy-crazygames" target="_blank" rel="noreferrer" style={{ marginTop: '20px', display: 'block', color: "white" }}>Privacy Policy</a>
                )}

                <div style={{height: "40vh"} }></div>

            </div>
        </Modal>
    );
}