import msToTime from "./msToTime";
import { useTranslation } from '@/components/useTranslations'
import { getLeague, leagues } from "./utils/leagues";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FaClock, FaGamepad, FaGlobe, FaStar, FaEye, FaUsers, FaTriangleExclamation } from "react-icons/fa6";
import XPGraph from "./XPGraph";
import PendingNameChangeModal from "./pendingNameChangeModal";
import CountrySelectorModal from "./countrySelectorModal";
import CountryFlag from "./utils/countryFlag";
import { fetchWithFallback } from "./utils/retryFetch";
import Season0Badges from "./season0Badges";

export default function AccountView({ accountData, setAccountData, eloData, session, setSession, isPublic = false, username = null, viewingPublicProfile = false, ws = null }) {
    const { t: text } = useTranslation("common");
    const [showForcedNameChangeModal, setShowForcedNameChangeModal] = useState(false);
    const [showCountrySelector, setShowCountrySelector] = useState(false);
    const [currentCountry, setCurrentCountry] = useState(null);

    // Check if user is forced to change their name
    const isForcedNameChange = !isPublic && session?.token?.pendingNameChange;

    // Load current country from accountData (fetched fresh when modal opens)
    useEffect(() => {
        if (!isPublic && accountData?.countryCode !== undefined) {
            setCurrentCountry(accountData.countryCode || null);
        }
    }, [isPublic, accountData?.countryCode]);

    const changeName = async () => {
        // If forced to change name, open the proper modal instead of prompt
        if (isForcedNameChange) {
            setShowForcedNameChangeModal(true);
            return;
        }

        if (window.settingName) return;
        const secret = session?.token?.secret;
        if (!secret) return alert("An error occurred (log out and log back in)");
        // make sure name change is not in progress

        try {
            const response1 = await fetch(window.cConfig.apiUrl + '/api/checkIfNameChangeProgress', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token: secret })
            });

            // get the json
            const data1 = await response1.json();
            if (data1.name) {
                return alert(text("nameChangeInProgress", { name: data1.name }));
            }
        } catch (error) {
            return alert('An error occurred');
        }

        const username = prompt(text("enterNewName"));

        window.settingName = true;
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
            window.settingName = false;
            alert(text("nameChanged"));

            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            window.settingName = false;
            try {
                const data = await response.json();
                alert(data.message || 'An error occurred');

            } catch (error) {
                alert('An error occurred');
            }
        }

    };

    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flexStart',
        textAlign: "left",
        color: '#fff',
        fontFamily: '"Lexend", "Lexend Fallback", sans-serif',
        paddingBottom: '20px',
        boxSizing: 'border-box',
        borderRadius: '10px',
        gap: "16px"
    };

    const profileCardStyle = {
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '20px',
        padding: '30px',
        // No backdropFilter: this card lives inside the scrollable account-modal
        // body, where backdrop-filter blur causes white flicker artifacts during
        // scroll (same reason it was removed from .account-modal-body). The body
        // backdrop is a near-uniform dark gradient, so the blur added nothing.
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    };

    const titleStyle = {
        fontSize: '48px',
        fontWeight: 'bold',
        textShadow: '2px 2px 4px rgba(0,0,0,0.2)',
        marginBottom: '20px'
    };

    const textStyle = {
        fontSize: '20px',
        letterSpacing: '0.5px',
        marginBottom: '15px',
        display: 'flex',
        alignItems: 'center'
    };

    const iconStyle = {
        marginRight: '12px',
        fontSize: '20px',
        width: '24px'
    };

    const warningStyle = {
        ...textStyle,
        color: '#ffc107',
        background: 'rgba(255, 193, 7, 0.1)',
        padding: '10px 15px',
        borderRadius: '10px',
        border: '1px solid rgba(255, 193, 7, 0.3)'
    };

    return (
        <div style={containerStyle}>
            <div style={profileCardStyle}>
                <div style={textStyle}>
                    <FaClock style={iconStyle} />
                    <span className="account-profile-joined-copy">
                        <span>{text("joined", { t: msToTime(Date.now() - new Date(accountData.createdAt).getTime()) })}</span>
                        <Season0Badges profileData={accountData} text={text} variant="compact" />
                    </span>
                </div>

                {accountData.lastLogin && viewingPublicProfile && false && (
                    <div style={textStyle}>
                        <FaEye style={iconStyle} />
                        {text("lastSeen")}: {msToTime(Date.now() - new Date(accountData.lastLogin).getTime())} {text("ago")}
                    </div>
                )}
                <div style={textStyle}>
                    <FaStar style={{ ...iconStyle }} />
                    {accountData.totalXp} XP
                </div>

                <div style={textStyle}>
                    <FaGamepad style={iconStyle} />
                    {text("gamesPlayed", { games: accountData.gamesLen || accountData.gamesPlayed || 0 })}
                </div>

                {viewingPublicProfile && accountData.profileViews !== undefined && (
                    <div style={textStyle}>
                        <FaUsers style={iconStyle} />
                        {text("profileViews") || "Profile Views"}: {accountData.profileViews.toLocaleString()}
                    </div>
                )}

                {/* change name button - hidden in public view */}
                {!isPublic && (
                    <>
                        {isForcedNameChange ? (
                            // Forced name change - always show button, ignore cooldowns
                            <button
                                type="button"
                                className="account-profile-action account-profile-action--required"
                                onClick={changeName}
                            >
                                <FaTriangleExclamation aria-hidden="true" />
                                {text("changeName")} ({text("required") || "Required"})
                            </button>
                        ) : accountData.canChangeUsername ? (
                            <button
                                type="button"
                                className="account-profile-action"
                                onClick={changeName}
                            >
                                {text("changeName")}
                            </button>
                        ) : accountData.recentChange ? (
                            <div style={warningStyle}>
                                <i className="fas fa-exclamation-triangle" style={iconStyle}></i>
                                {text("recentChange")}
                            </div>
                        ) : null}

                        {!isForcedNameChange && accountData.daysUntilNameChange > 0 && (
                            <div style={warningStyle}>
                                <i className="fas fa-exclamation-triangle" style={iconStyle}></i>
                                {text("nameChangeCooldown", { days: accountData.daysUntilNameChange })}
                            </div>
                        )}
                    </>
                )}

                {/* Change country flag button - hidden in public view */}
                {!isPublic && (
                    <button
                        type="button"
                        className="account-profile-action"
                        onClick={() => setShowCountrySelector(true)}
                    >
                        {currentCountry
                            ? <><CountryFlag countryCode={currentCountry} size={1.2} />{text("changeFlag") || "Change Flag"}</>
                            : <><FaGlobe aria-hidden="true" />{text("setFlag") || "Set Flag"}</>
                        }
                    </button>
                )}
            </div>

            <XPGraph session={session} isPublic={isPublic} username={username} />

            {/* Forced Name Change Modal - use portal to escape parent container's backdrop-filter */}
            {showForcedNameChangeModal && typeof document !== 'undefined' && createPortal(
                <PendingNameChangeModal
                    session={session}
                    isOpen={showForcedNameChangeModal}
                    onClose={() => setShowForcedNameChangeModal(false)}
                />,
                document.body
            )}

            {/* Country Selector Modal */}
            {showCountrySelector && (
                <CountrySelectorModal
                    shown={showCountrySelector}
                    onClose={() => setShowCountrySelector(false)}
                    currentCountry={currentCountry}
                    onSelect={(newCountry) => {
                        // Update local state
                        setCurrentCountry(newCountry);
                        // Update accountData for immediate UI update
                        if (setAccountData) {
                            setAccountData(prev => ({ ...prev, countryCode: newCountry }));
                        }
                        // Update session so accountBtn and other components reflect the change
                        if (setSession) {
                            setSession(prev => ({
                                ...prev,
                                token: { ...prev?.token, countryCode: newCountry }
                            }));
                        }
                    }}
                    session={session}
                    ws={ws}
                />
            )}
        </div>
    );
}
