import { useState, useEffect } from "react";
import AccountView from "./accountView";
import EloView from "./eloView";
import { useTranslation } from '@/components/useTranslations';
import CountryFlag from './utils/countryFlag';
import config from '@/clientConfig';

export default function PublicProfile({ profileData, eloData, currentUser }) {
    const { t: text } = useTranslation("common");
    const [activePage, setActivePage] = useState("profile");
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportDescription, setReportDescription] = useState('');
    const [reportSubmitting, setReportSubmitting] = useState(false);
    const [reportError, setReportError] = useState(null);
    const [reportSuccess, setReportSuccess] = useState(false);

    // Cleanup body scroll on unmount if modal is open
    useEffect(() => {
        return () => {
            if (showReportModal && typeof document !== 'undefined') {
                document.body.style.overflow = '';
            }
        };
    }, [showReportModal]);

    const navigationItems = [
        { key: "profile", label: text("profile"), icon: "👤" },
        { key: "elo", label: text("ELO"), icon: "🏆" },
    ];

    // Check if user can report this profile
    const canReport = currentUser && profileData &&
                      currentUser.username !== profileData.username &&
                      !currentUser.banned;

    // Handle opening report modal
    const handleOpenReportModal = () => {
        setShowReportModal(true);
        setReportError(null);
        setReportDescription('');
        setReportSuccess(false);
        // Prevent body scroll when modal is open
        if (typeof document !== 'undefined') {
            document.body.style.overflow = 'hidden';
        }
    };

    // Handle closing report modal
    const handleCloseReportModal = () => {
        setShowReportModal(false);
        // Restore body scroll
        if (typeof document !== 'undefined') {
            document.body.style.overflow = '';
        }
        // Reset state after a short delay to avoid flickering
        setTimeout(() => {
            setReportError(null);
            setReportDescription('');
            setReportSuccess(false);
        }, 150);
    };

    // Handle report submission
    const handleReportSubmit = async (e) => {
        e.preventDefault();
        setReportError(null);
        setReportSubmitting(true);

        if (reportDescription.trim().length < 10) {
            setReportError('Description must be at least 10 characters');
            setReportSubmitting(false);
            return;
        }

        try {
            const secret = typeof window !== 'undefined' ? window.localStorage.getItem('wg_secret') : null;
            if (!secret) {
                setReportError('You must be logged in to report');
                setReportSubmitting(false);
                return;
            }

            const { apiUrl } = config();
            const response = await fetch(`${apiUrl}/api/submitUsernameReport`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    secret,
                    reportedUsername: profileData.username,
                    description: reportDescription.trim()
                })
            });

            const data = await response.json();

            if (response.ok) {
                setReportSuccess(true);
                setReportDescription('');
                setTimeout(() => {
                    handleCloseReportModal();
                }, 2000);
            } else {
                setReportError(data.message || 'Failed to submit report');
            }
        } catch (error) {
            console.error('Report submission error:', error);
            setReportError('An error occurred while submitting the report');
        } finally {
            setReportSubmitting(false);
        }
    };

    const renderContent = () => {
        switch (activePage) {
            case "profile":
                return (
                    <div className="profile-content">
                        <AccountView
                            accountData={profileData}
                            supporter={profileData?.supporter}
                            eloData={eloData}
                            session={null}
                            isPublic={true}
                            username={profileData?.username}
                            viewingPublicProfile={true}
                        />
                    </div>
                );
            case "elo":
                return (
                    <div className="elo-content">
                        <EloView
                            eloData={eloData}
                            session={null}
                            isPublic={true}
                            username={profileData?.username}
                            viewingPublicProfile={true}
                        />
                    </div>
                );
            default:
                return null;
        }
    };

    const badgeStyle = {
        marginLeft: '15px',
        color: 'black',
        fontSize: '0.7rem',
        background: 'linear-gradient(135deg, #ffd700, #ffed4e)',
        padding: '4px 12px',
        borderRadius: '15px',
        fontWeight: 'bold',
        textShadow: 'none'
    };

    return (
        <div className="public-profile-container">
            <div className="public-profile-content">
                {/* Header */}
                <div className="public-profile-header">
                    <div className="header-content">
                        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            {profileData?.username}
                            {profileData?.countryCode && <CountryFlag countryCode={profileData.countryCode} style={{ fontSize: '0.9em' }} />}
                            {profileData?.supporter && (
                                <span style={badgeStyle}>
                                    SUPPORTER
                                </span>
                            )}
                        </h1>
                        {canReport && (
                            <button
                                className="report-button"
                                onClick={handleOpenReportModal}
                                title="Report inappropriate username"
                            >
                                ⚠️ Report
                            </button>
                        )}
                    </div>
                </div>

                {/* Navigation */}
                <nav className="public-profile-nav">
                    {navigationItems.map(item => (
                        <button
                            key={item.key}
                            className={`public-profile-nav-item ${activePage === item.key ? 'active' : ''}`}
                            onClick={() => setActivePage(item.key)}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span className="nav-label">{item.label}</span>
                        </button>
                    ))}
                </nav>

                {/* Content */}
                <div className="public-profile-body">
                    {renderContent()}
                </div>
            </div>

            {/* Report Modal */}
            {showReportModal && (
                <div className="modal-overlay" onClick={handleCloseReportModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Report Inappropriate Username</h2>
                            <button
                                className="modal-close"
                                onClick={handleCloseReportModal}
                            >
                                ×
                            </button>
                        </div>

                        {reportSuccess ? (
                            <div className="success-message">
                                <div className="success-icon">✓</div>
                                <p>Report submitted successfully</p>
                            </div>
                        ) : (
                            <form onSubmit={handleReportSubmit}>
                                <div className="modal-body">
                                    <p className="modal-description">
                                        You are reporting the username: <strong>{profileData?.username}</strong>
                                    </p>
                                    <p className="modal-note">
                                        Please explain why this username is inappropriate (minimum 10 characters):
                                    </p>
                                    <textarea
                                        className="report-textarea"
                                        value={reportDescription}
                                        onChange={(e) => setReportDescription(e.target.value)}
                                        placeholder="Describe why this username is inappropriate..."
                                        maxLength={500}
                                        rows={5}
                                        disabled={reportSubmitting}
                                    />
                                    <div className="char-count">
                                        {reportDescription.length}/500 characters
                                    </div>
                                    {reportError && (
                                        <div className="error-message">{reportError}</div>
                                    )}
                                </div>
                                <div className="modal-footer">
                                    <button
                                        type="button"
                                        className="modal-button cancel"
                                        onClick={handleCloseReportModal}
                                        disabled={reportSubmitting}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="modal-button submit"
                                        disabled={reportSubmitting || reportDescription.trim().length < 10}
                                    >
                                        {reportSubmitting ? 'Submitting...' : 'Submit Report'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            <style jsx>{`
                .public-profile-container {
                    width: 100%;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: "Lexend", sans-serif;
                }

                .public-profile-content {
                    max-width: 1200px;
                    margin: 0 auto;
                    background: rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border-radius: 20px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    overflow: hidden;
                    font-family: "Lexend", sans-serif;
                }

                .public-profile-header {
                    background: rgba(0, 0, 0, 0.2);
                    padding: 30px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }

                .header-content {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 20px;
                    flex-wrap: wrap;
                }

                .public-profile-header h1 {
                    margin: 0;
                    font-size: clamp(28px, 5vw, 48px);
                    font-weight: bold;
                    color: white;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: "Lexend", sans-serif;
                }

                .report-button {
                    padding: 10px 20px;
                    background: rgba(255, 107, 107, 0.2);
                    border: 2px solid rgba(255, 107, 107, 0.4);
                    border-radius: 12px;
                    color: #ff6b6b;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-family: "Lexend", sans-serif;
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                }

                .report-button:hover {
                    background: rgba(255, 107, 107, 0.3);
                    border-color: rgba(255, 107, 107, 0.6);
                    color: #ff8787;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
                }

                .report-button:active {
                    transform: translateY(0);
                }

                .public-profile-nav {
                    display: flex;
                    gap: 10px;
                    padding: 20px;
                    background: rgba(0, 0, 0, 0.1);
                    overflow-x: auto;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
                }

                .public-profile-nav::-webkit-scrollbar {
                    height: 6px;
                }

                .public-profile-nav::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.3);
                    border-radius: 3px;
                }

                .public-profile-nav-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 24px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 12px;
                    color: white;
                    font-size: 16px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    white-space: nowrap;
                    font-family: "Lexend", sans-serif;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                }

                .public-profile-nav-item:hover {
                    background: rgba(255, 255, 255, 0.1);
                    transform: translateY(-2px);
                    border-color: rgba(255, 255, 255, 0.3);
                }

                .public-profile-nav-item.active {
                    background: var(--gradGreenBtn);
                    border-color: rgba(255, 255, 255, 0.3);
                    filter: drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.3));
                }

                .nav-icon {
                    font-size: 20px;
                }

                .nav-label {
                    font-size: 14px;
                }

                .public-profile-body {
                    padding: 30px;
                    max-height: calc(100vh - 300px);
                    overflow-y: auto;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
                    font-family: "Lexend", sans-serif;
                }

                .public-profile-body::-webkit-scrollbar {
                    width: 8px;
                }

                .public-profile-body::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.3);
                    border-radius: 4px;
                }

                .profile-content,
                .elo-content {
                    animation: fadeIn 0.3s ease;
                }

                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                /* Modal Styles */
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(5px);
                    -webkit-backdrop-filter: blur(5px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 20px;
                    animation: fadeIn 0.2s ease;
                }

                .modal-content {
                    background: rgba(20, 26, 57, 0.95);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 20px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                    max-width: 500px;
                    width: 100%;
                    font-family: "Lexend", sans-serif;
                    animation: slideUp 0.3s ease;
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 25px 30px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }

                .modal-header h2 {
                    margin: 0;
                    font-size: 24px;
                    font-weight: 700;
                    color: white;
                    font-family: "Lexend", sans-serif;
                }

                .modal-close {
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 32px;
                    cursor: pointer;
                    padding: 0;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    border-radius: 8px;
                }

                .modal-close:hover {
                    color: white;
                    background: rgba(255, 255, 255, 0.1);
                }

                .modal-body {
                    padding: 30px;
                }

                .modal-description {
                    margin: 0 0 15px 0;
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 16px;
                    line-height: 1.5;
                }

                .modal-description strong {
                    color: #4dabf7;
                    font-weight: 600;
                }

                .modal-note {
                    margin: 0 0 15px 0;
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 14px;
                }

                .report-textarea {
                    width: 100%;
                    background: rgba(0, 0, 0, 0.3);
                    border: 2px solid rgba(255, 255, 255, 0.2);
                    border-radius: 12px;
                    padding: 15px;
                    color: white;
                    font-size: 14px;
                    font-family: "Lexend", sans-serif;
                    resize: vertical;
                    transition: all 0.3s ease;
                }

                .report-textarea:focus {
                    outline: none;
                    border-color: rgba(77, 171, 247, 0.6);
                    background: rgba(0, 0, 0, 0.4);
                }

                .report-textarea::placeholder {
                    color: rgba(255, 255, 255, 0.4);
                }

                .report-textarea:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .char-count {
                    text-align: right;
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-top: 5px;
                }

                .error-message {
                    margin-top: 15px;
                    padding: 12px;
                    background: rgba(255, 107, 107, 0.2);
                    border: 1px solid rgba(255, 107, 107, 0.4);
                    border-radius: 8px;
                    color: #ff8787;
                    font-size: 14px;
                }

                .success-message {
                    padding: 40px;
                    text-align: center;
                }

                .success-icon {
                    width: 60px;
                    height: 60px;
                    background: rgba(76, 175, 80, 0.2);
                    border: 3px solid rgba(76, 175, 80, 0.6);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 32px;
                    color: #4CAF50;
                    margin: 0 auto 20px auto;
                }

                .success-message p {
                    margin: 0;
                    color: white;
                    font-size: 18px;
                    font-weight: 500;
                }

                .modal-footer {
                    display: flex;
                    gap: 15px;
                    padding: 20px 30px 30px 30px;
                }

                .modal-button {
                    flex: 1;
                    padding: 14px 24px;
                    border: 2px solid;
                    border-radius: 12px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-family: "Lexend", sans-serif;
                }

                .modal-button.cancel {
                    background: rgba(255, 255, 255, 0.05);
                    border-color: rgba(255, 255, 255, 0.2);
                    color: rgba(255, 255, 255, 0.8);
                }

                .modal-button.cancel:hover:not(:disabled) {
                    background: rgba(255, 255, 255, 0.1);
                    border-color: rgba(255, 255, 255, 0.3);
                    color: white;
                }

                .modal-button.submit {
                    background: rgba(77, 171, 247, 0.2);
                    border-color: rgba(77, 171, 247, 0.4);
                    color: #4dabf7;
                }

                .modal-button.submit:hover:not(:disabled) {
                    background: rgba(77, 171, 247, 0.3);
                    border-color: rgba(77, 171, 247, 0.6);
                    color: white;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 15px rgba(77, 171, 247, 0.3);
                }

                .modal-button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                }

                .modal-button:active:not(:disabled) {
                    transform: translateY(0);
                }

                @media (max-width: 768px) {
                    .public-profile-container {
                        padding: 10px;
                    }

                    .public-profile-header {
                        padding: 20px;
                    }

                    .header-content {
                        flex-direction: column;
                        gap: 15px;
                    }

                    .report-button {
                        font-size: 13px;
                        padding: 8px 16px;
                    }

                    .public-profile-nav {
                        padding: 15px;
                    }

                    .public-profile-body {
                        padding: 20px;
                        max-height: calc(100vh - 250px);
                    }

                    .nav-label {
                        display: none;
                    }

                    .public-profile-nav-item {
                        padding: 12px;
                    }

                    .nav-icon {
                        font-size: 24px;
                    }

                    .modal-content {
                        margin: 10px;
                    }

                    .modal-header {
                        padding: 20px;
                    }

                    .modal-header h2 {
                        font-size: 20px;
                    }

                    .modal-body {
                        padding: 20px;
                    }

                    .modal-footer {
                        flex-direction: column;
                        padding: 15px 20px 20px 20px;
                    }

                    .modal-button {
                        width: 100%;
                    }
                }

                @media (max-width: 480px) {
                    .public-profile-body {
                        padding: 15px;
                    }

                    .modal-header h2 {
                        font-size: 18px;
                    }

                    .modal-description {
                        font-size: 14px;
                    }
                }
            `}</style>
        </div>
    );
}
