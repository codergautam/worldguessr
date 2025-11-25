import { useEffect, useState } from 'react';
import { useTranslation } from '@/components/useTranslations';

export default function ModerationView({ session }) {
    const { t: text } = useTranslation("common");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);

    // Check if user is currently suspended
    const isBanned = session?.token?.banned;
    const banType = session?.token?.banType;
    const banExpiresAt = session?.token?.banExpiresAt;
    const banPublicNote = session?.token?.banPublicNote;
    const pendingNameChange = session?.token?.pendingNameChange;
    const pendingNameChangePublicNote = session?.token?.pendingNameChangePublicNote;

    // Default to history tab if user is suspended so they see the reason
    const [activeSection, setActiveSection] = useState(isBanned || pendingNameChange ? 'history' : 'refunds');

    useEffect(() => {
        const fetchData = async () => {
            if (!session?.token?.secret) return;

            try {
                setLoading(true);
                const response = await fetch(window.cConfig.apiUrl + '/api/userModerationData', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ secret: session.token.secret })
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch moderation data');
                }

                const result = await response.json();
                setData(result);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [session?.token?.secret]);

    // Calculate time remaining for temp ban
    const getTimeRemaining = (expiresAt) => {
        if (!expiresAt) return null;
        const now = new Date();
        const expires = new Date(expiresAt);
        const diff = expires - now;

        if (diff <= 0) return 'Expired';

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) return `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}`;
        if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''}`;
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    };

    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(15px, 4vw, 30px)',
        color: '#fff',
        fontFamily: 'Arial, sans-serif',
    };

    const cardStyle = {
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 'clamp(10px, 3vw, 20px)',
        padding: 'clamp(15px, 4vw, 30px)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    };

    const titleStyle = {
        fontSize: 'clamp(20px, 4vw, 32px)',
        fontWeight: 600,
        marginBottom: 'clamp(10px, 3vw, 20px)',
        color: 'white',
        textAlign: 'center'
    };

    const tabContainerStyle = {
        display: 'flex',
        justifyContent: 'center',
        gap: 'clamp(8px, 2vw, 15px)',
        marginBottom: 'clamp(15px, 4vw, 25px)',
        flexWrap: 'wrap'
    };

    const tabStyle = (isActive) => ({
        padding: 'clamp(8px, 2vw, 12px) clamp(16px, 4vw, 24px)',
        borderRadius: 'clamp(8px, 2vw, 12px)',
        background: isActive ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)',
        border: isActive ? '2px solid #ffd700' : '1px solid rgba(255, 255, 255, 0.1)',
        color: isActive ? '#ffd700' : '#b0b0b0',
        cursor: 'pointer',
        fontWeight: isActive ? 'bold' : 'normal',
        fontSize: 'clamp(12px, 3vw, 16px)',
        transition: 'all 0.3s ease'
    });

    const itemStyle = {
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 'clamp(8px, 2vw, 12px)',
        padding: 'clamp(12px, 3vw, 18px)',
        marginBottom: 'clamp(8px, 2vw, 12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
    };

    const emptyStyle = {
        textAlign: 'center',
        color: '#888',
        padding: 'clamp(20px, 5vw, 40px)',
        fontSize: 'clamp(14px, 3vw, 16px)'
    };

    const statsGridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 'clamp(10px, 3vw, 15px)',
        marginBottom: 'clamp(15px, 4vw, 25px)'
    };

    const statItemStyle = {
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 'clamp(8px, 2vw, 12px)',
        padding: 'clamp(10px, 2.5vw, 15px)',
        textAlign: 'center',
        border: '1px solid rgba(255, 255, 255, 0.1)',
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'open': return '#ffd700';
            case 'action_taken': return '#4caf50';
            case 'ignored': return '#888';
            default: return '#b0b0b0';
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'open': return 'Under Review';
            case 'action_taken': return 'Action Taken';
            case 'ignored': return 'No Action Needed';
            default: return status;
        }
    };

    const getReasonText = (reason) => {
        switch (reason) {
            case 'inappropriate_username': return 'Inappropriate Username';
            case 'cheating': return 'Cheating';
            case 'other': return 'Other';
            default: return reason;
        }
    };

    if (loading) {
        return (
            <div style={containerStyle}>
                <div style={cardStyle}>
                    <div style={{ textAlign: 'center', padding: '40px', color: '#b0b0b0' }}>
                        Loading moderation data...
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={containerStyle}>
                <div style={cardStyle}>
                    <div style={{ textAlign: 'center', padding: '40px', color: '#f44336' }}>
                        Error: {error}
                    </div>
                </div>
            </div>
        );
    }

    // Suspension banner styles
    const suspensionBannerStyle = {
        background: 'linear-gradient(135deg, rgba(244, 67, 54, 0.2) 0%, rgba(183, 28, 28, 0.3) 100%)',
        border: '2px solid #f44336',
        borderRadius: 'clamp(10px, 3vw, 20px)',
        padding: 'clamp(20px, 5vw, 35px)',
        marginBottom: 'clamp(15px, 4vw, 25px)',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(244, 67, 54, 0.3)',
    };

    const nameChangeBannerStyle = {
        background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.2) 0%, rgba(230, 81, 0, 0.3) 100%)',
        border: '2px solid #ff9800',
        borderRadius: 'clamp(10px, 3vw, 20px)',
        padding: 'clamp(20px, 5vw, 35px)',
        marginBottom: 'clamp(15px, 4vw, 25px)',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(255, 152, 0, 0.3)',
    };

    return (
        <div style={containerStyle}>
            {/* Suspension Banner - Show prominently if user is banned */}
            {isBanned && !pendingNameChange && (
                <div style={suspensionBannerStyle}>
                    <div style={{ fontSize: 'clamp(36px, 8vw, 56px)', marginBottom: '15px' }}>
                        🚫
                    </div>
                    <h2 style={{
                        fontSize: 'clamp(22px, 5vw, 32px)',
                        color: '#f44336',
                        fontWeight: 'bold',
                        marginBottom: '15px',
                        textTransform: 'uppercase',
                        letterSpacing: '2px'
                    }}>
                        {banType === 'temporary' ? 'Account Temporarily Suspended' : 'Account Suspended'}
                    </h2>

                    {banType === 'temporary' && banExpiresAt && (
                        <div style={{
                            background: 'rgba(0,0,0,0.3)',
                            padding: '15px 25px',
                            borderRadius: '12px',
                            display: 'inline-block',
                            marginBottom: '15px'
                        }}>
                            <div style={{ color: '#b0b0b0', fontSize: 'clamp(12px, 2.5vw, 14px)', marginBottom: '5px' }}>
                                TIME REMAINING
                            </div>
                            <div style={{ color: '#ffd700', fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 'bold' }}>
                                {getTimeRemaining(banExpiresAt)}
                            </div>
                            <div style={{ color: '#888', fontSize: 'clamp(11px, 2.5vw, 13px)', marginTop: '5px' }}>
                                Expires: {new Date(banExpiresAt).toLocaleString()}
                            </div>
                        </div>
                    )}

                    {banPublicNote && (
                        <div style={{
                            marginTop: '15px',
                            padding: '15px 20px',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '10px',
                            maxWidth: '500px',
                            margin: '15px auto 0'
                        }}>
                            <div style={{ color: '#b0b0b0', fontSize: 'clamp(11px, 2.5vw, 13px)', marginBottom: '8px' }}>
                                REASON
                            </div>
                            <div style={{ color: '#e0e0e0', fontSize: 'clamp(14px, 3vw, 16px)', lineHeight: '1.5' }}>
                                {banPublicNote}
                            </div>
                        </div>
                    )}

                    <p style={{
                        color: '#b0b0b0',
                        fontSize: 'clamp(12px, 2.5vw, 14px)',
                        marginTop: '20px',
                        maxWidth: '450px',
                        margin: '20px auto 0',
                        lineHeight: '1.6'
                    }}>
                        {banType === 'temporary'
                            ? 'Your account access is temporarily restricted. You cannot participate in multiplayer games until the suspension expires.'
                            : 'Your account has been permanently suspended due to violations of our community guidelines. You cannot participate in multiplayer games.'}
                    </p>
                </div>
            )}

            {/* Name Change Required Banner */}
            {pendingNameChange && (
                <div style={nameChangeBannerStyle}>
                    <div style={{ fontSize: 'clamp(36px, 8vw, 56px)', marginBottom: '15px' }}>
                        ✏️
                    </div>
                    <h2 style={{
                        fontSize: 'clamp(22px, 5vw, 32px)',
                        color: '#ff9800',
                        fontWeight: 'bold',
                        marginBottom: '15px'
                    }}>
                        Username Change Required
                    </h2>

                    {pendingNameChangePublicNote && (
                        <div style={{
                            marginBottom: '20px',
                            padding: '15px 20px',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '10px',
                            maxWidth: '500px',
                            margin: '0 auto 20px'
                        }}>
                            <div style={{ color: '#b0b0b0', fontSize: 'clamp(11px, 2.5vw, 13px)', marginBottom: '8px' }}>
                                REASON
                            </div>
                            <div style={{ color: '#e0e0e0', fontSize: 'clamp(14px, 3vw, 16px)', lineHeight: '1.5' }}>
                                {pendingNameChangePublicNote}
                            </div>
                        </div>
                    )}

                    <p style={{
                        color: '#e0e0e0',
                        fontSize: 'clamp(14px, 3vw, 16px)',
                        maxWidth: '450px',
                        margin: '0 auto 15px',
                        lineHeight: '1.6'
                    }}>
                        Your username has been flagged as inappropriate. You must change your username before you can continue playing multiplayer games.
                    </p>

                    <p style={{
                        color: '#888',
                        fontSize: 'clamp(12px, 2.5vw, 14px)'
                    }}>
                        Go to your Profile tab to change your username.
                    </p>
                </div>
            )}

            {/* Header Card with Stats */}
            <div style={cardStyle}>
                <h2 style={titleStyle}>⚖️ Moderation</h2>

                <div style={statsGridStyle}>
                    <div style={statItemStyle}>
                        <div style={{ fontSize: 'clamp(10px, 2.5vw, 12px)', color: '#b0b0b0', marginBottom: '4px' }}>
                            ELO REFUNDED
                        </div>
                        <div style={{ fontSize: 'clamp(18px, 4vw, 24px)', color: '#4caf50', fontWeight: 'bold' }}>
                            +{data?.totalEloRefunded || 0}
                        </div>
                    </div>
                    <div style={statItemStyle}>
                        <div style={{ fontSize: 'clamp(10px, 2.5vw, 12px)', color: '#b0b0b0', marginBottom: '4px' }}>
                            REPORTS FILED
                        </div>
                        <div style={{ fontSize: 'clamp(18px, 4vw, 24px)', color: '#ffd700', fontWeight: 'bold' }}>
                            {data?.reportStats?.total || 0}
                        </div>
                    </div>
                    <div style={statItemStyle}>
                        <div style={{ fontSize: 'clamp(10px, 2.5vw, 12px)', color: '#b0b0b0', marginBottom: '4px' }}>
                            EFFECTIVE REPORTS
                        </div>
                        <div style={{ fontSize: 'clamp(18px, 4vw, 24px)', color: '#4caf50', fontWeight: 'bold' }}>
                            {data?.reportStats?.actionTaken || 0}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={tabContainerStyle}>
                    <button
                        style={tabStyle(activeSection === 'refunds')}
                        onClick={() => setActiveSection('refunds')}
                    >
                        💰 ELO Refunds ({data?.eloRefunds?.length || 0})
                    </button>
                    <button
                        style={tabStyle(activeSection === 'history')}
                        onClick={() => setActiveSection('history')}
                    >
                        📋 Account History ({data?.moderationHistory?.length || 0})
                    </button>
                    <button
                        style={tabStyle(activeSection === 'reports')}
                        onClick={() => setActiveSection('reports')}
                    >
                        🚩 My Reports ({data?.submittedReports?.length || 0})
                    </button>
                </div>
            </div>

            {/* Content Card */}
            <div style={cardStyle}>
                {/* ELO Refunds Section */}
                {activeSection === 'refunds' && (
                    <>
                        <h3 style={{ ...titleStyle, fontSize: 'clamp(16px, 3.5vw, 24px)' }}>
                            ELO Refunds from Banned Players
                        </h3>
                        <p style={{ color: '#888', textAlign: 'center', marginBottom: '20px', fontSize: 'clamp(12px, 2.5vw, 14px)' }}>
                            When a cheater is banned, ELO lost against them is automatically refunded.
                        </p>

                        {data?.eloRefunds?.length > 0 ? (
                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                {data.eloRefunds.map((refund) => (
                                    <div key={refund.id} style={itemStyle}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                            <div>
                                                <span style={{ color: '#4caf50', fontWeight: 'bold', fontSize: 'clamp(16px, 3.5vw, 20px)' }}>
                                                    +{refund.amount} ELO
                                                </span>
                                                <span style={{ color: '#888', marginLeft: '10px', fontSize: 'clamp(12px, 2.5vw, 14px)' }}>
                                                    from banned player: <span style={{ color: '#f44336' }}>{refund.bannedUsername}</span>
                                                </span>
                                            </div>
                                            <div style={{ color: '#888', fontSize: 'clamp(11px, 2.5vw, 13px)' }}>
                                                {formatDate(refund.date)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={emptyStyle}>
                                No ELO refunds yet. You'll see refunds here if you ever lose ELO to a player who later gets banned for cheating.
                            </div>
                        )}
                    </>
                )}

                {/* Moderation History Section */}
                {activeSection === 'history' && (
                    <>
                        <h3 style={{ ...titleStyle, fontSize: 'clamp(16px, 3.5vw, 24px)' }}>
                            Account Moderation History
                        </h3>

                        {data?.moderationHistory?.length > 0 ? (
                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                {data.moderationHistory.map((item) => (
                                    <div key={item.id} style={itemStyle}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{
                                                    fontWeight: 'bold',
                                                    fontSize: 'clamp(14px, 3vw, 16px)',
                                                    color: item.actionType.includes('ban') && item.actionType !== 'unban' ? '#f44336' :
                                                           item.actionType === 'unban' ? '#4caf50' : '#ffd700'
                                                }}>
                                                    {item.actionDescription}
                                                </div>
                                                {item.publicNote && (
                                                    <div style={{ color: '#b0b0b0', marginTop: '8px', fontSize: 'clamp(12px, 2.5vw, 14px)' }}>
                                                        {item.publicNote}
                                                    </div>
                                                )}
                                                {item.expiresAt && new Date(item.expiresAt) > new Date() && (
                                                    <div style={{ color: '#ffd700', marginTop: '8px', fontSize: 'clamp(11px, 2.5vw, 13px)' }}>
                                                        Expires: {formatDate(item.expiresAt)} ({item.durationString})
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ color: '#888', fontSize: 'clamp(11px, 2.5vw, 13px)' }}>
                                                {formatDate(item.date)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={emptyStyle}>
                                ✅ No moderation actions on your account. Keep playing fair!
                            </div>
                        )}
                    </>
                )}

                {/* Submitted Reports Section */}
                {activeSection === 'reports' && (
                    <>
                        <h3 style={{ ...titleStyle, fontSize: 'clamp(16px, 3.5vw, 24px)' }}>
                            Reports You've Submitted
                        </h3>
                        <p style={{ color: '#888', textAlign: 'center', marginBottom: '20px', fontSize: 'clamp(12px, 2.5vw, 14px)' }}>
                            Track the status of your reports. For privacy, specific actions taken are not disclosed.
                        </p>

                        {data?.submittedReports?.length > 0 ? (
                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                {data.submittedReports.map((report) => (
                                    <div key={report.id} style={itemStyle}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                            <div>
                                                <span style={{ color: '#e0e0e0', fontWeight: 'bold', fontSize: 'clamp(14px, 3vw, 16px)' }}>
                                                    {report.reportedUsername}
                                                </span>
                                                <span style={{
                                                    marginLeft: '10px',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    background: 'rgba(255,255,255,0.1)',
                                                    fontSize: 'clamp(10px, 2.5vw, 12px)',
                                                    color: '#888'
                                                }}>
                                                    {getReasonText(report.reason)}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                <span style={{
                                                    color: getStatusColor(report.status),
                                                    fontWeight: 'bold',
                                                    fontSize: 'clamp(11px, 2.5vw, 13px)'
                                                }}>
                                                    {getStatusText(report.status)}
                                                </span>
                                                <span style={{ color: '#888', fontSize: 'clamp(11px, 2.5vw, 13px)' }}>
                                                    {formatDate(report.date)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={emptyStyle}>
                                You haven't submitted any reports yet. If you encounter cheaters or inappropriate usernames, you can report them after a multiplayer game.
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

