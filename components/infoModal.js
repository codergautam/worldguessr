import { useState } from "react";
import { Modal } from "react-responsive-modal";
import { useTranslation } from '@/components/useTranslations';

export default function InfoModal({ shown, onClose }) {
    const { t: text } = useTranslation("common");

    // State to handle screen navigation
    const [currentScreen, setCurrentScreen] = useState(1);

    const handleNextClick = () => {
        setCurrentScreen(2);
    };

    const handleLetsGoClick = () => {
        onClose();
    };

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
                {currentScreen === 1 ? (
                    <>
                        <h1
                            style={{
                                fontSize: '24px',
                                fontWeight: 'bold',
                                color: 'lime',
                                marginBottom: '10px'
                            }}
                        >
                            {text("welcomeToWorldGuessr")}!
                        </h1>

                        <p
                            style={{
                                fontSize: '16px',
                                marginBottom: '5px',
                            }}
                        >
                            🧐 {text("info1")}
                        </p>

                        <p
                            style={{
                                fontSize: '16px',
                                marginBottom: '5px',
                            }}
                        >
                            🗺️ {text("info2")}
                        </p>

                        <img
                            src="/tutorial1.png"
                            alt="Tutorial 1"
                            style={{
                                maxWidth: '100%',
                                borderRadius: '10px',
                            }}
                        />

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
                                onClick={handleNextClick}
                            >
                                {text("next")}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h1
                            style={{
                                fontSize: '24px',
                                fontWeight: 'bold',
                                color: 'lime',
                                marginBottom: '10px'

                            }}
                        >
                            {text("welcomeToWorldGuessr")}!
                        </h1>

                        <p
                            style={{
                                fontSize: '16px',
                                marginBottom: '5px',
                            }}
                        >
                            🎓 {text("info3")}
                        </p>

                        <p
                            style={{
                                fontSize: '16px',
                                marginBottom: '5px',
                            }}
                        >
                            🌍 {text("info4")}
                        </p>

                        <img
                            src="/tutorial2.png"
                            alt="Tutorial 2"
                            style={{
                                maxWidth: '100%',
                                borderRadius: '10px',
                            }}
                        />

                        <div
                            style={{
                                marginTop: '20px', // Adds spacing between the content and button
                            }}
                        >
                            <button
                                className="letsGoButton"
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
                                onClick={handleLetsGoClick}
                            >
                                {text("letsGo")}
                            </button>
                        </div>
                    </>
                )}
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
