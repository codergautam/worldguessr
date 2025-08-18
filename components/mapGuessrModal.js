import React from 'react';
import { Modal } from "react-responsive-modal";

export default function MapGuessrModal({ isOpen, onClose }) {
    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            center
            showCloseIcon={false}
            classNames={{
                modal: "mapguessr-modal",
                modalContainer: "mapguessr-modal-container"
            }}
            styles={{
                modal: {
                    padding: 0,
                    margin: 0,
                    maxWidth: '100vw',
                    maxHeight: '100vh',
                    width: '100vw',
                    height: '100vh',
                    background: '#000',
                    borderRadius: 0,
                    overflow: 'hidden'
                },
                modalContainer: {
                    padding: 0
                }
            }}
            animationDuration={300}
        >
            <div className="mapguessr-container">
                {/* Header with close button */}
                <div className="mapguessr-header">
                    <h1 className="mapguessr-title">MapGuessr</h1>
                    <button
                        className="mapguessr-close-btn"
                        onClick={onClose}
                        aria-label="Close MapGuessr"
                    >
                        ✕
                    </button>
                </div>

                {/* Embedded iframe */}
                <div className="mapguessr-iframe-container">
                    <iframe
                        src="https://mapguessr.worldguessr.com"
                        className="mapguessr-iframe"
                        title="MapGuessr"
                        frameBorder="0"
                        allowFullScreen
                        allow="geolocation; microphone; camera"
                    />
                </div>
            </div>

            <style jsx>{`
                .mapguessr-container {
                    width: 100vw;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    background: #000;
                    position: relative;
                }

                .mapguessr-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px 20px;
                    background: rgba(0, 0, 0, 0.9);
                    backdrop-filter: blur(10px);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    position: relative;
                    z-index: 1000;
                    min-height: 60px;
                }

                .mapguessr-title {
                    color: #fff;
                    margin: 0;
                    font-size: 24px;
                    font-weight: bold;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                }

                .mapguessr-close-btn {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: #fff;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 18px;
                    transition: all 0.3s ease;
                    backdrop-filter: blur(10px);
                }

                .mapguessr-close-btn:hover {
                    background: rgba(255, 255, 255, 0.2);
                    border-color: rgba(255, 255, 255, 0.4);
                    transform: scale(1.05);
                }

                .mapguessr-iframe-container {
                    flex: 1;
                    width: 100%;
                    height: calc(100vh - 60px);
                    position: relative;
                    overflow: hidden;
                }

                .mapguessr-iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                    display: block;
                }

                /* Mobile optimizations */
                @media (max-width: 768px) {
                    .mapguessr-header {
                        padding: 10px 15px;
                        min-height: 50px;
                    }

                    .mapguessr-title {
                        font-size: 20px;
                    }

                    .mapguessr-close-btn {
                        width: 35px;
                        height: 35px;
                        font-size: 16px;
                    }

                    .mapguessr-iframe-container {
                        height: calc(100vh - 50px);
                    }
                }

                /* Ensure no scrollbars */
                .mapguessr-container,
                .mapguessr-iframe-container {
                    overflow: hidden;
                }

                /* Global modal styles */
                :global(.mapguessr-modal) {
                    overflow: hidden !important;
                }

                :global(.mapguessr-modal-container) {
                    overflow: hidden !important;
                    padding: 0 !important;
                }

                /* Hide default scrollbars */
                :global(body.ReactModal__Body--open) {
                    overflow: hidden;
                }
            `}</style>
        </Modal>
    );
}
