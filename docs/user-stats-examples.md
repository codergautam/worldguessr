# UserStats Model Usage Examples

This document shows how to use the UserStats model for analytics and graphing.

## Basic Usage

### Recording User Stats
```javascript
import UserStats from '../models/UserStats.js';

// After a game is completed or during daily rank updates
await UserStats.create({
  userId: 'user123',
  timestamp: new Date(),
  totalXp: 15750,
  xpRank: 42,
  elo: 1485,
  eloRank: 28,
  triggerEvent: 'game_completed',
  gameId: 'sp_674bd2a8f1c234567890abcd'
});
```

### Get User's Progression Over Time
```javascript
// Get last 30 days of user progression
const progression = await UserStats.getUserProgression('user123', '30d');

// Format for charts
const chartData = progression.map(stat => ({
  date: stat.timestamp,
  xp: stat.totalXp,
  xpRank: stat.xpRank,
  elo: stat.elo,
  eloRank: stat.eloRank
}));
```

### Get Latest Stats for Multiple Users
```javascript
const userIds = ['user1', 'user2', 'user3'];
const latestStats = await UserStats.getLatestStatsForUsers(userIds);

// Great for leaderboards
const leaderboard = latestStats
  .sort((a, b) => a.xpRank - b.xpRank)
  .map(stat => ({
    userId: stat.userId,
    xp: stat.totalXp,
    rank: stat.xpRank
  }));
```

## Advanced Analytics

### XP Growth Over Time
```javascript
// Get user's XP progression for the last 90 days
const xpProgression = await UserStats.find({
  userId: 'user123',
  timestamp: { 
    $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) 
  }
}).sort({ timestamp: 1 });

// Calculate daily XP gains
const dailyGains = [];
for (let i = 1; i < xpProgression.length; i++) {
  const current = xpProgression[i];
  const previous = xpProgression[i - 1];
  
  dailyGains.push({
    date: current.timestamp,
    xpGain: current.totalXp - previous.totalXp,
    rankChange: previous.xpRank - current.xpRank // Negative = rank went down (worse)
  });
}
```

### ELO Progression Analysis
```javascript
// Get ELO changes over time
const eloProgression = await UserStats.find({
  userId: 'user123',
  triggerEvent: 'game_completed',
  timestamp: { 
    $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) 
  }
}).sort({ timestamp: 1 });

// Calculate win/loss streaks based on ELO changes
const streaks = [];
let currentStreak = { type: null, count: 0, start: null };

for (let i = 1; i < eloProgression.length; i++) {
  const current = eloProgression[i];
  const previous = eloProgression[i - 1];
  const eloChange = current.elo - previous.elo;
  const streakType = eloChange > 0 ? 'win' : 'loss';
  
  if (currentStreak.type === streakType) {
    currentStreak.count++;
  } else {
    if (currentStreak.type !== null) {
      streaks.push({ ...currentStreak, end: previous.timestamp });
    }
    currentStreak = {
      type: streakType,
      count: 1,
      start: current.timestamp
    };
  }
}
```

### Rank Distribution Analysis
```javascript
// Get rank distribution for a specific date
const rankDistribution = await UserStats.getRankDistributionAt(
  new Date('2024-07-29T12:00:00Z'),
  'xp'
);

// Format for pie charts or histograms
const chartData = rankDistribution.map(item => ({
  rank: item._id,
  playerCount: item.count,
  averageXP: Math.round(item.avgScore)
}));
```

### Top Performers (Most Improved)
```javascript
// Get top 10 most improved players in last 7 days
const topImproved = await UserStats.getTopPerformers('7d', 'xp', 10);

const improvementChart = topImproved.map(player => ({
  userId: player.userId,
  improvement: player.improvement,
  currentRank: player.currentRank,
  percentageGain: ((player.improvement / player.previousScore) * 100).toFixed(1)
}));
```

## Chart.js Integration Examples

### Line Chart - XP Progression
```javascript
// Frontend component
const createXPChart = (progression) => {
  return {
    type: 'line',
    data: {
      labels: progression.map(p => new Date(p.timestamp).toLocaleDateString()),
      datasets: [{
        label: 'Total XP',
        data: progression.map(p => p.totalXp),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: false,
          title: {
            display: true,
            text: 'Experience Points'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Date'
          }
        }
      }
    }
  };
};
```

### Dual Axis Chart - XP and Rank
```javascript
const createXPRankChart = (progression) => {
  return {
    type: 'line',
    data: {
      labels: progression.map(p => new Date(p.timestamp).toLocaleDateString()),
      datasets: [
        {
          label: 'Total XP',
          data: progression.map(p => p.totalXp),
          borderColor: 'rgb(75, 192, 192)',
          yAxisID: 'y'
        },
        {
          label: 'XP Rank',
          data: progression.map(p => p.xpRank),
          borderColor: 'rgb(255, 99, 132)',
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'Experience Points' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          reverse: true, // Lower rank number = better
          title: { display: true, text: 'Rank Position' },
          grid: {
            drawOnChartArea: false,
          },
        }
      }
    }
  };
};
```

### ELO Rating Chart
```javascript
const createELOChart = (progression) => {
  return {
    type: 'line',
    data: {
      labels: progression.map(p => new Date(p.timestamp).toLocaleDateString()),
      datasets: [{
        label: 'ELO Rating',
        data: progression.map(p => p.elo),
        borderColor: 'rgb(255, 206, 86)',
        backgroundColor: 'rgba(255, 206, 86, 0.2)',
        tension: 0.1,
        pointBackgroundColor: progression.map(p => {
          // Color points based on ELO tier
          if (p.elo >= 1600) return 'gold';
          if (p.elo >= 1400) return 'silver';
          if (p.elo >= 1200) return 'bronze';
          return 'gray';
        })
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: false,
          min: 800,
          max: 2000,
          title: {
            display: true,
            text: 'ELO Rating'
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            afterLabel: function(context) {
              const elo = context.parsed.y;
              let tier = 'Beginner';
              if (elo >= 1600) tier = 'Expert';
              else if (elo >= 1400) tier = 'Advanced';
              else if (elo >= 1200) tier = 'Intermediate';
              return `Tier: ${tier}`;
            }
          }
        }
      }
    }
  };
};
```

## Data Collection Strategy

### When to Record Stats
1. **After each game completion** - Capture immediate impact
2. **Daily rank recalculation** - Keep historical rankings accurate
3. **Weekly snapshots** - Long-term trend analysis
4. **Special events** - Tournament results, season changes

### Optimization Tips
1. **Batch inserts** for daily updates
2. **TTL indexes** for automatic cleanup of old data
3. **Aggregation pipelines** for complex analytics
4. **Caching** frequently accessed stats

### Data Retention
```javascript
// Example: Keep detailed stats for 1 year, then aggregate to weekly
userStatsSchema.index(
  { "timestamp": 1 }, 
  { expireAfterSeconds: 365 * 24 * 60 * 60 } // 1 year TTL
);
```

This model enables rich analytics dashboards, progress tracking, and beautiful visualizations of user growth over time!