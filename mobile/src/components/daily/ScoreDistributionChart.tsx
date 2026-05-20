import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Defs, LinearGradient as SvgLinearGradient, Stop, Line, Polygon } from 'react-native-svg';
import { t } from '../../shared/locale';
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
  const { bars, userX, userBucketIdx } = useMemo(() => {
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
      return { x, y, w: barW, h, val, i };
    });

    let userX: number | null = null;
    let userBucketIdx = -1;
    if (typeof userScore === 'number' && !Number.isNaN(userScore)) {
      const clamped = Math.max(0, Math.min(MAX_SCORE, userScore));
      userX = PADDING_X + (clamped / MAX_SCORE) * innerW;
      userBucketIdx = Math.min(DISPLAY_BUCKET_COUNT - 1, Math.floor(clamped / DISPLAY_BUCKET_WIDTH));
    }
    return { bars, userX, userBucketIdx };
  }, [buckets, userScore]);

  return (
    <View style={styles.wrap}>
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
      </Svg>
      {userX !== null && typeof userScore === 'number' && (
        <Text style={styles.userLabel}>
          {t('yourScore')}: {Math.round(userScore).toLocaleString()}
        </Text>
      )}
      <View style={styles.axis}>
        <Text style={styles.axisLabel}>0</Text>
        <Text style={styles.axisLabel}>{MAX_SCORE.toLocaleString()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  svg: { width: '100%', height: 180 },
  userLabel: {
    color: '#ffd700',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
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
});
