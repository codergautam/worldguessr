import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LineChart } from 'react-native-gifted-charts';

// ── Helpers ──────────────────────────────────────────────────

export function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function msToTime(duration: number): string {
  const msInDay = 1000 * 60 * 60 * 24;
  const days = Math.trunc(duration / msInDay);
  if (days > 0) return `${days}d`;
  const msInHour = 1000 * 60 * 60;
  const hours = Math.trunc(duration / msInHour);
  if (hours > 0) return `${hours}h`;
  const msInMinute = 1000 * 60;
  const minutes = Math.trunc(duration / msInMinute);
  if (minutes > 0) return `${minutes}m`;
  const seconds = Math.trunc(duration / 1000);
  return `${seconds}s`;
}

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// ── Types ────────────────────────────────────────────────────

export interface ProgressionEntry {
  timestamp: string;
  totalXp: number;
  xpGain?: number;
  xpRank?: number;
  rankImprovement?: number;
  elo?: number;
  eloChange?: number;
  eloRank?: number;
}

// ── GlassCard ────────────────────────────────────────────────

export function GlassCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View style={[sharedStyles.glassCard, sharedStyles.glassCardShadow, style]}>
      <BlurView
        intensity={40}
        tint="dark"
        style={StyleSheet.absoluteFillObject}
      />
      <View style={{ position: 'relative', zIndex: 1 }}>{children}</View>
    </View>
  );
}

// ── StatItem ─────────────────────────────────────────────────

export function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={sharedStyles.statItem}>
      <Text style={sharedStyles.statItemLabel}>{label}</Text>
      <Text style={sharedStyles.statItemValue}>{value}</Text>
    </View>
  );
}

// ── ProgressionGraph ─────────────────────────────────────────

type DateFilter = '7days' | '30days' | 'alltime';

