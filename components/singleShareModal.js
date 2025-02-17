import { useState } from "react";
import { Modal } from "react-responsive-modal";
import { useTranslation } from '@/components/useTranslations';
import { useRouter } from "next/router";

export default function SingleShareModal({ shown, onClose, pathUrl }) {
    const { t: text } = useTranslation("common");
    const router = useRouter();
    let basePath = '';

    if (typeof window !== 'undefined') {
        basePath = window.location
     }

   

    // State to handle screen navigation
    const [linkText, setLinkText] = useState('');
    const [error, setError] = useState('');
    const [generated, setGenerated] = useState('');

    const generateFromStreeviewLink = async () => {
        if(linkText.search('@(-?[0-9]?[0-9]\.[0-9]*),(-?[0-9]?[0-9]\.[0-9]*)') < 0) {
            setError('Link is not a streetview link or does not contain coordinates, please try again');
        }
        const coords = linkText.match('@(-?[0-9]?[0-9]\.[0-9]*),(-?[0-9]?[0-9]\.[0-9]*)');
        const coordsForLink = `${coords[0]},${coords[1]}`
        setGenerated(`${basePath}?single=${coordsForLink}`)
    }

    return (
        <Modal
            open={shown}
            onClose={onClose}
            center
            styles={{
                modal: {
                    backgroundColor: '#2d2d2d',
                    padding: '20px',
                    borderRadius: '10px',
                    color: 'white',
                    maxWidth: '600px',
                },
                closeButton: {
                    scale: 0.5,
                    backgroundColor: 'red',
                    borderRadius: '50%',
                    padding: '5px 10px',
                },
            }}
        >
            <center>
                
                    <>
                        <h1
                            style={{
                                fontSize: '24px',
                                fontWeight: 'bold',
                                color: 'lime',
                                marginBottom: '10px'
                            }}
                        >
                            {text("shareSingleLinkTitle")}!
                        </h1>

                        <p
                            style={{
                                fontSize: '16px',
                                marginBottom: '5px',
                            }}
                        >
                            🗺️ {text("shareSingleLinkText")}
                        </p>
                        <input
                            type="text"
                            name="google_maps_link"
                            value={linkText}
                            onChange={(e) => setLinkText(e.target.value)}
                        />

                        <p>{error ? error : generated}</p>

                        <div
                            style={{
                                marginTop: '20px', // Adds spacing between the content and button
                            }}
                        >
                            <button
                                className="nextButton"
                                style={{
                                    fontSize: '16px',
                                    fontWeight: 'bold',
                                    color: 'white',
                                    background: '#4CAF50',
                                    border: 'none',
                                    borderRadius: '5px',
                                    padding: '10px 20px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    display: 'block', // Forces the button to be on a new line
                                    width: '100%', // Ensures the button takes the full width
                                }}
                                onClick={generateFromStreeviewLink}
                            >
                                {text("generateLink")}
                            </button>
                        </div>
                    </>
            </center>

            <style jsx>{`
                .nextButton:hover, .letsGoButton:hover {
                    background-color: #45a049;
                    transform: scale(1.05);
                }
            `}</style>
        </Modal>
    );
}
