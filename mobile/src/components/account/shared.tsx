import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LineChart } from 'react-native-gifted-charts';
import { t } from '../../shared';

const GRAPH_Y_AXIS_LABEL_WIDTH = 42;
const GRAPH_MIN_PLOT_WIDTH = 170;
const GRAPH_LEFT_TRIM = 12;
const GRAPH_X_LABEL_WIDTH = 56;

// Plot height handed to <LineChart>. gifted-charts reserves extra chrome below the plot
// (a hidden x-axis label strip + internal container margins) and we stack our own x-axis
// label row beneath it, so the chart's real on-screen footprint is taller than this.
const GRAPH_PLOT_HEIGHT = 220;

// Cold-start estimate of that full footprint (plot + chart chrome + our label row — about
// 274px for height=220). It reserves the plot area *before* the chart has ever rendered so
// the slower progression fetch resolves in place instead of growing the card and shoving
// the content below it down — the jump that made opening the profile feel jarring. It only
// needs to be close to the real height: the exact value is measured on first render and
// reused for later opens (see measuredPlotFootprint), so any small difference shows as at
// most a few px of static space on the very first open of a session — never a jump.
const GRAPH_PLOT_RESERVED_HEIGHT = 280;

// Real footprint + container width captured the first time a chart lays out, shared across
// every ProgressionGraph (XP + ELO tabs, re-opens) and module-scoped so they survive the
// card unmounting when you leave the Account tab. Every graph shares the card width and
// height={GRAPH_PLOT_HEIGHT}, so one measurement is correct for all of them. Seeding later
// mounts from these lets re-opens paint the chart immediately — no spinner frame, and the
// reserved height already matches the chart.
let measuredPlotFootprint = 0;
let cachedChartWidth = 0;

