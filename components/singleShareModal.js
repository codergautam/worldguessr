import { useState } from "react";
import { Modal } from "react-responsive-modal";
import { useTranslation } from '@/components/useTranslations';
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { FaCopy } from "react-icons/fa6";

export default function SingleShareModal({ shown, onClose, pathUrl }) {
    const { t: text } = useTranslation("common");
    const router = useRouter();
    let basePath = '';

    if (typeof window !== 'undefined') {
        basePath = window.location
     }

    const [linkText, setLinkText] = useState('');
    const [error, setError] = useState('');
    const [generated, setGenerated] = useState('');

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generated);
        toast.success(text("copiedToClipboard"));
    }

    const generateFromStreeviewLink = async () => {
        if(linkText.search('@(-?[0-9]?[0-9]\.[0-9]*),(-?[0-9]?[0-9]\.[0-9]*)') < 0) {
            setError('Link is not a streetview link or does not contain coordinates, please try again');
        }
        const coords = linkText.match('@(-?[0-9]?[0-9]\.[0-9]*),(-?[0-9]?[0-9]\.[0-9]*)')?.[0];
        const coordsForLink = coords.split('').map((coordChar, i) => i ? coords.charCodeAt(i) : '').join('');
        const generatedLink = `${basePath}?single=${coordsForLink}`;
        setGenerated(generatedLink);
        copyToClipboard();
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
                        
                        <div className="linkGenerator">
                            <input
                                type="text"
                                className="mapsLinkInput"
                                name="google_maps_link"
                                value={linkText}
                                onChange={(e) => setLinkText(e.target.value)}
                            />
                            {generated?.length ? 
                                <p className="generatedLink">{generated} <button onClick={copyToClipboard} style={{
                                      marginLeft: "10px",
                                      padding: "5px",
                                      backgroundColor: "orange",
                                      color: "white",
                                      border: "none",
                                      cursor: "pointer",
                                      pointerEvents: "all",
                                      borderRadius: "5px"
                                    }}>
                                      {/* copy icon */}
                            
                                      <FaCopy />
                                    </button></p> 
                                    : <></>}
                            
                        </div>
                        

                        <p>{error ? error : ''}</p>

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
                .nextButton:hover {
                    background-color: #45a049;
                    transform: scale(1.05);
                }
                .generateLink {
                    background-color: #45a049;
                    transform: scale(1.05);
                }
                .mapsLinkInput {
                    width: 100%;
                }
            `}</style>
        </Modal>
    );
}
