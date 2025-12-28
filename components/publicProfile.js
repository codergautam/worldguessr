import { useState } from "react";
import AccountView from "./accountView";
import EloView from "./eloView";
import { useTranslation } from '@/components/useTranslations';

export default function PublicProfile({ profileData, eloData }) {
    const { t: text } = useTranslation("common");
    const [activePage, setActivePage] = useState("profile");

    const navigationItems = [
        { key: "profile", label: text("profile"), icon: "👤" },
        { key: "elo", label: text("ELO"), icon: "🏆" },
    ];

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
                    <h1>
                        {profileData?.username}
                        {profileData?.supporter && (
                            <span style={badgeStyle}>
                                SUPPORTER
                            </span>
                        )}
                    </h1>
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

            <style jsx>{`
                .public-profile-container {
                    width: 100%;
                    padding: 0;
                    box-sizing: border-box;
                }

                .public-profile-content {
                    max-width: 1200px;
                    margin: 0 auto;
                    background: var(--gradLight);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    border-radius: 20px;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    filter: drop-shadow(0px 6px 7px rgba(0, 0, 0, 0.3));
                    overflow: hidden;
                }

                .public-profile-header {
                    background: rgba(0, 0, 0, 0.2);
                    padding: 30px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
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

                @media (max-width: 768px) {
                    .public-profile-container {
                        padding: 10px;
                    }

                    .public-profile-header {
                        padding: 20px;
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
                }

                @media (max-width: 480px) {
                    .public-profile-body {
                        padding: 15px;
                    }
                }
            `}</style>
        </div>
    );
}
