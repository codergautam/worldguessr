import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Defs, LinearGradient as SvgLinearGradient, Stop, Line, Polygon } from 'react-native-svg';
import { t } from '../../shared/locale';
import { haptics } from '../../services/haptics';
import { dailyColors } from './styles';

const WIDTH = 600;
const HEIGHT = 180;
const PADDING_X = 24;
const PADDING_Y = 16;
const MAX_SCORE = 15000;

const DISPLAY_BUCKET_WIDTH = 1000;
const DISPLAY_BUCKET_COUNT = Math.ceil(MAX_SCORE / DISPLAY_BUCKET_WIDTH);
const SERVER_BUCKET_COUNT = 31;
const SERVER_BUCKET_WIDTH = MAX_SCORE / (SERVER_BUCKET_COUNT - 1);
const BAR_GAP = 2;

// Bucket tooltip (web hover → mobile tap). Fixed box size so the callout can
// be centered on the bar and clamped to the chart's edges (web relies on
// overflow:visible; an RN card would clip it instead).
const TOOLTIP_W = 150;
const TOOLTIP_OFFSET_Y = 58; // box height (~48) + arrow + gap above the bar top
const ARROW_W = 10;

function aggregate(buckets: number[]): number[] {
  const chunks = new Array(DISPLAY_BUCKET_COUNT).fill(0);
  if (!buckets?.length) return chunks;
  const n = Math.min(SERVER_BUCKET_COUNT, buckets.length);
  for (let i = 0; i < n; i++) {
    const startScore = i * SERVER_BUCKET_WIDTH;
    const chunkIdx = Math.min(DISPLAY_BUCKET_COUNT - 1, Math.floor(startScore / DISPLAY_BUCKET_WIDTH));
    chunks[chunkIdx] += buckets[i] || 0;
  }
  return chunks;
}

interface Props {
  buckets?: number[];
  totalPlays?: number;
  userScore?: number;
}

