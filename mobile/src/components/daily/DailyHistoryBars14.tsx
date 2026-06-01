import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated';
import { withRepeat, withTiming } from './anims';
import { LinearGradient } from 'expo-linear-gradient';
import { t } from '../../shared/locale';
import { dailyColors } from './styles';

const MAX_SCORE = 15000;

type Tier = 'low' | 'mid' | 'high' | 'gold' | 'platinum';

// Colored glow for the premium tiers (iOS shadow; harmless on Android).
const TIER_GLOW: Partial<Record<Tier, ViewStyle>> = {
  gold: { shadowColor: '#ffc850', shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  platinum: { shadowColor: '#b9f2ff', shadowOpacity: 0.75, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
};

function HistoryBar({
  heightPct,
  colors,
  tier,
  isToday,
  played,
  unplayed,
}: {
  heightPct: number;
  colors: [string, string];
  tier: Tier | null;
  isToday: boolean;
  played: boolean;
  unplayed: boolean;
}) {
  // Today's played bar "breathes" (web dailyHistoryTodayPulse, 2s loop).
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (isToday && played) {
      pulse.value = withRepeat(withTiming(0.82, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true);
    }
  }, [isToday, played]);
  const animStyle = useAnimatedStyle(() => ({ opacity: isToday && played ? pulse.value : 1 }));

  if (unplayed) {
    return <View style={[styles.bar, styles.barTodayUnplayed, { height: `${heightPct}%` }]} />;
  }
  const glow = tier ? TIER_GLOW[tier] : undefined;
  return (
    <Animated.View style={[styles.barWrap, { height: `${heightPct}%` }, animStyle]}>
      <LinearGradient colors={colors} style={[styles.bar, styles.barFill, glow]} />
    </Animated.View>
  );
}

function tierForScore(score: number): Tier {
  const pct = score / MAX_SCORE;
  if (pct < 0.3) return 'low';
  if (pct < 0.6) return 'mid';
  if (pct < 0.8) return 'high';
  if (pct < 0.9) return 'gold';
  return 'platinum';
}

const TIER_COLORS: Record<Tier, [string, string]> = {
  low: [dailyColors.tierLowFrom, dailyColors.tierLowTo],
  mid: [dailyColors.tierMidFrom, dailyColors.tierMidTo],
  high: [dailyColors.tierHighFrom, dailyColors.tierHighTo],
  gold: [dailyColors.tierGoldFrom, dailyColors.tierGoldTo],
  platinum: [dailyColors.tierPlatinumFrom, dailyColors.tierPlatinumTo],
};

function shiftDays(dateStr: string, n: number): string | null {
  const time = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(time)) return null;
  const d = new Date(time + n * 24 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTooltipDate(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

interface HistoryEntry {
  date: string;
  score: number;
  rank?: number | null;
}

interface Props {
  history?: HistoryEntry[];
  today: string;
}

export default function DailyHistoryBars14({ history = [], today }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const windowDays = 14;

  const bars = useMemo(() => {
    if (!today) return [];
    const byDate = new Map<string, HistoryEntry>();
    for (const h of history) {
      if (!h?.date) continue;
      const prev = byDate.get(h.date);
      if (!prev || (h.score || 0) > (prev.score || 0)) byDate.set(h.date, h);
    }
    const out = [];
    for (let i = windowDays - 1; i >= 0; i--) {
      const date = shiftDays(today, -i);
      const entry = date ? byDate.get(date) : null;
      const played = !!entry && Number.isFinite(entry.score);
      out.push({
        date: date || '',
        score: played ? entry!.score : 0,
        rank: played ? entry!.rank ?? null : null,
        played,
        isToday: i === 0,
        tier: played ? tierForScore(entry!.score) : null,
      });
    }
    return out;
  }, [history, today]);

  if (!history.length) return null;

  const hoveredBar = hoveredIdx != null ? bars[hoveredIdx] : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.plot}>
        {bars.map((b, i) => {
          const h = b.played ? Math.max(10, (b.score / MAX_SCORE) * 100) : 6;
          const tierColors = b.tier ? TIER_COLORS[b.tier] : (['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.08)'] as [string, string]);
          return (
            <Pressable
              key={b.date || i}
              style={styles.barCol}
              onPress={() => setHoveredIdx(i === hoveredIdx ? null : i)}
            >
              <View style={styles.barColInner}>
                <HistoryBar
                  heightPct={h}
                  colors={tierColors}
                  tier={b.tier}
                  isToday={b.isToday}
                  played={b.played}
                  unplayed={b.isToday && !b.played}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
      {hoveredBar && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipDate}>
            {formatTooltipDate(hoveredBar.date)}
            {hoveredBar.isToday ? ` · ${t('today')}` : ''}
          </Text>
          {hoveredBar.played ? (
            <View style={styles.tooltipStats}>
              <Text style={styles.tooltipScore}>
                {hoveredBar.score.toLocaleString()} {t('pointsAbbrev')}
              </Text>
              {typeof hoveredBar.rank === 'number' && (
                <Text style={styles.tooltipRank}>{t('rankN', { rank: hoveredBar.rank })}</Text>
              )}
            </View>
          ) : (
            <Text style={styles.tooltipMuted}>{t('dailyHistoryDayMissed')}</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  plot: {
    height: 120,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'flex-end',
  },
  barCol: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barColInner: { height: '100%', justifyContent: 'flex-end' },
  bar: {
    width: '100%',
    borderRadius: 4,
  },
  barWrap: { width: '100%' },
  barFill: { flex: 1, borderRadius: 4 },
  barTodayUnplayed: {
    height: '100%',
    borderWidth: 2,
    borderColor: dailyColors.gold,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  tooltip: {
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    alignSelf: 'center',
  },
  tooltipDate: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 12, textAlign: 'center' },
  tooltipStats: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 2 },
  tooltipScore: { color: dailyColors.green, fontFamily: 'Lexend-SemiBold', fontSize: 12 },
  tooltipRank: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  tooltipMuted: { color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center', marginTop: 2 },
});
