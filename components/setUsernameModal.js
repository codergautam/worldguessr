import {Modal} from "react-responsive-modal";
import { useState, useEffect } from "react";
import { useTranslation } from '@/components/useTranslations'
import sendEvent from "./utils/sendEvent";

export default function SetUsernameModal({ shown, onClose, session }) {
    const [username, setUsername] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const { t: text } = useTranslation("common");

    const handleSave = async () => {
        if(window.settingName || isLoading) return;

        setIsLoading(true);
        setError("");

        const secret = session.token.secret;
        window.settingName = true;

        try {
            const response = await fetch(window.cConfig.apiUrl+'/api/setName', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, token: secret })
            });

            if (response.ok) {
                sendEvent("sign_up");
                setTimeout(() => {
                    window.location.reload();
                }, 200);
            } else {
                window.settingName = false;
                const data = await response.json();
                setError(data.message || 'An error occurred');
                setIsLoading(false);
            }
        } catch (error) {
            window.settingName = false;
            setError('Connection error. Please try again.');
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && username.trim() && !isLoading) {
            handleSave();
        }
    };

    return (
        <Modal
            id="setUsernameModal"
            styles={{
                modal: {
                    background: 'transparent',
                    padding: 0,
                    margin: 0,
                    boxShadow: 'none',
                    maxWidth: '100%',
                    width: 'auto',
                    overflow: 'visible'
                },
                closeButton: {
                    display: 'none'
                },
                overlay: {
                    background: 'rgba(0, 0, 0, 0.8)',
                    backdropFilter: 'blur(10px)',
                    overflow: 'hidden'
                }
            }}
            open={shown}
            center
            onClose={() => {}}
            closeOnOverlayClick={false}
            closeOnEsc={false}
        >
            <div className="join-party-card" style={{
                minWidth: '400px',
                animation: 'slideInUp 0.6s ease-out'
            }}>
                <h2 className="join-party-title" style={{
                    marginBottom: '20px'
                }}>
                    {text("welcomeToWorldguessr")}
                </h2>

                <p style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: 'min(clamp(1rem, 2vw, 1.1rem), clamp(0.9rem, 2.5vh, 1rem))',
                    marginBottom: '25px',
                    lineHeight: '1.4'
                }}>
                    {text("enterUsername")}
                </p>

                <div className="join-party-form">
                    <div className="join-party-input-group">
                        <input
                            type="text"
                            className="join-party-input"
                            placeholder={text("enterUsernameBox")}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyPress={handleKeyPress}
                            disabled={isLoading}
                            maxLength={20}
                            style={{
                                opacity: isLoading ? 0.7 : 1,
                                cursor: isLoading ? 'not-allowed' : 'text'
                            }}
                        />

                        <button
                            className="join-party-button"
                            onClick={handleSave}
                            disabled={!username.trim() || isLoading}
                            style={{
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                        >
                            {isLoading ? (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <div style={{
                                        width: '16px',
                                        height: '16px',
                                        border: '2px solid rgba(255, 255, 255, 0.3)',
                                        borderTop: '2px solid white',
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite'
                                    }}></div>
                                </div>
                            ) : (
                                text("save")
                            )}
                        </button>
                    </div>

                    {error && (
                        <div className="join-party-error" style={{
                            animation: 'errorSlideIn 0.3s ease-out'
                        }}>
                            {error}
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </Modal>
    )
}