export default function ScoreDistributionChart({ buckets = [], userScore }: Props) {
  // Tap a bar to inspect its bucket (web shows this on hover). Tapping the
  // selected bar again dismisses.
  const [selected, setSelected] = useState<number | null>(null);
  // Rendered chart width — needed to convert viewBox x-coords to on-screen px
  // for the tooltip (y maps 1:1: the svg's fixed height equals the viewBox's).
  const [chartW, setChartW] = useState(0);

  const { bars, userX, userBucketIdx, slotW, innerH } = useMemo(() => {
    const chunks = aggregate(buckets);
    const maxY = Math.max(1, ...chunks);
    const innerW = WIDTH - PADDING_X * 2;
    const innerH = HEIGHT - PADDING_Y * 2;
    const slotW = innerW / DISPLAY_BUCKET_COUNT;
    const barW = Math.max(1, slotW - BAR_GAP);

    const bars = chunks.map((val, i) => {
      const h = ((val || 0) / maxY) * innerH;
      const x = PADDING_X + i * slotW + BAR_GAP / 2;
      const y = HEIGHT - PADDING_Y - h;
      return { x, y, w: barW, h, val, i, cx: x + barW / 2 };
    });

    let userX: number | null = null;
    let userBucketIdx = -1;
    if (typeof userScore === 'number' && !Number.isNaN(userScore)) {
      const clamped = Math.max(0, Math.min(MAX_SCORE, userScore));
      userX = PADDING_X + (clamped / MAX_SCORE) * innerW;
      userBucketIdx = Math.min(DISPLAY_BUCKET_COUNT - 1, Math.floor(clamped / DISPLAY_BUCKET_WIDTH));
    }
    return { bars, userX, userBucketIdx, slotW, innerH };
  }, [buckets, userScore]);

  const handleBarPress = (i: number) => {
    haptics.selection();
    setSelected((cur) => (cur === i ? null : i));
  };

  // Bucket range labels — mirrors web ScoreDistributionChart.js exactly.
  const selectedBar = selected != null ? bars[selected] : null;
  const rangeFrom = selected != null ? selected * DISPLAY_BUCKET_WIDTH : 0;
  const rangeTo = selected != null
    ? (selected === DISPLAY_BUCKET_COUNT - 1
        ? MAX_SCORE
        : (selected + 1) * DISPLAY_BUCKET_WIDTH - 1)
    : 0;

  // Tooltip geometry: centered over the bar, box clamped inside the chart,
  // arrow staying on the bar's center even when the box hits an edge.
  let boxLeft = 0;
  let boxTop = 0;
  let arrowLeft = 0;
  if (selectedBar && chartW > 0) {
    const cxPx = (selectedBar.cx / WIDTH) * chartW;
    boxLeft = Math.min(Math.max(cxPx - TOOLTIP_W / 2, 2), chartW - TOOLTIP_W - 2);
    boxTop = Math.max(0, selectedBar.y - TOOLTIP_OFFSET_Y);
    arrowLeft = Math.min(Math.max(cxPx - boxLeft - ARROW_W / 2, 6), TOOLTIP_W - ARROW_W - 6);
  }

  return (
    <View style={styles.wrap} onLayout={(e: LayoutChangeEvent) => setChartW(e.nativeEvent.layout.width)}>
      <Svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" style={styles.svg}>
        <Defs>
          <SvgLinearGradient id="ddc-bar" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0%" stopColor={dailyColors.green} stopOpacity={0.95} />
            <Stop offset="100%" stopColor={dailyColors.green} stopOpacity={0.35} />
          </SvgLinearGradient>
          <SvgLinearGradient id="ddc-bar-user" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0%" stopColor="#ffd700" stopOpacity={1} />
            <Stop offset="100%" stopColor="#ffb300" stopOpacity={0.7} />
          </SvgLinearGradient>
        </Defs>
        {bars.map((b) => {
          const isUser = b.i === userBucketIdx;
          return (
            <Rect
              key={b.i}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={Math.min(4, b.w / 2)}
              fill={isUser ? 'url(#ddc-bar-user)' : 'url(#ddc-bar)'}
              opacity={selected == null || b.i === selected ? 1 : 0.55}
            />
          );
        })}
        {userX !== null && (
          <>
            <Line
              x1={userX}
              x2={userX}
              y1={PADDING_Y}
              y2={HEIGHT - PADDING_Y}
              stroke="#ffd700"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
            <Polygon
              points={`${userX - 6},${PADDING_Y - 2} ${userX + 6},${PADDING_Y - 2} ${userX},${PADDING_Y + 8}`}
              fill="#ffd700"
            />
          </>
        )}
        {/* Full-height invisible tap targets, one per bucket — rendered last so
            they sit on top. Web's hover only needs the bar rect itself; a tap
            needs the whole column or short/empty buckets are unhittable. */}
        {bars.map((b) => (
          <Rect
            key={`hit-${b.i}`}
            x={PADDING_X + b.i * slotW}
            y={PADDING_Y}
            width={slotW}
            height={innerH}
            fill="transparent"
            onPress={() => handleBarPress(b.i)}
          />
        ))}
      </Svg>
      {userX !== null && typeof userScore === 'number' && (
        <Text style={[styles.userLabel, { left: `${(userX / WIDTH) * 100}%` }]} numberOfLines={1}>
          {t('yourScore')}: {Math.round(userScore).toLocaleString()}
        </Text>
      )}
      <View style={styles.axis}>
        <Text style={styles.axisLabel}>0</Text>
        <Text style={styles.axisLabel}>{MAX_SCORE.toLocaleString()}</Text>
      </View>
      {/* Bucket callout (web .daily-distribution-tooltip, tap-driven). */}
      {selectedBar && chartW > 0 && (
        <View pointerEvents="none" style={[styles.tooltip, { left: boxLeft, top: boxTop }]}>
          <Text style={styles.tooltipRange} numberOfLines={1}>
            {t('bucketRangeLabel', { from: rangeFrom.toLocaleString(), to: rangeTo.toLocaleString() })}
          </Text>
          <Text style={styles.tooltipCount} numberOfLines={1}>
            {t('bucketPlayersLabel', { count: selectedBar.val.toLocaleString() })}
          </Text>
          <View style={[styles.tooltipArrow, { left: arrowLeft }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  svg: { width: '100%', height: 180 },
  // Positioned under the user's marker (matches web), not centered.
  userLabel: {
    position: 'absolute',
    top: 0,
    width: 130,
    marginLeft: -65,
    color: '#ffd700',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 11,
    textAlign: 'center',
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    paddingHorizontal: 4,
  },
  axisLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
  },
  // Mirrors web styles/daily.scss .daily-distribution-tooltip.
  tooltip: {
    position: 'absolute',
    width: TOOLTIP_W,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    zIndex: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 9,
  },
  tooltipRange: {
    color: '#ffd700',
    fontFamily: 'Lexend-Bold',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  tooltipCount: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: 'Lexend',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  tooltipArrow: {
    position: 'absolute',
    // Hang fully below the box (triangle height = ARROW_W / 2). Anchored via
    // `bottom` because percentage `top` offsets are unreliable in RN.
    bottom: -(ARROW_W / 2),
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_W / 2,
    borderRightWidth: ARROW_W / 2,
    borderTopWidth: ARROW_W / 2,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(0,0,0,0.92)',
  },
});
