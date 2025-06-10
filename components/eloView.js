import { useTranslation } from '@/components/useTranslations'
import { getLeague, leagues } from "./utils/leagues";
import { useState } from "react";

export default function EloView({ eloData }) {
    const { t: text } = useTranslation("common");
    const userLeague = getLeague(eloData.elo);
    const [hoveredLeague, setHoveredLeague] = useState(null);

    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: '30px',
        color: '#fff',
        fontFamily: 'Arial, sans-serif',
    };

    const cardStyle = {
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '20px',
        padding: '30px',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    };

    const titleStyle = {
        fontSize: '48px',
        fontWeight: 600,
        marginBottom: '20px',
        color: 'white',
        textAlign: 'center',
        textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
    };

    const descriptionStyle = {
        fontSize: '18px',
        color: '#b0b0b0',
        marginBottom: '10px',
        textAlign: 'center',
        lineHeight: '1.5'
    };

    const statsGridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginTop: '20px'
    };

    const statItemStyle = {
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '15px',
        padding: '20px',
        textAlign: 'center',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        transition: 'all 0.3s ease'
    };

    const statLabelStyle = {
        fontSize: '16px',
        color: '#b0b0b0',
        marginBottom: '8px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        fontWeight: '500'
    };

    const statValueStyle = {
        fontSize: '28px',
        color: '#ffd700',
        fontWeight: 'bold',
        textShadow: '0 0 10px rgba(255, 215, 0, 0.3)'
    };

    const leagueContainerStyle = {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '15px',
        flexWrap: 'wrap',
        marginTop: '30px',
        padding: '20px',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
    };

    return (
        <div style={containerStyle}>
            {/* ELO Header */}
            <div style={cardStyle}>
                <h1 style={titleStyle}>{text("ELO")}</h1>

                <p style={descriptionStyle}>
                    {text("leagueModalDesc")}
                </p>

                {/* <p style={descriptionStyle}>
                    {text("leagueModalDesc2")}
                </p> */}
            </div>

            {/* League System */}
            <div style={cardStyle}>
                <h2 style={{
                    fontSize: '32px',
                    fontWeight: 600,
                    marginBottom: '20px',
                    color: 'white',
                    textAlign: 'center'
                }}>
                    {text("leagues")}
                </h2>

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
                                    width: '80px',
                                    height: '70px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: league.color,
                                    color: 'black',
                                    borderRadius: '15px',
                                    fontSize: '50px',
                                    fontWeight: 'bold',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    boxShadow: isCurrentLeague ? '0 0 20px rgba(255, 215, 0, 0.5)' : '0 4px 15px rgba(0, 0, 0, 0.3)',
                                    border: isCurrentLeague ? '3px solid #ffd700' : '2px solid rgba(255, 255, 255, 0.2)'
                                }}>
                                    {league.emoji}
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
                                    fontSize: '16px',
                                    marginTop: '8px',
                                    color: isCurrentLeague ? '#ffd700' : '#e0e0e0',
                                    fontWeight: isCurrentLeague ? 'bold' : '600',
                                    textShadow: isCurrentLeague ? '0px 0px 8px #ffd700' : 'none'
                                }}>
                                    {league.name}
                                </p>

                                {/* ELO Badge */}
                                {eloNeeded > 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '-18px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        backgroundColor: league.color,
                                        color: 'black',
                                        border: '2px solid black',
                                        padding: '4px 8px',
                                        borderRadius: '10px',
                                        fontSize: '12px',
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
                    fontSize: '32px',
                    fontWeight: 600,
                    marginBottom: '20px',
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
                        <div style={statLabelStyle}>{text("yourElo")}</div>
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
                        <div style={statLabelStyle}>{text("yourGlobalRank")}</div>
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

                    {eloData.win_rate && (
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
                    )}
                </div>
            </div>
        </div>
    );
}