import { Modal } from "react-responsive-modal";
import { useEffect, useRef, useState } from "react";
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
import { navigate } from '@/lib/basePath';
import useStampShop from '@/components/shop/useStampShop';
import StampsWallet from '@/components/shop/StampsWallet';
import { nameGlowProps } from './utils/usernameWithFlag';

export default function AccountModal({ session, setSession, shown, setAccountModalOpen, eloData, inCrazyGames, friendModal, accountModalPage, setAccountModalPage, ws, sendInvite, canSendInvite, options, onOpenShop }) {
    const { t: text, lang } = useTranslation("common");
    // Stamps WALLET only. The storefront moved out of this modal entirely — it
    // is its own surface now (components/shop/ShopModal.js), opened from the
    // Stamps button beside the league button on the home screen. What stays
    // here is the balance chip in the header, because "how many Stamps do I
    // have" is account state and this is the account screen.
    //
    // FAIL CLOSED: shop.enabled is `session.token.stampsEnabled === true`
    // (server-delivered, see api/stampShop.js entitlementFields). Until the env
    // flag is flipped in prod this is falsy for everybody and the chip does not
    // render at all.
    const shop = useStampShop({ session, setSession });
    // Read the equipped glow off the SHOP's entitlement block, not off
    // accountData. Same reason the wallet chip does: `shop.cosmetics` is the
    // optimistically-patched copy, so equipping in the storefront repaints this
    // header on the click rather than after the round trip — and it is the
    // identical object every other equipped cosmetic on this screen resolves
    // from, so there is one source of truth instead of two that can disagree.
    // ownBox: the title already has its own element and its own truncation
    // (wg-name-clip below), so the glow adds motion and a shadow, nothing else.
    const titleGlow = nameGlowProps(shop.cosmetics?.equipped?.nameGlow, undefined, { ownBox: true });
    const [accountData, setAccountData] = useState({});
    const [friends, setFriends] = useState([]);
    const [sentRequests, setSentRequests] = useState([]);
    const [receivedRequests, setReceivedRequests] = useState([]);
    const [selectedGame, setSelectedGame] = useState(null);
    const [showingGameAnalysis, setShowingGameAnalysis] = useState(false);
    // Lazy initializer: defaulting to false made the touch-specific paddings
    // snap in one frame after the modal opened on phones/tablets. Safe to
    // read window here — AccountModal is dynamic({ ssr: false }) and only
    // mounts on user action, so no server render exists to mismatch.
    const [isTouchDevice, setIsTouchDevice] = useState(() =>
        typeof window !== 'undefined' && (
            (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
            || 'ontouchstart' in window
            || navigator.maxTouchPoints > 0
        )
    );
    const [copiedLink, setCopiedLink] = useState(false);
    const bodyRef = useRef(null);

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

    // Use session data for instant display, then fetch fresh data
    useEffect(() => {
        if (shown && session?.token) {
            // Immediately show session data (may be stale but instant)
            setAccountData({
                username: session.token.username,
                totalXp: session.token.totalXp || 0,
                createdAt: session.token.createdAt,
                gamesLen: session.token.gamesLen || 0,
                lastLogin: session.token.lastLogin,
                canChangeUsername: session.token.canChangeUsername,
                daysUntilNameChange: session.token.daysUntilNameChange || 0,
                recentChange: session.token.recentChange || false,
                countryCode: session.token.countryCode || null,
            });

            // Fetch fresh data to update stale values (totalXp, gamesLen, etc.)
            fetch(window.cConfig.apiUrl + '/api/publicAccount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: session.token.accountId }),
            })
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) setAccountData(data);
                })
                .catch(() => {}); // Keep session data on error
        } else if (!shown) {
            // Reset game analysis state when modal is closed
            setShowingGameAnalysis(false);
            setSelectedGame(null);
        }
    }, [shown, session?.token?.accountId]);

    // Reset game analysis when switching away from history tab
    useEffect(() => {
        if (accountModalPage !== "history") {
            setShowingGameAnalysis(false);
            setSelectedGame(null);
        }
        // Snap the scroll container back to the top on tab switch — otherwise a
        // freshly selected tab inherits the previous tab's scrolled-down offset,
        // which feels broken.
        if (bodyRef.current) bodyRef.current.scrollTop = 0;
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
                            setAccountData={setAccountData}
                            eloData={eloData}
                            session={session}
                            setSession={setSession}
                            ws={ws}
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
                                    {/* The truncation that used to sit on .account-modal-title (where a
                                        flex container made it inert) lives here, on the real text box,
                                        and it is the shared wg-name-clip recipe so it carries the halo's
                                        clip relief with it — unconditionally, so equipping a glow does
                                        not change the box. Dark modal chrome → the dark variant. */}
                                    <span
                                        className={`wg-name-clip ${titleGlow?.className ?? ''}`.trim()}
                                        style={titleGlow?.style}
                                    >
                                        {accountData?.username || text("account")}
                                    </span>
                                    {accountData?.countryCode && <CountryFlag countryCode={accountData.countryCode} style={{ fontSize: '0.8em' }} />}
                                    {accountData?.username && (
                                        <button
                                            onClick={() => {
                                                const profileUrl = `${window.location.origin}${navigate('/user')}?u=${encodeURIComponent(accountData.username)}`;
                                                const showCopied = () => {
                                                    setCopiedLink(true);
                                                    setTimeout(() => setCopiedLink(false), 2000);
                                                };
                                                const fallbackCopy = () => {
                                                    try {
                                                        const ta = document.createElement('textarea');
                                                        ta.value = profileUrl;
                                                        ta.setAttribute('readonly', '');
                                                        ta.style.position = 'fixed';
                                                        ta.style.top = '0';
                                                        ta.style.left = '0';
                                                        ta.style.opacity = '0';
                                                        document.body.appendChild(ta);
                                                        ta.focus();
                                                        ta.select();
                                                        const ok = document.execCommand('copy');
                                                        document.body.removeChild(ta);
                                                        if (ok) showCopied();
                                                        else window.prompt(text("copyProfileLink") || "Copy profile link", profileUrl);
                                                    } catch (e) {
                                                        window.prompt(text("copyProfileLink") || "Copy profile link", profileUrl);
                                                    }
                                                };
                                                if (navigator.clipboard && window.isSecureContext) {
                                                    navigator.clipboard.writeText(profileUrl).then(showCopied).catch(fallbackCopy);
                                                } else {
                                                    fallbackCopy();
                                                }
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
                                </h1>

                                {/* Wallet sits beside the close button, not in
                                    the body: account state belongs in the header
                                    of the account screen, and the header is the
                                    one part of this modal that is on screen no
                                    matter which tab is open. Grouped with the
                                    close button so .account-modal-header's
                                    space-between still puts the title left and
                                    this cluster right (see styles/shop.css).

                                    THE CHIP OPENS THE STOREFRONT (user ruling
                                    Aug 9), reversing the note that used to sit
                                    here arguing it should not: pressing a
                                    balance and getting a paragraph instead of
                                    the place that spends it is a dead end, and
                                    "the home screen has a Stamps button" is no
                                    answer to someone already standing on their
                                    balance. home.js closes this modal as it
                                    opens the shop — the two never stack. */}
                                <div className="shop-header-actions">
                                    {shop.enabled && (
                                        <StampsWallet
                                            stamps={shop.stamps}
                                            adFreeMsLeft={shop.adFreeMsLeft}
                                            text={text}
                                            lang={lang}
                                            onOpenShop={onOpenShop}
                                        />
                                    )}

                                    <button
                                        className="account-modal-close"
                                        onClick={() => setAccountModalOpen(false)}
                                        aria-label="Close"
                                    >
                                        <span className="close-icon">✕</span>
                                    </button>
                                </div>
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
                            <div ref={bodyRef} className="account-modal-body" style={{
                                height: '100%',
                                overflowY: 'auto',
                                overflowX: 'hidden',
                                WebkitOverflowScrolling: 'touch',
                                touchAction: 'pan-y pinch-zoom',
                                overscrollBehavior: 'contain',
                                scrollbarGutter: 'stable',
                                flex: '1 1 auto',
                                minHeight: 0,
                                minWidth: 0,
                                boxSizing: 'border-box'
                                // Removed: transform, willChange - these cause flickering with backdrop-filter
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