export function ProgressionGraph({
  data,
  loading,
  mode,
  screenWidth,
  onChartTouch,
}: {
  data: ProgressionEntry[];
  loading: boolean;
  mode: 'xp' | 'elo';
  screenWidth: number;
  onChartTouch?: (scrollEnabled: boolean) => void;
}) {
  const [viewMode, setViewMode] = useState<'value' | 'rank'>('value');
  const [dateFilter, setDateFilter] = useState<DateFilter>('alltime');

  if (loading) {
    return (
      <GlassCard>
        <View style={{ alignItems: 'center', gap: 16, paddingVertical: 20 }}>
          <ActivityIndicator size="small" color="#4CAF50" />
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontFamily: 'Lexend' }}>
            Loading game history...
          </Text>
        </View>
      </GlassCard>
    );
  }

  if (data.length === 0) {
    return (
      <GlassCard>
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontFamily: 'Lexend-SemiBold' }}>
            No stats available
          </Text>
        </View>
      </GlassCard>
    );
  }

  const now = new Date();
  const filteredData = data.filter((entry) => {
    if (dateFilter === 'alltime') return true;
    const entryDate = new Date(entry.timestamp);
    const daysDiff = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
    if (dateFilter === '7days') return daysDiff <= 7;
    if (dateFilter === '30days') return daysDiff <= 30;
    return true;
  });

  const chartEntries = filteredData.length > 0 ? filteredData : [data[data.length - 1]];
  const isRankMode = viewMode === 'rank';
  const lineColor = isRankMode ? '#2196F3' : '#4CAF50';

  const rawValues = chartEntries.map((entry) => {
    if (mode === 'xp') {
      return isRankMode ? (entry.xpRank ?? 0) : entry.totalXp;
    }
    return isRankMode ? (entry.eloRank ?? 0) : (entry.elo ?? 0);
  });

  const maxVal = Math.max(...rawValues);
  const minVal = Math.min(...rawValues);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  let chartValues: number[];
  let yAxisOffset: number;

  if (isRankMode) {
    const inverted = rawValues.map((v) => maxVal + 1 - v);
    const invMin = Math.min(...inverted);
    const invMax = Math.max(...inverted);
    const range = invMax - invMin || 1;
    const pad = Math.max(1, Math.floor(range * 0.1));
    yAxisOffset = Math.max(0, invMin - pad);
    chartValues = inverted.map((v) => v - yAxisOffset);
  } else {
    const range = maxVal - minVal || 1;
    const pad = Math.max(1, Math.floor(range * 0.1));
    yAxisOffset = Math.max(0, minVal - pad);
    chartValues = rawValues.map((v) => v - yAxisOffset);
  }

  const chartMax = Math.max(...chartValues);

  const displayData = chartEntries.map((entry, i) => ({
    value: chartValues[i],
    label: '',
    timestamp: entry.timestamp,
  }));

  const xLabels: { text: string; position: number }[] = [];
  if (chartEntries.length > 0) {
    const fmt = (idx: number) => {
      const d = new Date(chartEntries[idx].timestamp);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };
    xLabels.push({ text: fmt(0), position: 0 });
    if (chartEntries.length > 2) {
      const mid = Math.floor(chartEntries.length / 2);
      xLabels.push({ text: fmt(mid), position: 0.5 });
    }
    xLabels.push({ text: fmt(chartEntries.length - 1), position: 1 });
  }

  const chartWidth = screenWidth - 170;

  const filterSuffix =
    dateFilter === '7days' ? ' (7 Days)' : dateFilter === '30days' ? ' (30 Days)' : ' (All Time)';
  const baseTitle =
    mode === 'xp'
      ? isRankMode ? 'XP Rank Over Time' : 'XP Over Time'
      : isRankMode ? 'ELO Rank Over Time' : 'ELO Over Time';
  const titleText = baseTitle + filterSuffix;

  const formatYLabel = (val: string) => {
    const num = Number(val) + yAxisOffset;
    if (isRankMode) {
      const rank = Math.round(maxVal + 1 - num);
      if (rank <= 0) return '';
      return `#${rank}`;
    }
    if (num >= 10000) return `${(num / 1000).toFixed(0)}k`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return String(Math.round(num));
  };

  return (
    <GlassCard>
      <Text style={sharedStyles.cardTitle}>{titleText}</Text>

      <View style={{ gap: 10 }}>
        <View style={sharedStyles.graphToggleRow}>
          <View style={sharedStyles.graphTogglePill}>
            {(['7days', '30days', 'alltime'] as DateFilter[]).map((f) => (
              <Pressable
                key={f}
                style={[
                  sharedStyles.graphToggleBtn,
                  dateFilter === f && sharedStyles.graphToggleBtnActive,
                ]}
                onPress={() => setDateFilter(f)}
              >
                <Text
                  style={[
                    sharedStyles.graphToggleText,
                    dateFilter === f && sharedStyles.graphToggleTextActive,
                  ]}
                >
                  {f === '7days' ? '7D' : f === '30days' ? '30D' : 'All'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={sharedStyles.graphToggleRow}>
          <View style={sharedStyles.graphTogglePill}>
            <Pressable
              style={[
                sharedStyles.graphToggleBtn,
                viewMode === 'value' && sharedStyles.graphToggleBtnActive,
              ]}
              onPress={() => setViewMode('value')}
            >
              <Text
                style={[
                  sharedStyles.graphToggleText,
                  viewMode === 'value' && sharedStyles.graphToggleTextActive,
                ]}
              >
                {mode === 'xp' ? 'XP' : 'ELO'}
              </Text>
            </Pressable>
            <Pressable
              style={[
                sharedStyles.graphToggleBtn,
                viewMode === 'rank' && sharedStyles.graphToggleBtnActive,
              ]}
              onPress={() => setViewMode('rank')}
            >
              <Text
                style={[
                  sharedStyles.graphToggleText,
                  viewMode === 'rank' && sharedStyles.graphToggleTextActive,
                ]}
              >
                Rank
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View
        style={{ marginTop: 16 }}
        onTouchStart={() => onChartTouch?.(false)}
        onTouchEnd={() => onChartTouch?.(true)}
        onTouchCancel={() => onChartTouch?.(true)}
      >
        <LineChart
          data={displayData}
          width={chartWidth}
          height={220}
          spacing={Math.max(2, (chartWidth - 16) / Math.max(1, chartEntries.length - 1))}
          initialSpacing={8}
          endSpacing={8}
          disableScroll
          color={lineColor}
          thickness={2}
          hideDataPoints={chartEntries.length > 30}
          dataPointsColor={lineColor}
          dataPointsRadius={3}
          areaChart
          startFillColor={lineColor}
          endFillColor={lineColor}
          startOpacity={0.2}
          endOpacity={0.02}
          maxValue={chartMax}
          noOfSections={4}
          rulesColor="rgba(255, 255, 255, 0.08)"
          rulesType="solid"
          yAxisColor="rgba(255, 255, 255, 0.1)"
          xAxisColor="rgba(255, 255, 255, 0.1)"
          yAxisTextStyle={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 10, fontFamily: 'Lexend' }}
          xAxisLabelTextStyle={{ fontSize: 0 }}
          formatYLabel={formatYLabel}
          backgroundColor="transparent"
          yAxisLabelWidth={50}
          pointerConfig={{
            pointerStripColor: 'rgba(255, 255, 255, 0.2)',
            pointerStripWidth: 1,
            pointerColor: lineColor,
            radius: 5,
            pointerLabelWidth: 160,
            pointerLabelHeight: 70,
            activatePointersOnLongPress: false,
            autoAdjustPointerLabelPosition: true,
            persistPointer: true,
            pointerLabelComponent: (items: any, _secondary: any, index: number) => {
              const chartVal = (items[0]?.value ?? 0) + yAxisOffset;
              const realVal = isRankMode
                ? Math.round(maxVal + 1 - chartVal)
                : Math.round(chartVal);
              const displayVal = isRankMode
                ? `#${realVal}`
                : realVal.toLocaleString();
              const ts = displayData[index]?.timestamp;
              const dateStr = ts
                ? (() => {
                    const d = new Date(ts);
                    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
                  })()
                : '';
              return (
                <View
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.9)',
                    borderRadius: 8,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.2)',
                  }}
                >
                  {dateStr ? (
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'Lexend', textAlign: 'center', marginBottom: 2 }}>
                      {dateStr}
                    </Text>
                  ) : null}
                  <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Lexend-Bold', textAlign: 'center' }}>
                    {mode === 'xp'
                      ? (isRankMode ? `Rank: ${displayVal}` : `XP: ${displayVal}`)
                      : (isRankMode ? `Rank: ${displayVal}` : `ELO: ${displayVal}`)}
                  </Text>
                </View>
              );
            },
          }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 50, marginTop: 4 }}>
          {xLabels.map((l, i) => (
            <Text key={i} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: 'Lexend' }}>
              {l.text}
            </Text>
          ))}
        </View>
      </View>

      <Text style={sharedStyles.dataPointsText}>
        {chartEntries.length} data points
      </Text>
    </GlassCard>
  );
}

