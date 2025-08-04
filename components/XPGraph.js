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
    const [userStats, setUserStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('xp'); // 'xp' or 'rank'
    const [chartData, setChartData] = useState(null);

    const fetchUserProgression = async () => {
        if (!session?.token?.accountId || !window.cConfig?.apiUrl) return;
        
        setLoading(true);
        try {
            const response = await fetch(window.cConfig.apiUrl + '/api/userProgression', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: session.token.accountId
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setUserStats(data.progression);
                calculateGraphData(data.progression);
            } else {
                console.error('Failed to fetch user progression', response.status);
                const errorData = await response.text();
                console.error('Error details:', errorData);
            }
        } catch (error) {
            console.error('Error fetching user progression:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculateGraphData = (stats) => {
        const dataPoints = [];

        stats.forEach((stat) => {
            const date = new Date(stat.timestamp);
            
            if (viewMode === 'xp') {
                dataPoints.push({
                    x: date,
                    y: stat.totalXp,
                    xpGain: stat.xpGain || 0,
                    rank: stat.xpRank
                });
            } else {
                // For rank - use actual rank (1 is best)
                dataPoints.push({
                    x: date,
                    y: stat.xpRank,
                    elo: stat.elo,
                    eloRank: stat.eloRank
                });
            }
        });

        const data = {
            datasets: [{
                label: viewMode === 'xp' ? text('totalXP') : text('xpRank'),
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
        if (userStats.length > 0) {
            calculateGraphData(userStats);
        }
    }, [viewMode, userStats]);

    useEffect(() => {
        fetchUserProgression();
    }, [session?.token?.accountId]);

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
                        return new Date(context[0].parsed.x).toLocaleDateString();
                    },
                    label: (context) => {
                        if (viewMode === 'xp') {
                            const xpGain = context.raw.xpGain || 0;
                            const rank = context.raw.rank || 0;
                            return [
                                `${text('totalXP')}: ${context.parsed.y.toLocaleString()}`,
                                `${text('xpGain')}: +${xpGain}`,
                                `${text('rank')}: #${rank}`
                            ];
                        } else {
                            const elo = context.raw.elo || 0;
                            const eloRank = context.raw.eloRank || 0;
                            return [
                                `${text('xpRank')}: #${context.parsed.y}`,
                                `${text('elo')}: ${elo}`,
                                `${text('eloRank')}: #${eloRank}`
                            ];
                        }
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

    if (userStats.length === 0) {
        return (
            <div style={graphStyle}>
                <div style={{ textAlign: 'center', color: '#fff' }}>
                    <h3>{text('noStatsAvailable')}</h3>
                    <p>{text('playGamesToSeeProgression')}</p>
                </div>
            </div>
        );
    }

    const getCurrentXP = () => {
        return userStats.length > 0 ? userStats[userStats.length - 1].totalXp : 0;
    };

    const getCurrentRank = () => {
        return userStats.length > 0 ? userStats[userStats.length - 1].xpRank : 1;
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
                <span>{text('dataPoints', { count: userStats.length })}</span>
                <span>
                    {viewMode === 'xp' 
                        ? `${text('currentXP')}: ${getCurrentXP().toLocaleString()}`
                        : `${text('currentRank')}: #${getCurrentRank()}`
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