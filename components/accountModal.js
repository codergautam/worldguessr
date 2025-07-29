import { Modal } from "react-responsive-modal";
import { useEffect, useState } from "react";
import AccountView from "./accountView";
import EloView from "./eloView";
import GameHistory from "./gameHistory";
import HistoricalGameView from "./historicalGameView";
import { getLeague, leagues } from "./utils/leagues";
import { signOut } from "@/components/auth/auth";
import { useTranslation } from '@/components/useTranslations';
import FriendsModal from "@/components/friendModal";

export default function AccountModal({ session, shown, setAccountModalOpen, eloData, inCrazyGames, friendModal, accountModalPage, setAccountModalPage, ws, sendInvite, canSendInvite }) {
    const { t: text } = useTranslation("common");
    const [accountData, setAccountData] = useState({});
    const [friends, setFriends] = useState([]);
    const [sentRequests, setSentRequests] = useState([]);
    const [receivedRequests, setReceivedRequests] = useState([]);
    const [selectedGame, setSelectedGame] = useState(null);
    const [showingGameAnalysis, setShowingGameAnalysis] = useState(false);
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

    useEffect(() => {
        if (shown) {
            const fetchData = async () => {
                const response = await fetch(window.cConfig.apiUrl + '/api/publicAccount', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ secret: session?.token?.secret }),
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
        { key: "list", label: text("friends", {cnt: friends.length}), icon: "👥" },
        { key: "sent", label: text("viewSentRequests", { cnt: sentRequests.length }), icon: "📤" },
        { key: "received", label: text("viewReceivedRequests", { cnt: receivedRequests.length }), icon: "📥" },
        { key: "add", label: text("addFriend"), icon: "➕" }
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
                return <EloView eloData={eloData} />;
            default:
                return (
                    <FriendsModal
                        ws={ws}
                        canSendInvite={canSendInvite}
                        sendInvite={sendInvite}
                        accountModalPage={accountModalPage}
                        setAccountModalPage={setAccountModalPage}
                        friends={friends}
                        shown={accountModalPage !== "profile" && accountModalPage !== "elo"}
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
                    onBack={() => {
                        setShowingGameAnalysis(false);
                        setSelectedGame(null);
                    }}
                />
            )}
            
            {/* Main Modal - Hide when showing game analysis */}
            {!(accountModalPage === "history" && showingGameAnalysis) && (
                <Modal
                    styles={{
                        modal: {
                            padding: 0,
                            margin: 0,
                            maxWidth: 'none',
                            width: '100vw',
                            height: '100vh',
                            background: 'transparent',
                            borderRadius: 0
                        },
                        modalContainer: {
                            height: 'auto',
                        }
                    }}
                    classNames={{ modal: "account-modal", modalContainer: "account-modal-p-container" }}
                    open={shown}
                    center
                    onClose={() => setAccountModalOpen(false)}
                    showCloseIcon={false}
                    animationDuration={200}
                >
                    <div className="account-modal-container">
                        {/* Background with overlay */}
                        <div className="account-modal-background"></div>

                        {/* Main content */}
                        <div className="account-modal-content">
                            {/* Header with prominent close button */}
                            <div className="account-modal-header">
                                <h1 className="account-modal-title">{accountData?.username || text("account")} {accountData?.supporter && <span style={badgeStyle}>{text("supporter")}</span>}</h1>


                                <button
                                    className="account-modal-close"
                                    onClick={() => setAccountModalOpen(false)}
                                    aria-label="Close"
                                >
                                    <span className="close-icon">✕</span>
                                </button>
                            </div>

                            {/* Navigation */}
                            <div className="account-modal-nav-container">
                                <nav className="account-modal-nav">
                                    {navigationItems.map((item) => (
                                        <button
                                            key={item.key}
                                            className={`account-nav-item ${accountModalPage === item.key ? 'active' : ''}`}
                                            onClick={() => setAccountModalPage(item.key)}
                                        >
                                            <span className="nav-icon">{item.icon}</span>
                                            <span className="nav-label">{item.label}</span>
                                        </button>
                                    ))}
                                </nav>
                            </div>

                            {/* Content Area */}
                            <div className="account-modal-body">
                                {renderContent()}
                            </div>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    )
}