// ── Shared Styles ────────────────────────────────────────────

export const sharedStyles = StyleSheet.create({
  // Glass Card
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  glassCardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'Lexend-SemiBold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },

  // Stat Row (icon + text)
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statIcon: {
    width: 20,
    marginRight: 10,
  },
  statText: {
    fontSize: 15,
    fontFamily: 'Lexend',
    color: '#fff',
    letterSpacing: 0.3,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statItem: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  statItemLabel: {
    fontSize: 10,
    color: '#b0b0b0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'Lexend-Medium',
    marginBottom: 4,
  },
  statItemValue: {
    fontSize: 18,
    color: '#ffd700',
    fontFamily: 'Lexend-Bold',
    textShadowColor: 'rgba(255, 215, 0, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },

  // League Visualization
  leagueContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  leagueItem: {
    alignItems: 'center',
  },
  leagueBox: {
    width: 46,
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  leagueBoxCurrent: {
    borderWidth: 2.5,
    borderColor: '#ffd700',
    shadowColor: '#ffd700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
    transform: [{ scale: 1.1 }],
  },
  leagueEmoji: {
    fontSize: 22,
  },
  leagueName: {
    fontSize: 10,
    color: '#e0e0e0',
    fontFamily: 'Lexend-SemiBold',
    marginTop: 4,
  },
  leagueNameCurrent: {
    color: '#ffd700',
    fontFamily: 'Lexend-Bold',
  },

  // Graph Toggle
  graphToggleRow: {
    alignItems: 'center',
  },
  graphTogglePill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 2,
  },
  graphToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  graphToggleBtnActive: {
    backgroundColor: '#4CAF50',
  },
  graphToggleText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontFamily: 'Lexend-SemiBold',
    textTransform: 'uppercase',
  },
  graphToggleTextActive: {
    color: '#fff',
  },
  dataPointsText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    fontFamily: 'Lexend',
    textAlign: 'center',
    marginTop: 12,
  },

  // Action Buttons
  actionButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Lexend-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
