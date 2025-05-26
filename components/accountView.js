import msToTime from "./msToTime";
import { useTranslation } from '@/components/useTranslations'
import { getLeague, leagues } from "./utils/leagues";
import { useEffect, useState } from "react";

export default function AccountView({ accountData, supporter, eloData, session }) {
    const { t: text } = useTranslation("common");
    const changeName = async () => {
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
        const response = await fetch(window.cConfig.apiUrl + '/api/setName', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, token: secret })
        });

        if (response.ok) {
            window.settingName = false;
            sendEvent("name_change");
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
    const userLeague = getLeague(eloData.elo);

    const [hoveredLeague, setHoveredLeague] = useState(null);

    return (
        <>
            <div className="profile-view-container">
                <span className="profile-title">
                    <i className="fas fa-user profile-icon"></i>
                    {accountData.username}
                    {supporter && <span className="badge" style={{ marginLeft: '10px', color: 'black', fontSize: '0.8rem' }}>{text("supporter")}</span>}
                </span>
                <p className="profile-text">
                    <i className="fas fa-clock profile-icon"></i>
                    {text("joined", { t: msToTime(Date.now() - new Date(accountData.createdAt).getTime()) })}
                </p>
                <p className="profile-text">
                    <i className="fas fa-star profile-icon"></i>
                    {accountData.totalXp} XP
                </p>
                <p className="profile-text">
                    <i className="fas fa-gamepad profile-icon"></i>
                    {text("gamesPlayed", { games: accountData.gamesLen })}
                </p>

                {accountData.canChangeUsername ? (
                    <button className="profile-button" onClick={changeName}>
                        {text("changeName")}
                    </button>
                ) : accountData.recentChange ? (
                    <p className="profile-text">
                        <i className="fas fa-exclamation-triangle profile-icon"></i>
                        {text("recentChange")}
                    </p>
                ) : null}

                {accountData.daysUntilNameChange > 0 && (
                    <p className="profile-text">
                        <i className="fas fa-exclamation-triangle profile-icon"></i>
                        {text("nameChangeCooldown", { days: accountData.daysUntilNameChange })}
                    </p>
                )}
            </div>

            <div className="g2_nav_hr"></div>

            <div className="league-stats-container">
                <div className="leagues-display-section">
                    <h1>{text("ELO")}</h1>
                    <p className="font-size-md">
                        {text("leagueModalDesc")}
                    </p>
                    <p className="font-size-md">
                        {text("leagueModalDesc2")}
                    </p>

                    <div className="league-container">
                        {Object.values(leagues).map((league) => {
                            const isCurrentLeague = userLeague.name === league.name;
                            const nextLeague = Object.values(leagues).find(l => l.min === league.min);
                            const eloNeeded = nextLeague ? nextLeague.min : 0;

                            return (
                                <div
                                    key={league.name}
                                    style={{ // Keeping interaction styles inline for now, can be moved to CSS if preferred
                                        position: 'relative',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        transition: 'transform 0.2s ease',
                                        transform: isCurrentLeague ? 'scale(1.1)' : 'scale(1)',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'scale(1.15)';
                                        setHoveredLeague(league.name)
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = isCurrentLeague ? 'scale(1.1)' : 'scale(1)';
                                        setHoveredLeague(null)
                                    }}
                                >
                                    <div style={{ // Dynamic background and potentially other league-specific styles remain
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: league.color,
                                        color: 'black',
                                        borderRadius: '10px',
                                        fontWeight: 'bold',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}>
                                        {league.emoji}
                                        {isCurrentLeague && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '-100%',
                                                left: '-100%',
                                                width: '200%',
                                                height: '200%',
                                                background: 'linear-gradient(45deg, rgba(255,255,255,0.5), rgba(255,255,255,0))',
                                                transform: 'rotate(30deg)',
                                                animation: 'shine 2s infinite linear'
                                            }} />
                                        )}
                                    </div>
                                    <p className="font-size-sm" style={{ // Dynamic text color based on current league
                                        marginTop: '5px',
                                        color: isCurrentLeague ? '#ffd700' : '#b0b0b0',
                                        fontWeight: isCurrentLeague ? 'bold' : 'normal',
                                        textShadow: isCurrentLeague ? '0px 0px 5px #ffd700' : 'none'
                                    }}>
                                        {league.name}
                                    </p>
                                    {eloNeeded > 0 && (
                                        <div style={{ // Badge style, could be a class if static elements are consistent
                                            position: 'absolute',
                                            top: '-15px',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            backgroundColor: league.color,
                                            color: 'black',
                                            border: '2px solid black',
                                            padding: '3px 6px',
                                            borderRadius: '8px',
                                            fontSize: '10px', // Consider clamp for this too
                                            fontWeight: 'bold',
                                            opacity: hoveredLeague === league.name ? 1 : 0,
                                            transition: 'opacity 0.2s',
                                            whiteSpace: 'nowrap'
                                        }}
                                            className="elo-badge">
                                            {eloNeeded} ELO
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="elo-details-section">
                    <p className="profile-text">
                        {text("yourElo")}: <span style={{ color: '#ffd700' }}>{eloData.elo}</span>
                    </p>
                    <p className="profile-text">
                        {text("yourGlobalRank")}: <span style={{ color: '#ffd700' }}>#{eloData.rank}</span>
                    </p>
                    <p className="profile-text">
                        {text("duels_won")}: <span style={{ color: '#ffd700' }}>{eloData.duels_wins}</span>
                    </p>
                    <p className="profile-text">
                        {text("duels_lost")}: <span style={{ color: '#ffd700' }}>{eloData.duels_losses}</span>
                    </p>
                    <p className="profile-text">
                        {text("duels_tied")}: <span style={{ color: '#ffd700' }}>{eloData.duels_tied}</span>
                    </p>
                    {eloData.win_rate && (
                        <p className="profile-text">
                            {text("win_rate")}: <span style={{ color: '#ffd700' }}>{(eloData.win_rate * 100).toFixed(2)}%</span>
                        </p>
                    )}
                </div>
            </div>

            <div className="g2_nav_hr"></div>
        </>
    );
}
