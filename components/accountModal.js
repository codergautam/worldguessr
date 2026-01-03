import { Modal } from "react-responsive-modal";
import { useEffect, useState } from "react";
import AccountView from "./accountView";
import EloView from "./eloView";
import GameHistory from "./gameHistory";
import HistoricalGameView from "./historicalGameView";
import ModerationView from "./moderationView";
import { getLeague, leagues } from "./utils/leagues";
import { signOut } from "@/components/auth/auth";
import { useTranslation } from '@/components/useTranslations';
import FriendsModal from "@/components/friendModal";
import { FaLink, FaCheck } from "react-icons/fa";
import CountryFlag from './utils/countryFlag';

export default function AccountModal({ session, shown, setAccountModalOpen, eloData, inCrazyGames, friendModal, accountModalPage, setAccountModalPage, ws, sendInvite, canSendInvite, options }) {
    const { t: text } = useTranslation("common");
    const [accountData, setAccountData] = useState({});
    const [friends, setFriends] = useState([]);
    const [sentRequests, setSentRequests] = useState([]);
    const [receivedRequests, setReceivedRequests] = useState([]);
    const [selectedGame, setSelectedGame] = useState(null);
    const [showingGameAnalysis, setShowingGameAnalysis] = useState(false);
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
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

    // Detect touch devices (mobile and iPad)
    useEffect(() => {
        const checkTouchDevice = () => {
            const hasCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
            const isTouchCapable = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            setIsTouchDevice(hasCoarsePointer || isTouchCapable);
        };

        checkTouchDevice();
        const mediaQuery = window.matchMedia('(pointer: coarse)');
        mediaQuery.addListener(checkTouchDevice);

        return () => {
            mediaQuery.removeListener(checkTouchDevice);
        };
    }, []);

    useEffect(() => {
        if (shown) {
            const fetchData = async () => {
                const response = await fetch(window.cConfig.apiUrl + '/api/publicAccount', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ id: session?.token?.accountId }),
                });
                if (response.ok) {
                    const data = await response.json();
                    setAccountData(data);
                } else {
                    alert('An error occurred');
                }
            }
            fetchData();
        } else {
            // Reset game analysis state when modal is closed
            setShowingGameAnalysis(false);
            setSelectedGame(null);
        }
    }, [shown, session?.token?.secret]);

    // Reset game analysis when switching away from history tab
    useEffect(() => {
        if (accountModalPage !== "history") {
            setShowingGameAnalysis(false);
            setSelectedGame(null);
        }
    }, [accountModalPage]);

    if (!eloData) return null;

    const navigationItems = [
        { key: "profile", label: text("profile"), icon: "👤" },
        { key: "history", label: text("history"), icon: "📜" },
        { key: "elo", label: text("ELO"), icon: "🏆" },
        { key: "list", label: text("friendsText"), icon: "👥" },
        { key: "moderation", label: text("moderationTab"), icon: "⚖️" }
    ];


    const renderContent = () => {
        switch (accountModalPage) {
            case "profile":
                return (
                    <div className="profile-content">
                        <AccountView
                            accountData={accountData}
                            supporter={session?.token?.supporter}
                            eloData={eloData}
                            session={session}
                        />

                        {!inCrazyGames && (
                            <div className="profile-actions">
                                <button
                                    className="logout-button"
                                    onClick={() => signOut()}
                                >
                                    {text("logOut")}
                                </button>
                            </div>
                        )}
                    </div>
                );
            case "history":
                return (
                    <GameHistory
                        session={session}
                        onGameClick={(game) => {
                            setSelectedGame(game);
                            setShowingGameAnalysis(true);
                        }}
                    />
                );
            case "elo":
                return <EloView eloData={eloData} session={session} />;
            case "moderation":
                return <ModerationView session={session} />;
            case "list":
            default:
                return (
                    <FriendsModal
                        ws={ws}
                        canSendInvite={canSendInvite}
                        sendInvite={sendInvite}
                        accountModalPage="consolidated" // Always show consolidated view
                        setAccountModalPage={setAccountModalPage}
                        friends={friends}
                        shown={true}
                        setFriends={setFriends}
                        sentRequests={sentRequests}
                        setSentRequests={setSentRequests}
                        receivedRequests={receivedRequests}
                        setReceivedRequests={setReceivedRequests}
                    />
                );
        }
    };

    return (
        <>
            {/* Game Analysis - Render outside modal when active */}
            {accountModalPage === "history" && showingGameAnalysis && selectedGame && (
                <HistoricalGameView
                    game={selectedGame}
                    session={session}
                    options={options}
                    onBack={() => {
                        setShowingGameAnalysis(false);
                        setSelectedGame(null);
                    }}
                />
            )}

            {/* Main Modal */}
                <Modal
                    styles={{
                        modal: {
                            padding: 0,
                            margin: 0,
                            maxWidth: 'none',
                            width: '100vw',
                            height: '100vh',
                            background: 'transparent',
                            borderRadius: 0,
                            overflow: 'hidden', // Prevent modal from scrolling
                            display: 'flex',
                            alignItems: 'stretch',
                            justifyContent: 'stretch'
                        },
                        modalContainer: {
                            height: 'auto',
                        },
                        overlay: {
                            // Disable library's overlay scroll behavior
                            overflow: 'hidden'
                        }
                    }}
                    classNames={{ modal: "account-modal", modalContainer: "account-modal-p-container" }}
                    open={shown}
                    center
                    onClose={() => setAccountModalOpen(false)}
                    showCloseIcon={false}
                    animationDuration={300}
                    blockScroll={false} // Critical: prevent library from blocking body scroll
                    closeOnOverlayClick={true}
                >
                    <div className="account-modal-container">
                        {/* Background with overlay */}
                        <div className="account-modal-background"></div>

                        {/* Main content */}
                        <div className="account-modal-content" style={{
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            overflow: 'hidden'
                        }}>
                            {/* Header with prominent close button */}
                            <div className="account-modal-header" style={{
                                // Make header more compact on touch devices
                                padding: isTouchDevice ? '10px 20px' : undefined,
                                minHeight: isTouchDevice ? '50px' : undefined
                            }}>
                                <h1 className="account-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {accountData?.username || text("account")}
                                    {accountData?.countryCode && <CountryFlag countryCode={accountData.countryCode} style={{ fontSize: '0.8em' }} />}
                                    {accountData?.username && (
                                        <button
                                            onClick={() => {
                                                const profileUrl = `${window.location.origin}/user?u=${encodeURIComponent(accountData.username)}`;
                                                navigator.clipboard.writeText(profileUrl).then(() => {
                                                    setCopiedLink(true);
                                                    setTimeout(() => setCopiedLink(false), 2000);
                                                });
                                            }}
                                            title={text("copyProfileLink") || "Copy profile link"}
                                            style={{
                                                marginLeft: '10px',
                                                background: 'rgba(255,255,255,0.1)',
                                                border: 'none',
                                                borderRadius: '6px',
                                                padding: '6px 10px',
                                                cursor: 'pointer',
                                                color: copiedLink ? '#4ade80' : 'rgba(255,255,255,0.7)',
                                                fontSize: '0.8rem',
                                                transition: 'all 0.2s ease',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                verticalAlign: 'middle'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!copiedLink) e.target.style.color = '#fff';
                                                e.target.style.background = 'rgba(255,255,255,0.2)';
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!copiedLink) e.target.style.color = 'rgba(255,255,255,0.7)';
                                                e.target.style.background = 'rgba(255,255,255,0.1)';
                                            }}
                                        >
                                            {copiedLink ? <FaCheck /> : <FaLink />}
                                        </button>
                                    )}
                                    {accountData?.supporter && <span style={badgeStyle}>{text("supporter")}</span>}
                                </h1>


                                <button
                                    className="account-modal-close"
                                    onClick={() => setAccountModalOpen(false)}
                                    aria-label="Close"
                                >
                                    <span className="close-icon">✕</span>
                                </button>
                            </div>

                            {/* Navigation */}
                            <div className="account-modal-nav-container" style={{
                                // Make navigation more compact on touch devices
                                padding: isTouchDevice ? '5px 0' : undefined
                            }}>
                                <nav className="account-modal-nav">
                                    {navigationItems.map((item) => (
                                        <button
                                            key={item.key}
                                            className={`account-nav-item ${accountModalPage === item.key ? 'active' : ''}`}
                                            onClick={() => setAccountModalPage(item.key)}
                                            style={{
                                                // Make nav buttons more compact on touch devices
                                                padding: isTouchDevice ? '8px 12px' : undefined,
                                                fontSize: isTouchDevice ? '0.9rem' : undefined
                                            }}
                                        >
                                            <span className="nav-icon">{item.icon}</span>
                                            <span className="nav-label">{item.label}</span>
                                        </button>
                                    ))}
                                </nav>
                            </div>

                            {/* Content Area - Single scroll container for iOS */}
                            <div className="account-modal-body" style={{
                                height: '100%',
                                overflowY: 'scroll', // Force scroll instead of auto
                                overflowX: 'hidden',
                                WebkitOverflowScrolling: 'touch',
                                touchAction: 'pan-y pinch-zoom', // Allow vertical pan and pinch
                                overscrollBehavior: 'contain',
                                scrollbarGutter: 'stable',
                                transform: 'translateZ(0)', // Force hardware acceleration
                                willChange: 'scroll-position', // Optimize for scroll performance
                                flex: '1 1 auto',
                                minHeight: 0,
                                minWidth: 0,
                                boxSizing: 'border-box'
                            }}>
                                <div style={{
                                    width: '100%',
                                    overflowY: 'visible',
                                    overflowX: 'hidden',
                                    // Only apply large minHeight for pages that can have lots of content (history, profile, elo, moderation)
                                    // For friends tabs (list, add, sent, received), use natural height to prevent unnecessary scroll space
                                    minHeight: (accountModalPage === 'history' || accountModalPage === 'profile' || accountModalPage === 'elo' || accountModalPage === 'moderation')
                                        ? 'calc(100vh + 1px)'
                                        : 'calc(100% + 1px)', // Minimal height for iOS scroll to work
                                    paddingBottom: '40px'
                                }}>
                                    {renderContent()}
                                </div>
                            </div>
                        </div>
                    </div>
                </Modal>
        </>
    )
}