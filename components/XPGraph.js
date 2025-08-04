import { useState, useEffect } from 'react';
import { useTranslation } from '@/components/useTranslations';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    TimeScale,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    TimeScale
);

export default function XPGraph({ session }) {
    const { t: text } = useTranslation("common");
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('xp'); // 'xp' or 'rank'
    const [chartData, setChartData] = useState(null);

    const fetchAllGames = async () => {
        if (!session?.token?.secret || !window.cConfig?.apiUrl) return;
        
        setLoading(true);
        try {
            let allGames = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const response = await fetch(window.cConfig.apiUrl + '/api/gameHistory', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        secret: session.token.secret,
                        page,
                        limit: 50
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    allGames.push(...data.games);
                    hasMore = data.pagination.hasNextPage;
                    page++;
                } else {
                    hasMore = false;
                }
            }

            // Sort by endedAt (oldest first for cumulative calculation)
            allGames.sort((a, b) => new Date(a.endedAt) - new Date(b.endedAt));
            setGames(allGames);
            calculateGraphData(allGames);
        } catch (error) {
            console.error('Error fetching game history:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculateGraphData = (games) => {
        let cumulativeXP = 0;
        const dataPoints = [];

        games.forEach((game) => {
            cumulativeXP += game.userStats.totalXp || 0;
            const date = new Date(game.endedAt);
            
            if (viewMode === 'xp') {
                dataPoints.push({
                    x: date,
                    y: cumulativeXP,
                    gameXP: game.userStats.totalXp || 0,
                    gameType: game.gameType
                });
            } else {
                // For rank - use actual rank (1 is best)
                dataPoints.push({
                    x: date,
                    y: game.userStats.finalRank || 1,
                    gameType: game.gameType
                });
            }
        });

        const data = {
            datasets: [{
                label: viewMode === 'xp' ? text('cumulativeXP') : text('gameRank'),
                data: dataPoints,
                borderColor: viewMode === 'xp' ? '#4CAF50' : '#2196F3',
                backgroundColor: viewMode === 'xp' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(33, 150, 243, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: viewMode === 'xp' ? '#4CAF50' : '#2196F3',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
            }]
        };

        setChartData(data);
    };

    useEffect(() => {
        if (games.length > 0) {
            calculateGraphData(games);
        }
    }, [viewMode, games]);

    useEffect(() => {
        fetchAllGames();
    }, [session?.token?.secret]);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleColor: '#ffffff',
                bodyColor: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                borderWidth: 1,
                callbacks: {
                    title: (context) => {
                        return context[0].parsed.x.toLocaleDateString();
                    },
                    label: (context) => {
                        if (viewMode === 'xp') {
                            const gameXP = context.raw.gameXP || 0;
                            return `${text('totalXP')}: ${context.parsed.y.toLocaleString()} (+${gameXP})`;
                        } else {
                            return `${text('rank')}: #${context.parsed.y}`;
                        }
                    },
                    afterLabel: (context) => {
                        return `${text('gameType')}: ${context.raw.gameType}`;
                    }
                }
            }
        },
        scales: {
            x: {
                type: 'time',
                time: {
                    displayFormats: {
                        day: 'MMM dd',
                        week: 'MMM dd',
                        month: 'MMM yyyy'
                    }
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)'
                }
            },
            y: {
                beginAtZero: viewMode === 'xp',
                reverse: viewMode === 'rank', // For rank, 1 should be at the top
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    callback: function(value) {
                        if (viewMode === 'xp') {
                            return value.toLocaleString();
                        } else {
                            return `#${value}`;
                        }
                    }
                }
            }
        }
    };

    const graphStyle = {
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '20px',
        padding: '30px',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        marginTop: '20px'
    };

    const toggleStyle = {
        display: 'flex',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '25px',
        padding: '4px',
        marginBottom: '20px',
        width: 'fit-content'
    };

    const toggleButtonStyle = (active) => ({
        padding: '10px 20px',
        borderRadius: '20px',
        border: 'none',
        background: active ? '#4CAF50' : 'transparent',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '600',
        transition: 'all 0.3s ease',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
    });

    if (loading) {
        return (
            <div style={graphStyle}>
                <div style={{ textAlign: 'center', color: '#fff' }}>
                    <div style={{ 
                        width: '40px', 
                        height: '40px', 
                        border: '3px solid rgba(255,255,255,0.3)',
                        borderTop: '3px solid #4CAF50',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 20px'
                    }}></div>
                    <p>{text('loadingGameHistory')}</p>
                </div>
            </div>
        );
    }

    if (games.length === 0) {
        return (
            <div style={graphStyle}>
                <div style={{ textAlign: 'center', color: '#fff' }}>
                    <h3>{text('noGamesPlayed')}</h3>
                    <p>{text('startPlayingToSeeHistory')}</p>
                </div>
            </div>
        );
    }

    const getTotalXP = () => {
        return games.reduce((sum, game) => sum + (game.userStats.totalXp || 0), 0);
    };

    const getAverageRank = () => {
        const ranks = games.filter(game => game.userStats.finalRank).map(game => game.userStats.finalRank);
        return ranks.length > 0 ? Math.round(ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length) : 1;
    };

    return (
        <div style={graphStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ color: '#fff', margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
                    {viewMode === 'xp' ? text('xpOverTime') : text('rankOverTime')}
                </h3>
                
                <div style={toggleStyle}>
                    <button
                        style={toggleButtonStyle(viewMode === 'xp')}
                        onClick={() => setViewMode('xp')}
                    >
                        {text('xp')}
                    </button>
                    <button
                        style={toggleButtonStyle(viewMode === 'rank')}
                        onClick={() => setViewMode('rank')}
                    >
                        {text('rank')}
                    </button>
                </div>
            </div>

            <div style={{ height: '400px', position: 'relative' }}>
                {chartData && <Line data={chartData} options={chartOptions} />}
            </div>

            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                marginTop: '15px',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '14px'
            }}>
                <span>{text('totalGames', { count: games.length })}</span>
                <span>
                    {viewMode === 'xp' 
                        ? `${text('totalXP')}: ${getTotalXP().toLocaleString()}`
                        : `${text('averageRank')}: #${getAverageRank()}`
                    }
                </span>
            </div>

            <style jsx>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}