function getDayStart(dateLike: string | number | Date): number {
  const date = new Date(dateLike);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Add `n` calendar days to a local-midnight timestamp, returning the new
 * local-midnight timestamp.
 *
 * Must use Date arithmetic (NOT a fixed `n * 24h` step): a fixed 24h step drifts off
 * local midnight after a DST boundary (a DST day is 23h or 25h long), and the
 * day-bucket keys in buildDailyProgressionEntries are local midnights. Once the
 * step desyncs, every later entry's bucket is missed and gets replaced by a flat
 * synthetic carry-forward, producing a long "elo didn't change" gap plus shifted
 * date labels. `setDate` rolls over months/years and DST correctly.
 */
function addDays(localMidnightMs: number, n: number): number {
  const date = new Date(localMidnightMs);
  date.setDate(date.getDate() + n);
  return date.getTime();
}

function buildDailyProgressionEntries(
  allEntries: ProgressionEntry[],
  dateFilter: DateFilter,
  now: Date,
): ProgressionEntry[] {
  if (allEntries.length === 0) return [];

  const sortedEntries = [...allEntries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const todayStart = getDayStart(now);

  let rangeStart = getDayStart(sortedEntries[0].timestamp);
  let rangeEnd = getDayStart(sortedEntries[sortedEntries.length - 1].timestamp);

  if (dateFilter === '7days') {
    rangeStart = addDays(todayStart, -6);
    rangeEnd = todayStart;
  } else if (dateFilter === '30days') {
    rangeStart = addDays(todayStart, -29);
    rangeEnd = todayStart;
  }

  const latestEntryByDay = new Map<number, ProgressionEntry>();
  for (const entry of sortedEntries) {
    const day = getDayStart(entry.timestamp);
    const existing = latestEntryByDay.get(day);
    if (!existing || new Date(entry.timestamp).getTime() >= new Date(existing.timestamp).getTime()) {
      latestEntryByDay.set(day, entry);
    }
  }

  let carryEntry = sortedEntries.findLast((entry) => getDayStart(entry.timestamp) <= rangeStart);

  if (!carryEntry) {
    carryEntry = sortedEntries.find((entry) => getDayStart(entry.timestamp) >= rangeStart);
    if (!carryEntry) return [];
    rangeStart = getDayStart(carryEntry.timestamp);
    rangeEnd = Math.max(rangeEnd, rangeStart);
  }

  const dailyEntries: ProgressionEntry[] = [];

  // Step by calendar day (addDays), NOT a fixed 24h step — see addDays: a fixed
  // 24h step drifts off the local-midnight bucket keys across a DST boundary.
  for (let day = rangeStart; day <= rangeEnd; day = addDays(day, 1)) {
    const explicitEntry = latestEntryByDay.get(day);
    if (explicitEntry) {
      carryEntry = explicitEntry;
      dailyEntries.push(explicitEntry);
      continue;
    }

    if (!carryEntry) continue;

    dailyEntries.push({
      ...carryEntry,
      timestamp: new Date(day).toISOString(),
      xpGain: 0,
      rankImprovement: 0,
      eloChange: 0,
      isSynthetic: true,
    });
  }

  return dailyEntries;
}

// ── Helpers ──────────────────────────────────────────────────

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

  if (diffMinutes < 1) return t('justNow');
  if (diffMinutes < 60) return t('minutesAgo', { minutes: diffMinutes });
  if (diffHours < 24) return t('hoursAgo', { hours: diffHours });
  if (diffDays < 7) return t('daysAgo', { days: diffDays });
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
  isSynthetic?: boolean;
}

// ── GlassCard ────────────────────────────────────────────────

export function GlassCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View style={[sharedStyles.glassCard, sharedStyles.glassCardShadow, style]}>
      <View style={[StyleSheet.absoluteFillObject, { overflow: 'hidden', borderRadius: 16 }]}>
        <BlurView
          intensity={40}
          tint="dark"
          style={StyleSheet.absoluteFillObject}
        />
      </View>
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
  onChartTouch,
}: {
  data: ProgressionEntry[];
  loading: boolean;
  mode: 'xp' | 'elo';
  onChartTouch?: (scrollEnabled: boolean) => void;
}) {
  const [viewMode, setViewMode] = useState<'value' | 'rank'>('value');
  const [dateFilter, setDateFilter] = useState<DateFilter>('alltime');
  // Seed from the cached width so a re-open (or the sibling ELO/XP tab) can render the
  // chart on the first frame instead of flashing a spinner while it re-measures. The very
  // first mount of the session starts at 0, keeping the chart gated until measured — which
  // is what prevents the cold-start two-pass width repaint (see chartReady below).
  const [chartContainerWidth, setChartContainerWidth] = useState(cachedChartWidth);

  const isRankMode = viewMode === 'rank';
  const lineColor = isRankMode ? '#2196F3' : '#4CAF50';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Title and the range/mode toggles depend only on the props + local toggle state —
  // never on the fetched progression — so they render in EVERY state (loading / empty /
  // loaded). Keeping this chrome mounted while the slower progression request is still
  // in flight is half of what stops the card from resizing once the data lands; the
  // other half is reserving the plot area below (GRAPH_PLOT_RESERVED_HEIGHT).
  const filterSuffix =
    dateFilter === '7days'
      ? t('graphFilter7Days', undefined, ' (7 Days)')
      : dateFilter === '30days'
        ? t('graphFilter30Days', undefined, ' (30 Days)')
        : t('graphFilterAllTime', undefined, ' (All Time)');
  const baseTitle =
    mode === 'xp'
      ? isRankMode ? t('rankOverTime') : t('xpOverTime')
      : isRankMode ? t('eloRankOverTime') : t('eloOverTime');
  const titleText = baseTitle + filterSuffix;

  // Bucket the raw entries into one-per-day only once the data has actually arrived.
  const chartEntries = !loading && data.length > 0
    ? buildDailyProgressionEntries(data, dateFilter, new Date())
    : [];
  const hasChart = chartEntries.length > 0;

  // Hold the chart back until the container has been measured. Drawing it once against a
  // guessed width and then re-drawing at the measured width makes gifted-charts repaint
  // the whole area path — a visible one-frame flash on first open. The width is measured
  // on the first layout pass (well before the network resolves), so by the time data is
  // ready the chart paints exactly once at the correct width.
  const chartReady = hasChart && chartContainerWidth > 0;

  // Reserve the chart's footprint in every state so the plot area never changes size.
  // Falls back to an estimate until the first real measurement lands (see below).
  const reservedPlotHeight = measuredPlotFootprint || GRAPH_PLOT_RESERVED_HEIGHT;

  let plotContent: React.ReactNode;
  if (chartReady) {
    const rawValues = chartEntries.map((entry) => {
      if (mode === 'xp') {
        return isRankMode ? (entry.xpRank ?? 0) : entry.totalXp;
      }
      return isRankMode ? (entry.eloRank ?? 0) : (entry.elo ?? 0);
    });

    const maxVal = Math.max(...rawValues);
    const minVal = Math.min(...rawValues);

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

    const chartPlotWidth = Math.max(
      GRAPH_MIN_PLOT_WIDTH,
      chartContainerWidth - GRAPH_Y_AXIS_LABEL_WIDTH - 6 + GRAPH_LEFT_TRIM,
    );
    const chartOriginLeft = Math.max(0, GRAPH_Y_AXIS_LABEL_WIDTH - GRAPH_LEFT_TRIM);

    const averagePointSpacing = chartEntries.length > 1
      ? chartPlotWidth / (chartEntries.length - 1)
      : chartPlotWidth;

    const displayData = chartEntries.map((entry, i) => ({
      value: chartValues[i],
      label: '',
      timestamp: entry.timestamp,
      hideDataPoint: entry.isSynthetic,
    }));

    const xLabelIndices = chartEntries.length > 2
      ? [0, Math.floor(chartEntries.length / 2), chartEntries.length - 1]
      : chartEntries.map((_, index) => index);
    const uniqueLabelIndices = xLabelIndices.filter((value, index, array) => array.indexOf(value) === index);
    const xLabels = uniqueLabelIndices.map((index) => {
      const d = new Date(chartEntries[index].timestamp);
      const pointOffset = chartEntries.length <= 1
        ? 0
        : (index / (chartEntries.length - 1)) * chartPlotWidth;
      const idealLeft = pointOffset - GRAPH_X_LABEL_WIDTH / 2;
      const left = index === 0
        ? 0
        : index === chartEntries.length - 1
          ? Math.max(0, chartPlotWidth - GRAPH_X_LABEL_WIDTH)
          : Math.min(
              Math.max(0, idealLeft),
              Math.max(0, chartPlotWidth - GRAPH_X_LABEL_WIDTH),
            );

      return {
        index,
        text: `${d.getMonth() + 1}/${d.getDate()}`,
        left,
        textAlign: index === 0 ? 'left' : index === chartEntries.length - 1 ? 'right' : 'center',
      } as const;
    });

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

    plotContent = (
      // Measure the chart's true footprint the first time it lays out and remember it,
      // so every later open (this tab, the ELO tab, a re-open) reserves the exact height
      // and the loading spinner occupies the same space the chart will — no growth.
      <View
        onLayout={(event: LayoutChangeEvent) => {
          const height = Math.round(event.nativeEvent.layout.height);
          if (height > 0) measuredPlotFootprint = height;
        }}
      >
        <View style={{ marginLeft: -GRAPH_LEFT_TRIM }}>
          <LineChart
            data={displayData}
            width={chartPlotWidth}
            height={GRAPH_PLOT_HEIGHT}
            spacing={averagePointSpacing}
            initialSpacing={0}
            endSpacing={0}
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
            yAxisLabelWidth={GRAPH_Y_AXIS_LABEL_WIDTH}
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
                        ? (isRankMode ? `${t('rank')}: ${displayVal}` : `${t('xp')}: ${displayVal}`)
                        : (isRankMode ? `${t('rank')}: ${displayVal}` : `${t('elo')}: ${displayVal}`)}
                    </Text>
                  </View>
                );
              },
            }}
          />
        </View>
        <View
          style={{
            position: 'relative',
            height: 16,
            width: chartPlotWidth,
            marginLeft: chartOriginLeft,
            marginTop: 4,
          }}
        >
          {xLabels.map((l, i) => (
            <View key={`${l.index}-${i}`} style={{ position: 'absolute', left: l.left, width: GRAPH_X_LABEL_WIDTH }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: 'Lexend', textAlign: l.textAlign }}>
                {l.text}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  } else if (!loading && !hasChart) {
    // Data resolved but there is nothing to plot.
    plotContent = (
      <View style={{ height: reservedPlotHeight, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 18, fontFamily: 'Lexend-SemiBold' }}>
          {t('noStatsAvailable')}
        </Text>
      </View>
    );
  } else {
    // Still loading (or measuring width) — fill the reserved area with the spinner so the
    // plot region holds its size and the chart later swaps in without moving anything.
    plotContent = (
      <View style={{ height: reservedPlotHeight, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <ActivityIndicator size="small" color="#4CAF50" />
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontFamily: 'Lexend' }}>
          {t('loadingGameHistory')}
        </Text>
      </View>
    );
  }

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
                  {f === '7days'
                    ? t('graphRange7DShort', undefined, '7D')
                    : f === '30days'
                      ? t('graphRange30DShort', undefined, '30D')
                      : t('graphRangeAllShort', undefined, 'All')}
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
                {mode === 'xp' ? t('xp') : t('elo')}
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
                {t('rank')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* The plot area keeps a fixed reserved height across loading/empty/loaded so the
          card never grows when the progression fetch resolves. onLayout here measures the
          available width (used to size the chart) — see chartReady. */}
      <View
        style={{ marginTop: 16, minHeight: reservedPlotHeight }}
        onLayout={(event: LayoutChangeEvent) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (Math.abs(nextWidth - chartContainerWidth) > 1) {
            cachedChartWidth = nextWidth;
            setChartContainerWidth(nextWidth);
          }
        }}
        onTouchStart={() => onChartTouch?.(false)}
        onTouchEnd={() => onChartTouch?.(true)}
        onTouchCancel={() => onChartTouch?.(true)}
      >
        {plotContent}
      </View>
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
