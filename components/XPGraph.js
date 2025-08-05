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

export default function XPGraph({ session, mode = 'xp' }) {
    const { t: text } = useTranslation("common");
    const [userStats, setUserStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState(mode === 'xp' ? 'xp' : 'elo'); // 'xp'/'rank' or 'elo'/'eloRank'
    const [dateFilter, setDateFilter] = useState('7days'); // '7days', '30days', 'alltime'
    const [chartData, setChartData] = useState(null);

    const fetchUserProgression = async () => {
        console.log(session?.token)
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
        
        // Filter stats based on date filter
        const now = new Date();
        const filteredStats = stats.filter((stat) => {
            if (dateFilter === 'alltime') return true;
            
            const statDate = new Date(stat.timestamp);
            const daysDiff = Math.floor((now - statDate) / (1000 * 60 * 60 * 24));
            
            if (dateFilter === '7days') return daysDiff <= 7;
            if (dateFilter === '30days') return daysDiff <= 30;
            return true;
        });

        filteredStats.forEach((stat) => {
            const date = new Date(stat.timestamp);

            if (mode === 'xp') {
                if (viewMode === 'xp') {
                    dataPoints.push({
                        x: date,
                        y: stat.totalXp,
                        xpGain: stat.xpGain || 0,
                        rank: stat.xpRank,
                        rankGain: stat.rankImprovement || 0
                    });
                } else {
                    // XP Rank mode
                    dataPoints.push({
                        x: date,
                        y: stat.xpRank,
                        rankGain: stat.rankImprovement || 0
                    });
                }
            } else {
                // ELO mode
                if (viewMode === 'elo') {
                    dataPoints.push({
                        x: date,
                        y: stat.elo,
                        eloGain: stat.eloChange || 0,
                        rank: stat.eloRank,
                        rankGain: stat.eloChange ? (stat.eloChange > 0 ? Math.abs(stat.rankImprovement || 0) : -(Math.abs(stat.rankImprovement || 0))) : 0
                    });
                } else {
                    // ELO Rank mode  
                    dataPoints.push({
                        x: date,
                        y: stat.eloRank,
                        rankGain: stat.eloChange ? (stat.eloChange > 0 ? Math.abs(stat.rankImprovement || 0) : -(Math.abs(stat.rankImprovement || 0))) : 0
                    });
                }
            }
        });

        // Calculate point radius for each data point based on whether there was a change
        const pointRadii = dataPoints.map((point, index) => {
            let hasChange = false;
            
            if (mode === 'xp') {
                if (viewMode === 'xp') {
                    hasChange = point.xpGain !== 0;
                } else {
                    hasChange = point.rankGain !== 0;
                }
            } else {
                if (viewMode === 'elo') {
                    hasChange = point.eloGain !== 0;
                } else {
                    hasChange = point.rankGain !== 0;
                }
            }
            
            // Show circle only if there was a change, or if it's the first/last point for context
            return (hasChange || index === 0 || index === dataPoints.length - 1) ? 4 : 0;
        });

        const data = {
            datasets: [{
                label: mode === 'xp' ? 
                    (viewMode === 'xp' ? text('totalXP') : text('xpRank')) :
                    (viewMode === 'elo' ? text('elo') : text('eloRank')),
                data: dataPoints,
                borderColor: (mode === 'xp' && viewMode === 'xp') || (mode === 'elo' && viewMode === 'elo') ? '#4CAF50' : '#2196F3',
                backgroundColor: (mode === 'xp' && viewMode === 'xp') || (mode === 'elo' && viewMode === 'elo') ? 'rgba(76, 175, 80, 0.1)' : 'rgba(33, 150, 243, 0.1)',
                fill: true,
                tension: 0,
                pointRadius: pointRadii,
                pointHoverRadius: 6,
                pointBackgroundColor: (mode === 'xp' && viewMode === 'xp') || (mode === 'elo' && viewMode === 'elo') ? '#4CAF50' : '#2196F3',
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
    }, [viewMode, dateFilter, userStats]);

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
                        return new Date(context[0].parsed.x).toLocaleDateString(undefined, {
                            weekday: 'short',
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                    },
                    label: (context) => {
                        if (mode === 'xp') {
                            if (viewMode === 'xp') {
                                const xpGain = context.raw.xpGain || 0;
                                const tooltip = [`${text('totalXP')}: ${context.parsed.y.toLocaleString()}`];
                                if (xpGain !== 0) {
                                    tooltip.push(`${text('xpGain')}: +${xpGain}`);
                                }
                                return tooltip;
                            } else {
                                const rankGain = context.raw.rankGain || 0;
                                const tooltip = [`${text('xpRank')}: #${context.parsed.y}`];
                                if (rankGain !== 0) {
                                    const rankText = rankGain > 0 ? `+${rankGain}` : `${rankGain}`;
                                    tooltip.push(`${text('rankGain')}: ${rankText}`);
                                }
                                return tooltip;
                            }
                        } else {
                            // ELO mode
                            if (viewMode === 'elo') {
                                const eloGain = context.raw.eloGain || 0;
                                const tooltip = [`${text('elo')}: ${context.parsed.y}`];
                                if (eloGain !== 0) {
                                    const eloText = eloGain > 0 ? `+${eloGain}` : `${eloGain}`;
                                    tooltip.push(`${text('eloGain')}: ${eloText}`);
                                }
                                return tooltip;
                            } else {
                                const rankGain = context.raw.rankGain || 0;
                                const tooltip = [`${text('eloRank')}: #${context.parsed.y}`];
                                if (rankGain !== 0) {
                                    const rankText = rankGain > 0 ? `+${rankGain}` : `${rankGain}`;
                                    tooltip.push(`${text('rankGain')}: ${rankText}`);
                                }
                                return tooltip;
                            }
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
                beginAtZero: (mode === 'xp' && viewMode === 'xp') || (mode === 'elo' && viewMode === 'elo'),
                reverse: (mode === 'xp' && viewMode === 'rank') || (mode === 'elo' && viewMode === 'eloRank'), // For rank, 1 should be at the top
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    callback: function(value) {
                        if ((mode === 'xp' && viewMode === 'xp') || (mode === 'elo' && viewMode === 'elo')) {
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

    const getCurrentValue = () => {
        if (userStats.length === 0) return 0;
        const latest = userStats[userStats.length - 1];
        if (mode === 'xp') {
            return viewMode === 'xp' ? latest.totalXp : latest.xpRank;
        } else {
            return viewMode === 'elo' ? latest.elo : latest.eloRank;
        }
    };

    const getCurrentRank = () => {
        if (userStats.length === 0) return 1;
        const latest = userStats[userStats.length - 1];
        return mode === 'xp' ? latest.xpRank : latest.eloRank;
    };

    return (
        <div style={graphStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <h3 style={{ color: '#fff', margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
                    {mode === 'xp' ? 
                        (viewMode === 'xp' ? text('xpOverTime') : text('rankOverTime')) :
                        (viewMode === 'elo' ? text('eloOverTime') : text('eloRankOverTime'))
                    }
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
                    <div style={toggleStyle}>
                        <button
                            style={toggleButtonStyle(dateFilter === '7days')}
                            onClick={() => setDateFilter('7days')}
                        >
                            7 Days
                        </button>
                        <button
                            style={toggleButtonStyle(dateFilter === '30days')}
                            onClick={() => setDateFilter('30days')}
                        >
                            30 Days
                        </button>
                        <button
                            style={toggleButtonStyle(dateFilter === 'alltime')}
                            onClick={() => setDateFilter('alltime')}
                        >
                            All Time
                        </button>
                    </div>
                    
                    <div style={toggleStyle}>
                        <button
                            style={toggleButtonStyle(mode === 'xp' ? viewMode === 'xp' : viewMode === 'elo')}
                            onClick={() => setViewMode(mode === 'xp' ? 'xp' : 'elo')}
                        >
                            {mode === 'xp' ? text('xp') : text('elo')}
                        </button>
                        <button
                            style={toggleButtonStyle(mode === 'xp' ? viewMode === 'rank' : viewMode === 'eloRank')}
                            onClick={() => setViewMode(mode === 'xp' ? 'rank' : 'eloRank')}
                        >
                            {text('rank')}
                        </button>
                    </div>
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
                <span>{text('dataPoints', { count: chartData?.datasets[0]?.data?.length || 0 })}</span>
                <span>
                    {mode === 'xp' ? 
                        (viewMode === 'xp' 
                            ? `${text('currentXP')}: ${getCurrentValue().toLocaleString()}`
                            : `${text('currentRank')}: #${getCurrentValue()}`
                        ) : 
                        (viewMode === 'elo'
                            ? `${text('currentElo')}: ${getCurrentValue()}`
                            : `${text('currentRank')}: #${getCurrentValue()}`
                        )
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