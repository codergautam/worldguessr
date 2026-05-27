import {Modal} from "react-responsive-modal";
import { useState, useEffect } from "react";
import { useTranslation } from '@/components/useTranslations'
import { asset } from '@/lib/basePath';
import sendEvent from "./utils/sendEvent";
import { fetchWithFallback } from "./utils/retryFetch";

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
            const response = await fetchWithFallback(
                (window.cConfig.authUrl || window.cConfig.apiUrl) + '/api/setName',
                window.cConfig.apiUrl + '/api/setName',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, token: secret })
                },
                'setName'
            );

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
            classNames={{ modal: 'wg-setUsername__modal' }}
            styles={{
                root: { zIndex: 20000 },
                modal: {
                    background: 'transparent',
                    padding: 0,
                    margin: 0,
                    boxShadow: 'none',
                    maxWidth: '100%',
                    width: 'auto',
                    overflow: 'visible',
                },
                closeButton: { display: 'none' },
                overlay: {
                    background: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(14px)',
                    overflow: 'hidden',
                    // Must sit above the Daily results backdrop (z-index 10000
                    // in styles/daily.scss) so the first-time username prompt
                    // isn't trapped behind an open results modal.
                },
            }}
            open={shown}
            center
            onClose={() => {}}
            closeOnOverlayClick={false}
            closeOnEsc={false}
        >
            <div className="wg-setUsername">
                <div className="wg-setUsername__hero">
                    <span className="wg-setUsername__heroPrefix">
                        {text("welcomeToPrefix")}
                    </span>
                    <img
                        className="wg-setUsername__heroBrand"
                        src={asset('/assets/logos/title.png')}
                        alt="WorldGuessr"
                        draggable={false}
                    />
                </div>

                <p className="wg-setUsername__desc">
                    {text("enterUsername")}
                </p>

                <div className="wg-setUsername__form">
                    <input
                        type="text"
                        className="wg-setUsername__input"
                        placeholder={text("enterUsernameBox")}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={isLoading}
                        maxLength={30}
                        autoFocus
                    />

                    <button
                        type="button"
                        className="wg-setUsername__save"
                        onClick={handleSave}
                        disabled={!username.trim() || isLoading}
                    >
                        {isLoading ? (
                            <span className="wg-setUsername__spinner" aria-hidden="true" />
                        ) : (
                            text("save")
                        )}
                    </button>
                </div>

                {error && (
                    <div className="wg-setUsername__error" role="alert">
                        {error}
                    </div>
                )}
            </div>
        </Modal>
    );
}
