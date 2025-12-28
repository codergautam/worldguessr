import { useState, useEffect } from 'react';
import { useTranslation } from '@/components/useTranslations';
import config from '@/clientConfig';
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

export default function XPGraph({ session, mode = 'xp', isPublic = false, username = null }) {
    const { t: text } = useTranslation("common");
    const [userStats, setUserStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState(mode === 'xp' ? 'xp' : 'elo'); // 'xp'/'rank' or 'elo'/'eloRank'
    const [dateFilter, setDateFilter] = useState('7days'); // '7days', '30days', 'alltime', 'custom'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [chartData, setChartData] = useState(null);

    const fetchUserProgression = async () => {
        // For public profiles, use username; for private, use session accountId
        const hasRequiredData = isPublic ? (username && (window.cConfig?.apiUrl || config()?.apiUrl)) : (session?.token?.accountId && (window.cConfig?.apiUrl || config()?.apiUrl));
        if (!hasRequiredData) return;

        setLoading(true);
        try {
            const requestBody = isPublic
                ? { username: username }
                : { userId: session.token.accountId };

            const apiUrl = window.cConfig?.apiUrl || config()?.apiUrl;
            const response = await fetch(apiUrl + '/api/userProgression', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
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

            if (dateFilter === 'custom') {
                if (!customStartDate && !customEndDate) return true;

                const startDate = customStartDate ? new Date(customStartDate) : new Date(0);
                const endDate = customEndDate ? new Date(customEndDate) : now;

                return statDate >= startDate && statDate <= endDate;
            }

            const daysDiff = Math.floor((now - statDate) / (1000 * 60 * 60 * 24));

            if (dateFilter === '7days') return daysDiff <= 7;
            if (dateFilter === '30days') return daysDiff <= 30;
            return true;
        });


        filteredStats.forEach((stat, index) => {
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


        // Ensure we have at least 2 data points for the chart to display properly
        if (dataPoints.length === 1) {
            // If we only have 1 data point, duplicate it with a slightly different timestamp
            const singlePoint = dataPoints[0];
            const now = new Date();

            // Add a second point at the current time with the same Y value
            dataPoints.push({
                x: now,
                y: singlePoint.y,
                // Copy over any additional properties
                ...(mode === 'xp' ? {
                    xpGain: 0,
                    rank: singlePoint.rank,
                    rankGain: 0
                } : {
                    eloGain: 0,
                    rank: singlePoint.rank,
                    rankGain: 0
                })
            });

        } else if (dataPoints.length === 0) {
            // If no data points, don't render the chart
            console.log('[XPGraph] No data points available');
            setChartData(null);
            return;
        } else if (dataPoints.length > 1) {
            // Only extend the graph to today's date if current date is within the selected range
            const lastPoint = dataPoints[dataPoints.length - 1];
            const now = new Date();
            const lastPointDate = new Date(lastPoint.x);

            // Check if current date should be included based on date filter
            let shouldIncludeToday = false;
            
            if (dateFilter === 'alltime') {
                shouldIncludeToday = true;
            } else if (dateFilter === 'custom') {
                if (!customStartDate && !customEndDate) {
                    shouldIncludeToday = true;
                } else {
                    const startDate = customStartDate ? new Date(customStartDate) : new Date(0);
                    const endDate = customEndDate ? new Date(customEndDate) : now;
                    shouldIncludeToday = now >= startDate && now <= endDate;
                }
            } else {
                // For 7days and 30days, today is always included
                shouldIncludeToday = true;
            }

            // Only add today's point if it should be included and it's not already the last point
            const timeDiff = Math.abs(now.getTime() - lastPointDate.getTime());
            const oneDayInMs = 24 * 60 * 60 * 1000;

            if (shouldIncludeToday && timeDiff > oneDayInMs) {
                dataPoints.push({
                    x: now,
                    y: lastPoint.y,
                    // Copy over properties with no change indicators
                    ...(mode === 'xp' ? {
                        xpGain: 0,
                        rank: lastPoint.rank,
                        rankGain: 0
                    } : {
                        eloGain: 0,
                        rank: lastPoint.rank,
                        rankGain: 0
                    })
                });
            }
        }

        // Calculate point radius for each data point based on whether the value actually changed
        const pointRadii = dataPoints.map((point, index) => {
            let hasChange = false;

            // Check if this is the first or last point (always show these for context)
            if (index === 0 || index === dataPoints.length - 1) {
                return 4;
            }

            // Check if the Y value changed from the previous point
            const prevPoint = dataPoints[index - 1];
            if (prevPoint && point.y !== prevPoint.y) {
                hasChange = true;
            }

            // Also check gain values as a fallback (for cases where Y value might be the same but there was activity)
            if (!hasChange) {
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
            }

            return hasChange ? 4 : 0;
        });

        // Calculate min/max for dynamic scaling
        const yValues = dataPoints.map(point => point.y);
        const minValue = Math.min(...yValues);
        const maxValue = Math.max(...yValues);

        // Add some padding to the range (5% on each side)
        let range = maxValue - minValue;
        let suggestedMin, suggestedMax;

        // If all values are the same (rank hasn't changed), create a small artificial range
        if (range === 0) {
            const baseValue = minValue;
            const artificialRange = Math.max(1, Math.abs(baseValue * 0.1)); // 10% of the value, minimum 1

            suggestedMin = baseValue - artificialRange;
            suggestedMax = baseValue + artificialRange;

            console.log('[XPGraph] All values are the same, using artificial range:', {
                baseValue,
                artificialRange,
                suggestedMin,
                suggestedMax
            });
        } else {
            const padding = range * 0.05;
            suggestedMin = minValue - padding;
            suggestedMax = maxValue + padding;
        }

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
                suggestedMin,
                suggestedMax
            }]
        };


        setChartData(data);
    };

    useEffect(() => {

        if (userStats.length > 0) {
            calculateGraphData(userStats);
        }
    }, [viewMode, dateFilter, userStats, customStartDate, customEndDate]);

    useEffect(() => {
        fetchUserProgression();
    }, [session?.token?.accountId, username, isPublic]);

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
                                // if (rankGain !== 0) {
                                //     const rankText = rankGain > 0 ? `+${rankGain}` : `${rankGain}`;
                                //     tooltip.push(`${text('rankGain')}: ${rankText}`);
                                // }
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
                                // if (rankGain !== 0) {
                                //     const rankText = rankGain > 0 ? `+${rankGain}` : `${rankGain}`;
                                //     tooltip.push(`${text('rankGain')}: ${rankText}`);
                                // }
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
                    unit: 'day',
                    displayFormats: {
                        hour: 'MMM dd',
                        day: 'MMM dd',
                        week: 'MMM dd',
                        month: 'MMM yyyy'
                    },
                    tooltipFormat: 'MMM dd, yyyy HH:mm'
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    maxTicksLimit: window.innerWidth < 768 ? 4 : 8,
                    autoSkip: true,
                    maxRotation: window.innerWidth < 768 ? 45 : 0,
                    minRotation: window.innerWidth < 768 ? 45 : 0
                }
            },
            y: {
                min: chartData?.datasets[0]?.suggestedMin,
                max: chartData?.datasets[0]?.suggestedMax,
                reverse: (mode === 'xp' && viewMode === 'rank') || (mode === 'elo' && viewMode === 'eloRank'), // For rank, 1 should be at the top
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                },
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    callback: function(value) {
                        if ((mode === 'xp' && viewMode === 'xp') || (mode === 'elo' && viewMode === 'elo')) {
                            return Math.floor(value).toLocaleString();
                        } else {
                            return `#${Math.floor(value)}`;
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

    const getTimeframeTitle = () => {
        const baseTitle = mode === 'xp' ?
            (viewMode === 'xp' ? text('xpOverTime') : text('rankOverTime')) :
            (viewMode === 'elo' ? text('eloOverTime') : text('eloRankOverTime'));

        switch (dateFilter) {
            case '7days':
                return `${baseTitle} (7 Days)`;
            case '30days':
                return `${baseTitle} (30 Days)`;
            case 'custom':
                if (customStartDate && customEndDate) {
                    return `${baseTitle} (${new Date(customStartDate).toLocaleDateString()} - ${new Date(customEndDate).toLocaleDateString()})`;
                } else if (customStartDate) {
                    return `${baseTitle} (From ${new Date(customStartDate).toLocaleDateString()})`;
                } else if (customEndDate) {
                    return `${baseTitle} (Until ${new Date(customEndDate).toLocaleDateString()})`;
                } else {
                    return `${baseTitle} (Custom)`;
                }
            case 'alltime':
            default:
                return `${baseTitle} (All Time)`;
        }
    };

    return (
        <div style={graphStyle} className="xp-graph-container">
            <div className="xp-graph-header">
                <h3 className="xp-graph-title">
                    {getTimeframeTitle()}
                </h3>

                <div className="xp-graph-controls">
                    <div className="date-filter-toggle">
                        <button
                            className={`toggle-btn ${dateFilter === '7days' ? 'active' : ''}`}
                            onClick={() => setDateFilter('7days')}
                        >
                            7D
                        </button>
                        <button
                            className={`toggle-btn ${dateFilter === '30days' ? 'active' : ''}`}
                            onClick={() => setDateFilter('30days')}
                        >
                            30D
                        </button>
                        <button
                            className={`toggle-btn ${dateFilter === 'alltime' ? 'active' : ''}`}
                            onClick={() => setDateFilter('alltime')}
                        >
                            All
                        </button>
                        <button
                            className={`toggle-btn ${dateFilter === 'custom' ? 'active' : ''}`}
                            onClick={() => setDateFilter('custom')}
                        >
                            Custom
                        </button>
                    </div>

                    {dateFilter === 'custom' && (
                        <div className="custom-date-picker">
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                className="date-input"
                                placeholder="Start Date"
                            />
                            <span className="date-separator">to</span>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                className="date-input"
                                placeholder="End Date"
                            />
                        </div>
                    )}

                    <div className="view-mode-toggle">
                        <button
                            className={`toggle-btn ${mode === 'xp' ? (viewMode === 'xp' ? 'active' : '') : (viewMode === 'elo' ? 'active' : '')}`}
                            onClick={() => setViewMode(mode === 'xp' ? 'xp' : 'elo')}
                        >
                            {mode === 'xp' ? text('xp') : text('elo')}
                        </button>
                        <button
                            className={`toggle-btn ${mode === 'xp' ? (viewMode === 'rank' ? 'active' : '') : (viewMode === 'eloRank' ? 'active' : '')}`}
                            onClick={() => setViewMode(mode === 'xp' ? 'rank' : 'eloRank')}
                        >
                            {text('rank')}
                        </button>
                    </div>
                </div>
            </div>

            <div className="chart-container">
                {chartData && <Line data={chartData} options={chartOptions} />}
            </div>

            <div className="chart-stats">
                <span className="data-points">{text('dataPoints', { count: chartData?.datasets[0]?.data?.length || 0 })}</span>
                <span className="current-value">
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

                .xp-graph-header {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                    margin-bottom: 20px;
                }

                .xp-graph-title {
                    color: #fff;
                    margin: 0;
                    font-size: 20px;
                    font-weight: bold;
                    text-align: center;
                    line-height: 1.3;
                }

                .xp-graph-controls {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    align-items: center;
                    width: 100%;
                }

                .date-filter-toggle,
                .view-mode-toggle {
                    display: flex;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 25px;
                    padding: 2px;
                    gap: 1px;
                    width: 100%;
                    max-width: 100%;
                    justify-content: center;
                }

                .toggle-btn {
                    padding: 10px 8px;
                    border-radius: 20px;
                    border: none;
                    background: transparent;
                    color: #fff;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    white-space: nowrap;
                    flex: 1;
                    min-width: 0;
                    text-align: center;
                }

                .toggle-btn.active {
                    background: #4CAF50;
                    transform: scale(1.05);
                }

                .toggle-btn:hover:not(.active) {
                    background: rgba(255, 255, 255, 0.1);
                    transform: scale(1.02);
                }

                .custom-date-picker {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 15px;
                    width: 100%;
                    max-width: 100%;
                    flex-wrap: wrap;
                    justify-content: center;
                }

                .date-input {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 8px;
                    padding: 12px;
                    color: #fff;
                    font-size: 14px;
                    min-width: 140px;
                    flex: 1;
                    max-width: 200px;
                }

                .date-input:focus {
                    outline: none;
                    border-color: #4CAF50;
                    box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
                }

                .date-separator {
                    color: #fff;
                    font-size: 14px;
                    font-weight: 500;
                    white-space: nowrap;
                }

                .chart-container {
                    height: 300px;
                    position: relative;
                    margin: 20px 0;
                }

                .chart-stats {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-top: 15px;
                    color: rgba(255,255,255,0.7);
                    font-size: 14px;
                    text-align: center;
                }

                .data-points,
                .current-value {
                    display: block;
                }

                /* Desktop styles */
                @media (min-width: 768px) {
                    .xp-graph-header {
                        flex-direction: row;
                        justify-content: space-between;
                        align-items: flex-start;
                    }

                    .xp-graph-title {
                        font-size: 24px;
                        text-align: left;
                        flex: 1;
                    }

                    .xp-graph-controls {
                        align-items: flex-end;
                        flex-shrink: 0;
                        width: auto;
                        max-width: 400px;
                    }

                    .date-filter-toggle,
                    .view-mode-toggle {
                        width: fit-content;
                        justify-content: flex-end;
                    }

                    .toggle-btn {
                        padding: 10px 20px;
                        flex: none;
                        min-width: auto;
                        max-width: none;
                    }

                    .custom-date-picker {
                        flex-wrap: nowrap;
                        width: fit-content;
                        justify-content: flex-end;
                    }

                    .date-input {
                        min-width: 120px;
                        flex: none;
                    }

                    .chart-container {
                        height: 400px;
                    }

                    .chart-stats {
                        flex-direction: row;
                        justify-content: space-between;
                        text-align: left;
                    }
                }

                /* Large desktop styles */
                @media (min-width: 1024px) {
                    .xp-graph-controls {
                        max-width: 500px;
                    }
                }

                /* Small mobile adjustments */
                @media (max-width: 480px) {
                    .xp-graph-title {
                        font-size: 18px;
                    }

                    .toggle-btn {
                        padding: 8px 6px;
                        font-size: 11px;
                    }

                    .custom-date-picker {
                        padding: 12px;
                        gap: 8px;
                    }

                    .date-input {
                        padding: 10px;
                        font-size: 12px;
                        min-width: 120px;
                    }
                }
            `}</style>
        </div>
    );
}