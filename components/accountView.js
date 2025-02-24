import msToTime from "./msToTime";
import { useTranslation } from '@/components/useTranslations'
import { getLeague, leagues } from "./utils/leagues";
import { useEffect, useState } from "react";

export default function AccountView({ accountData, supporter, eloData }) {
    const { t: text } = useTranslation("common");

    const userLeague = getLeague(eloData.elo);

    const [hoveredLeague, setHoveredLeague] = useState(null);

    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        //background: 'linear-gradient(135deg, #6e8efb, #a777e3)',
        color: '#fff',
        fontFamily: 'Arial, sans-serif',
        padding: '20px',
        boxSizing: 'border-box',
        borderRadius: '10px',
    };

    const titleStyle = {
        fontSize: '32px',
        fontWeight: 'bold',
        margin: '10px 0',
        textShadow: '2px 2px 4px rgba(0,0,0,0.2)'
    };

    const textStyle = {
        fontSize: '18px',
        margin: '5px 0',
        letterSpacing: '0.5px'
    };

    const iconStyle = {
        marginRight: '8px'
    };

    return (
        <>
        <div style={containerStyle}>
            <span style={titleStyle}>
                <i className="fas fa-user" style={iconStyle}></i>
                {accountData.username}
                {supporter && <span className="badge" style={{ marginLeft: '10px', color: 'black', fontSize: '0.8rem' }}>{text("supporter")}</span>}
            </span>
            <p style={textStyle}>
                <i className="fas fa-clock" style={iconStyle}></i>
                {/* Joined {msToTime(Date.now() - new Date(accountData.createdAt).getTime())} ago */}
                {text("joined", { t: msToTime(Date.now() - new Date(accountData.createdAt).getTime()) })}
            </p>
            <p style={textStyle}>
                <i className="fas fa-star" style={iconStyle}></i>
                {accountData.totalXp} XP
            </p>
            <p style={textStyle}>
                <i className="fas fa-gamepad" style={iconStyle}></i>
                {/* Games played: {accountData.gamesLen} */}
                {text("gamesPlayed", { games: accountData.gamesLen })}
            </p>
            </div>

            <div class="g2_nav_hr"></div>

            <center>
                <h1 style={{
                    fontSize: '28px',
                    fontWeight: 'bold',
                    marginBottom: '15px',
                    color: '#ffd700',
                    textShadow: '0px 0px 8px #ffd700'
                }}>{text("leagues")}</h1>

                {/* leagueModalDesc and leagueModalDesc2 */}
                <p style={{
                    fontSize: '18px',
                    color: 'white',
                    marginBottom: '2px',
                    textShadow: '0px 0px 8px #ffd700'

                }}>
                    {text("leagueModalDesc")}
                </p>
                <p style={{
                    fontSize: '18px',
                    color: 'white',
                    marginBottom: '7px'
                }}>
                    {text("leagueModalDesc2")}
                </p>

                <p style={{
                    fontSize: '18px',
                    color: '#b0b0b0',
                    marginBottom: '5px'
                }}>
                    {text("yourElo")}: <span style={{ color: '#ffd700' }}>{eloData.elo}</span>
                </p>

                <p style={{
                    fontSize: '18px',
                    color: '#b0b0b0',
                    marginBottom: '5px'
                }}>
                    {text("yourGlobalRank")}: <span style={{ color: '#ffd700' }}>#{eloData.rank}</span>
                </p>
                <p style={{
                    fontSize: '18px',
                    color: '#b0b0b0',
                    marginBottom: '5px'
                }}>
                    {text("duels_won")}: <span style={{ color: '#ffd700' }}>{eloData.duels_wins}</span>
                </p>
                <p style={{
                    fontSize: '18px',
                    color: '#b0b0b0',
                    marginBottom: '5px'
                }}>
                    {text("duels_lost")}: <span style={{ color: '#ffd700' }}>{eloData.duels_losses}</span>
                </p>
                <p style={{
                    fontSize: '18px',
                    color: '#b0b0b0',
                    marginBottom: '5px'
                }}>
                    {text("duels_tied")}: <span style={{ color: '#ffd700' }}>{eloData.duels_tied}</span>
                </p>
                {eloData.win_rate && (
                    <p style={{
                        fontSize: '18px',
                        color: '#b0b0b0',
                        marginBottom: '5px'
                    }}>
                        {text("win_rate")}: <span style={{ color: '#ffd700' }}>{(eloData.win_rate * 100).toFixed(2)}%</span>
                    </p>
                )}

                {/* League squares with names */}
                <div className="league-container">
                    {Object.values(leagues).map((league) => {
                        const isCurrentLeague = userLeague.name === league.name;
                        const nextLeague = Object.values(leagues).find(l => l.min === league.min);
                        const eloNeeded = nextLeague ? nextLeague.min : 0;

                        return (
                            <div
                                key={league.name}
                                style={{
                                    position: 'relative',
                                    width: '70px',
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
                                {/* League Square with Shine Effect */}
                                <div style={{
                                    width: '70px',
                                    height: '60px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: league.color,
                                    color: 'black',
                                    borderRadius: '10px',
                                    fontSize: '45px',
                                    fontWeight: 'bold',
                                    position: 'relative',
                                    overflow: 'hidden'
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
                                            background: 'linear-gradient(45deg, rgba(255,255,255,0.5), rgba(255,255,255,0))',
                                            transform: 'rotate(30deg)',
                                            animation: 'shine 2s infinite linear'
                                        }} />
                                    )}
                                </div>

                                {/* League Name */}
                                <p style={{
                                    fontSize: '14px',
                                    marginTop: '5px',
                                    color: isCurrentLeague ? '#ffd700' : '#b0b0b0',
                                    fontWeight: isCurrentLeague ? 'bold' : 'normal',
                                    textShadow: isCurrentLeague ? '0px 0px 5px #ffd700' : 'none'
                                }}>
                                    {league.name}
                                </p>

                                {/* ELO Badge */}
                                {eloNeeded > 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '-15px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        backgroundColor: league.color,
                                        color: 'black',
                                        border: '2px solid black',
                                        padding: '3px 6px',
                                        borderRadius: '8px',
                                        fontSize: '10px',
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
            </center>

           


            <div class="g2_nav_hr"></div>
        </>
    );
}
