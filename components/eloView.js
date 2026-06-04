import { useTranslation } from '@/components/useTranslations'
import { getLeague, leagues } from "./utils/leagues";
import { useState } from "react";
import XPGraph from "./XPGraph";
import LeagueIcon from "./utils/leagueIcon";

export default function EloView({ eloData, session, isPublic = false, username = null, viewingPublicProfile = false }) {
    const { t: text } = useTranslation("common");
    const userLeague = getLeague(eloData.elo);
    const [hoveredLeague, setHoveredLeague] = useState(null);

    const userLabelStyle = userLeague.gradient
        ? { background: userLeague.gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }
        : { color: userLeague.color };

    const span = userLeague.next ? userLeague.next.min - userLeague.min : 0;
    const subrankPct = span > 0 ? Math.max(0, Math.min(100, ((eloData.elo - userLeague.min) / span) * 100)) : 100;
    const eloToNext = userLeague.next ? Math.max(0, userLeague.next.min - eloData.elo) : 0;

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
        fontSize: 'clamp(24px, 6vw, 48px)',
        fontWeight: 600,
        marginBottom: 'clamp(10px, 3vw, 20px)',
        color: 'white',
        textAlign: 'center',
        textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
    };

    const descriptionStyle = {
        fontSize: 'clamp(14px, 3vw, 18px)',
        color: '#b0b0b0',
        marginBottom: '10px',
        textAlign: 'center',
        lineHeight: '1.5'
    };

    const statsGridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 'clamp(10px, 3vw, 20px)',
        marginTop: 'clamp(10px, 3vw, 20px)'
    };

    const statItemStyle = {
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 'clamp(8px, 2vw, 15px)',
        padding: 'clamp(12px, 3vw, 20px)',
        textAlign: 'center',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        transition: 'all 0.3s ease'
    };

    const statLabelStyle = {
        fontSize: 'clamp(12px, 2.5vw, 16px)',
        color: '#b0b0b0',
        marginBottom: 'clamp(4px, 1.5vw, 8px)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        fontWeight: '500'
    };

    const statValueStyle = {
        fontSize: 'clamp(18px, 4vw, 28px)',
        color: '#ffd700',
        fontWeight: 'bold',
        textShadow: '0 0 10px rgba(255, 215, 0, 0.3)'
    };

    const leagueContainerStyle = {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 'clamp(8px, 2vw, 15px)',
        flexWrap: 'wrap',
        marginTop: 'clamp(15px, 4vw, 30px)',
        padding: 'clamp(10px, 3vw, 20px)',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 'clamp(10px, 3vw, 20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)'
    };

    return (
        <div style={containerStyle}>
            {/* ELO Header */}
            {/* <div style={cardStyle}>
                <h1 style={titleStyle}>{text("ELO")}</h1>

                <p style={descriptionStyle}>
                    {text("leagueModalDesc")}
                </p>

                 <p style={descriptionStyle}>
                    {text("leagueModalDesc2")}
                </p>
            </div> */}

            {/* League System */}
            <div style={cardStyle}>
                <h2 style={{
                    fontSize: 'clamp(20px, 4vw, 32px)',
                    fontWeight: 600,
                    marginBottom: 'clamp(10px, 3vw, 20px)',
                    color: 'white',
                    textAlign: 'center'
                }}>
                    {text("leagues")}
                </h2>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'clamp(12px, 3vw, 20px)',
                    flexWrap: 'wrap',
                    marginBottom: 'clamp(10px, 3vw, 18px)'
                }}>
                    <LeagueIcon league={userLeague} size={54} />
                    <div style={{ textAlign: 'left', minWidth: 0 }}>
                        <div style={{ ...userLabelStyle, fontSize: 'clamp(22px, 5vw, 34px)', fontWeight: 800, lineHeight: 1.1 }}>
                            {userLeague.label}
                        </div>
                        <div style={{ color: '#b0b0b0', fontSize: 'clamp(13px, 3vw, 16px)' }}>
                            {eloData.elo.toLocaleString()} {text("elo")}
                        </div>
                        {!viewingPublicProfile && userLeague.next && (
                            <div style={{ marginTop: '8px', width: 'min(260px, 60vw)' }}>
                                <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${subrankPct}%`, background: userLeague.gradient || userLeague.color, transition: 'width 0.6s ease' }} />
                                </div>
                                <div style={{ color: '#9aa0a6', fontSize: 'clamp(11px, 2.5vw, 13px)', marginTop: '4px' }}>
                                    {eloToNext.toLocaleString()} {text("elo")} → {userLeague.next.label}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div style={leagueContainerStyle}>
                    {Object.values(leagues).map((league) => {
                        const isCurrentLeague = userLeague.name === league.name;
                        const eloNeeded = league.min;

                        return (
                            <div
                                key={league.name}
                                style={{
                                    position: 'relative',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'transform 0.3s ease',
                                    transform: isCurrentLeague ? 'scale(1.15)' : 'scale(1)',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.2)';
                                    setHoveredLeague(league.name)
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = isCurrentLeague ? 'scale(1.15)' : 'scale(1)';
                                    setHoveredLeague(null)
                                }}
                            >
                                {/* League Square with Shine Effect */}
                                <div style={{
                                    width: 'clamp(50px, 10vw, 80px)',
                                    height: 'clamp(45px, 9vw, 70px)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                    color: 'black',
                                    borderRadius: 'clamp(8px, 2vw, 15px)',
                                    fontSize: 'clamp(25px, 6vw, 50px)',
                                    fontWeight: 'bold',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    boxShadow: isCurrentLeague ? `0 0 20px ${league.color}80` : '0 4px 15px rgba(0, 0, 0, 0.3)',
                                    border: isCurrentLeague ? `3px solid ${league.color}` : '2px solid rgba(255, 255, 255, 0.2)'
                                }}>
                                    <LeagueIcon league={league} size={38} showSubrank={false} />
                                    {/* Shiny Effect */}
                                    {isCurrentLeague && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '-100%',
                                            left: '-100%',
                                            width: '200%',
                                            height: '200%',
                                            background: 'linear-gradient(45deg, rgba(255,255,255,0.6), rgba(255,255,255,0))',
                                            transform: 'rotate(30deg)',
                                            animation: 'shine 2s infinite linear'
                                        }} />
                                    )}
                                </div>

                                {/* League Name */}
                                <p style={{
                                    fontSize: 'clamp(12px, 3vw, 16px)',
                                    marginTop: 'clamp(6px, 1.5vw, 8px)',
                                    color: isCurrentLeague ? league.color : '#e0e0e0',
                                    fontWeight: isCurrentLeague ? 'bold' : '600',
                                    textShadow: isCurrentLeague ? `0px 0px 8px ${league.color}` : 'none'
                                }}>
                                    {isCurrentLeague ? userLeague.label : league.name}
                                </p>

                                {/* ELO Badge */}
                                {eloNeeded > 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 'clamp(-20px, -4vw, -16px)',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        backgroundColor: league.color,
                                        color: 'black',
                                        border: '2px solid black',
                                        padding: 'clamp(3px, 1vw, 4px) clamp(6px, 2vw, 8px)',
                                        borderRadius: 'clamp(8px, 2vw, 10px)',
                                        fontSize: 'clamp(10px, 2.5vw, 12px)',
                                        fontWeight: 'bold',
                                        opacity: hoveredLeague === league.name ? 1 : 0,
                                        transition: 'opacity 0.3s',
                                        whiteSpace: 'nowrap',
                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
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

            {/* Stats Section */}
            <div style={cardStyle}>
                <h2 style={{
                    fontSize: 'clamp(20px, 4vw, 32px)',
                    fontWeight: 600,
                    marginBottom: 'clamp(10px, 3vw, 20px)',
                    color: 'white',
                    textAlign: 'center'
                }}>
                    {text("statistics")}
                </h2>

                <div style={statsGridStyle}>
                    <div style={statItemStyle}
                         onMouseEnter={(e) => {
                             e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                             e.currentTarget.style.transform = 'translateY(-5px)';
                         }}
                         onMouseLeave={(e) => {
                             e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                             e.currentTarget.style.transform = 'translateY(0)';
                         }}>
                        <div style={statLabelStyle}>{viewingPublicProfile ? text("elo") : text("yourElo")}</div>
                        <div style={statValueStyle}>{eloData.elo}</div>
                    </div>

                    <div style={statItemStyle}
                         onMouseEnter={(e) => {
                             e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                             e.currentTarget.style.transform = 'translateY(-5px)';
                         }}
                         onMouseLeave={(e) => {
                             e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                             e.currentTarget.style.transform = 'translateY(0)';
                         }}>
                        <div style={statLabelStyle}>{viewingPublicProfile ? text("globalRank") : text("yourGlobalRank")}</div>
                        <div style={statValueStyle}>#{eloData.rank}</div>
                    </div>

                    <div style={statItemStyle}
                         onMouseEnter={(e) => {
                             e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                             e.currentTarget.style.transform = 'translateY(-5px)';
                         }}
                         onMouseLeave={(e) => {
                             e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                             e.currentTarget.style.transform = 'translateY(0)';
                         }}>
                        <div style={statLabelStyle}>{text("duels_won")}</div>
                        <div style={statValueStyle}>{eloData.duels_wins}</div>
                    </div>

                    <div style={statItemStyle}
                         onMouseEnter={(e) => {
                             e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                             e.currentTarget.style.transform = 'translateY(-5px)';
                         }}
                         onMouseLeave={(e) => {
                             e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                             e.currentTarget.style.transform = 'translateY(0)';
                         }}>
                        <div style={statLabelStyle}>{text("duels_lost")}</div>
                        <div style={statValueStyle}>{eloData.duels_losses}</div>
                    </div>

                    {eloData.duels_tied > 0 && (
                    <div style={statItemStyle}
                         onMouseEnter={(e) => {
                             e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                             e.currentTarget.style.transform = 'translateY(-5px)';
                         }}
                         onMouseLeave={(e) => {
                             e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                             e.currentTarget.style.transform = 'translateY(0)';
                         }}>
                        <div style={statLabelStyle}>{text("duels_tied")}</div>
                        <div style={statValueStyle}>{eloData.duels_tied}</div>
                    </div>
                    )}

                    {eloData.win_rate ? (
                        <div style={statItemStyle}
                             onMouseEnter={(e) => {
                                 e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                 e.currentTarget.style.transform = 'translateY(-5px)';
                             }}
                             onMouseLeave={(e) => {
                                 e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                 e.currentTarget.style.transform = 'translateY(0)';
                             }}>
                            <div style={statLabelStyle}>{text("win_rate")}</div>
                            <div style={statValueStyle}>{(eloData.win_rate * 100).toFixed(2)}%</div>
                        </div>
                    ) :  null}
                </div>
            </div>

            {/* ELO Graph */}
            <XPGraph session={session} mode="elo" isPublic={isPublic} username={username} />
        </div>
    );
}