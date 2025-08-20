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
            closeOnEsc={true}
            closeOnOverlayClick={false}
        >
            <div className="mapguessr-container">
                {/* Header with close button */}
                <div className="mapguessr-header">
                    <div className="mapguessr-title-section">
                        <button
                            className="mapguessr-close-btn"
                            onClick={onClose}
                            aria-label="Close MapGuessr"
                        >
                            ✕
                        </button>
                        <h1 className="mapguessr-title">MapGuessr</h1>
                    </div>
                </div>

                {/* Embedded iframe */}
                <div className="mapguessr-iframe-container">
                    <iframe
                        src="https://mapguessr.worldguessr.com"
                        className="mapguessr-iframe"
                        title="MapGuessr"
                        frameBorder="0"
                        allowFullScreen
                        allow="geolocation; microphone; camera; fullscreen"
                        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-presentation"
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
                    font-family: inherit;
                }

                .mapguessr-header {
                    display: flex;
                    align-items: center;
                    padding: 15px 20px;
                    background: rgba(0, 0, 0, 0.95);
                    backdrop-filter: blur(10px);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    position: relative;
                    z-index: 1000;
                    min-height: 60px;
                    flex-shrink: 0;
                }

                .mapguessr-title-section {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .mapguessr-title {
                    color: #fff;
                    margin: 0;
                    font-size: 24px;
                    font-weight: bold;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                    font-family: inherit;
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
                    font-family: inherit;
                    user-select: none;
                }

                .mapguessr-close-btn:hover {
                    background: rgba(255, 255, 255, 0.2);
                    border-color: rgba(255, 255, 255, 0.4);
                    transform: scale(1.05);
                }

                .mapguessr-close-btn:active {
                    transform: scale(0.95);
                }

                .mapguessr-iframe-container {
                    flex: 1;
                    width: 100%;
                    position: relative;
                    overflow: hidden;
                    min-height: 0; /* Important for flex child */
                }

                .mapguessr-iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                    display: block;
                    background: #000;
                }

                /* Mobile optimizations */
                @media (max-width: 768px) {
                    .mapguessr-header {
                        padding: 12px 16px;
                        min-height: 54px;
                    }

                    .mapguessr-title {
                        font-size: 20px;
                    }

                    .mapguessr-close-btn {
                        width: 36px;
                        height: 36px;
                        font-size: 16px;
                    }
                }

                /* Small mobile screens */
                @media (max-width: 480px) {
                    .mapguessr-header {
                        padding: 10px 12px;
                        min-height: 48px;
                    }

                    .mapguessr-title {
                        font-size: 18px;
                    }

                    .mapguessr-close-btn {
                        width: 32px;
                        height: 32px;
                        font-size: 14px;
                    }
                }

                /* Ensure no scrollbars */
                .mapguessr-container,
                .mapguessr-iframe-container {
                    overflow: hidden;
                }

                /* Global modal styles to prevent scrolling */
                :global(.mapguessr-modal) {
                    overflow: hidden !important;
                }

                :global(.mapguessr-modal-container) {
                    overflow: hidden !important;
                    padding: 0 !important;
                }

                /* Prevent body scroll when modal is open */
                :global(body:has(.mapguessr-modal)) {
                    overflow: hidden;
                }

                /* Handle iOS viewport issues */
                @supports (-webkit-touch-callout: none) {
                    .mapguessr-container {
                        height: 100vh;
                        height: -webkit-fill-available;
                    }
                }

                /* Prevent zoom on iOS */
                @media screen and (-webkit-min-device-pixel-ratio: 0) {
                    .mapguessr-iframe {
                        -webkit-overflow-scrolling: touch;
                    }
                }
            `}</style>
        </Modal>
    );
}
