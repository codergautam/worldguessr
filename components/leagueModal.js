import { Modal } from "react-responsive-modal";
import { useTranslation } from '@/components/useTranslations';
import { getLeague, leagues } from "./utils/leagues";
import { useState } from "react";

export default function LeagueModal({ shown, onClose, session, eloData }) {
    const { t: text } = useTranslation("common");
    const [hoveredLeague, setHoveredLeague] = useState(null);

    if (!eloData) return null;

    const userLeague = getLeague(eloData.elo);
    return (
        <Modal
            open={shown}
            onClose={onClose}
            center
            styles={{
                modal: {
                    backgroundColor: '#1b1b1b',
                    borderRadius: '15px',
                    padding: '20px',
                    color: 'white',
                    boxShadow: '0px 0px 20px rgba(255, 255, 255, 0.2)',
                    maxWidth: '500px'
                },
                closeButton: {
                    scale: 0.8,
                    backgroundColor: 'white',
                    color: 'black',
                    borderRadius: '50%'
                }
            }}
        >
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

                {/* <p style={{
                    fontSize: '18px',
                    color: '#b0b0b0',
                    marginBottom: '5px'
                }}>
                    {text("yourGlobalRank")}: <span style={{ color: '#ffd700' }}>#{eloData.rank}</span>
                </p> */}
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
                { eloData.win_rate && (
                <p style={{
                    fontSize: '18px',
                    color: '#b0b0b0',
                    marginBottom: '5px'
                }}>
                    {text("win_rate")}: <span style={{ color: '#ffd700' }}>{(eloData.win_rate*100).toFixed(2)}%</span>
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

            {/* CSS for the shine animation and hover effect */}
            <style jsx>{`
                @keyframes shine {
                    0% { top: -100%; left: -100%; }
                    50% { top: 100%; left: 100%; }
                    100% { top: -100%; left: -100%; }
                }

                .elo-badge {
                    opacity: 0;
                }

                div:hover .elo-badge {
                    opacity: 1;
                }

                .league-container {
                    display: flex;
                    gap: 15px;
                    justify-content: center;
                    margin-top: 10px;
                }

                /* Responsive layout for mobile devices */
                @media (max-width: 600px) {
                    .league-container {
                        flex-direction: column;
                        align-items: center;
                    }
                }
            `}</style>
        </Modal>
    );
}
