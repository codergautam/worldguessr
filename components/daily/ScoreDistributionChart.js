import React, { useMemo, useState } from 'react';
import { useTranslation } from '@/components/useTranslations';

const WIDTH = 600;
const HEIGHT = 180;
const PADDING_X = 24;
const PADDING_Y = 16;
const MAX_SCORE = 15000;

// Display buckets: 15 bars of 1000 pts each covering [0, 15000].
// The server always writes via bucketIndexForScore with a FIXED 31-bucket /
// 500-pt layout (see models/DailyChallengeStats.js). Legacy docs may have
// longer stored arrays — we still must use width=500 regardless of the
// array's actual length, or index 28 (14000) would get misread as a lower
// score range.
const DISPLAY_BUCKET_WIDTH = 1000;
const DISPLAY_BUCKET_COUNT = Math.ceil(MAX_SCORE / DISPLAY_BUCKET_WIDTH); // 15
const SERVER_BUCKET_COUNT = 31;
const SERVER_BUCKET_WIDTH = MAX_SCORE / (SERVER_BUCKET_COUNT - 1); // 500
const BAR_GAP = 2;

function aggregate(buckets) {
  const chunks = new Array(DISPLAY_BUCKET_COUNT).fill(0);
  if (!buckets?.length) return chunks;
  const n = Math.min(SERVER_BUCKET_COUNT, buckets.length);
  for (let i = 0; i < n; i++) {
    // Server bucket i represents scores in [i*500, (i+1)*500),
    // and the final bucket also catches the exact MAX_SCORE.
    const startScore = i * SERVER_BUCKET_WIDTH;
    const chunkIdx = Math.min(
      DISPLAY_BUCKET_COUNT - 1,
      Math.floor(startScore / DISPLAY_BUCKET_WIDTH)
    );
    chunks[chunkIdx] += buckets[i] || 0;
  }
  return chunks;
}

export default function ScoreDistributionChart({ buckets = [], totalPlays = 0, userScore }) {
  const { t: text } = useTranslation();
  const [hovered, setHovered] = useState(null);

  const { bars, userX, userBucketIdx, innerW, slotW } = useMemo(() => {
    const chunks = aggregate(buckets);
    const maxY = Math.max(1, ...chunks);
    const innerW = WIDTH - PADDING_X * 2;
    const innerH = HEIGHT - PADDING_Y * 2;
    const slotW = innerW / DISPLAY_BUCKET_COUNT;
    const barW = Math.max(1, slotW - BAR_GAP);

    const bars = chunks.map((val, i) => {
      const v = val || 0;
      const h = (v / maxY) * innerH;
      const x = PADDING_X + i * slotW + BAR_GAP / 2;
      const y = HEIGHT - PADDING_Y - h;
      return { x, y, w: barW, h, val: v, i, cx: x + barW / 2 };
    });

    let userX = null;
    let userBucketIdx = -1;
    if (typeof userScore === 'number' && !Number.isNaN(userScore)) {
      const clamped = Math.max(0, Math.min(MAX_SCORE, userScore));
      // Map score → x using the same linear scale as the bars so the
      // marker always falls inside the bar that highlights.
      userX = PADDING_X + (clamped / MAX_SCORE) * innerW;
      userBucketIdx = Math.min(
        DISPLAY_BUCKET_COUNT - 1,
        Math.floor(clamped / DISPLAY_BUCKET_WIDTH)
      );
    }

    return { bars, userX, userBucketIdx, innerW, slotW };
  }, [buckets, userScore]);

  const hoveredBar = hovered != null ? bars[hovered] : null;
  const rangeFrom = hovered != null ? hovered * DISPLAY_BUCKET_WIDTH : 0;
  const rangeTo = hovered != null
    ? (hovered === DISPLAY_BUCKET_COUNT - 1
        ? MAX_SCORE
        : (hovered + 1) * DISPLAY_BUCKET_WIDTH - 1)
    : 0;

  return (
    <div className="daily-distribution-chart-wrap" onMouseLeave={() => setHovered(null)}>
      <svg
        className="daily-distribution-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={text('dailyScoreDistribution')}
      >
        <defs>
          <linearGradient id="ddc-bar" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4CAF50" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#4CAF50" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="ddc-bar-user" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffd700" stopOpacity="1" />
            <stop offset="100%" stopColor="#ffb300" stopOpacity="0.7" />
          </linearGradient>
        </defs>

        {bars.map(b => {
          const isUser = b.i === userBucketIdx;
          const isHover = b.i === hovered;
          return (
            <rect
              key={b.i}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={Math.min(4, b.w / 2)}
              fill={isUser ? 'url(#ddc-bar-user)' : 'url(#ddc-bar)'}
              opacity={hovered == null || isHover ? 1 : 0.55}
              style={{ transition: 'opacity 120ms ease, height 0.3s ease, y 0.3s ease', cursor: 'default' }}
              onMouseEnter={() => setHovered(b.i)}
            />
          );
        })}

        {userX !== null && (
          <g pointerEvents="none">
            <line
              x1={userX}
              x2={userX}
              y1={PADDING_Y}
              y2={HEIGHT - PADDING_Y}
              stroke="#ffd700"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
            <polygon
              points={`${userX - 6},${PADDING_Y - 2} ${userX + 6},${PADDING_Y - 2} ${userX},${PADDING_Y + 8}`}
              fill="#ffd700"
            />
          </g>
        )}

      </svg>

      {userX !== null && (
        <div
          className="daily-distribution-user-label"
          style={{ left: `${(userX / WIDTH) * 100}%` }}
        >
          {text('yourScore')}: {Math.round(userScore).toLocaleString()}
        </div>
      )}

      <div className="daily-distribution-axis">
        <span>0</span>
        <span>{MAX_SCORE.toLocaleString()}</span>
      </div>

      {hoveredBar && (
        <div
          className="daily-distribution-tooltip"
          style={{ left: `${(hoveredBar.cx / WIDTH) * 100}%` }}
          role="tooltip"
        >
          <div className="daily-distribution-tooltip-range">
            {text('bucketRangeLabel', {
              from: rangeFrom.toLocaleString(),
              to: rangeTo.toLocaleString(),
            })}
          </div>
          <div className="daily-distribution-tooltip-count">
            {text('bucketPlayersLabel', { count: hoveredBar.val.toLocaleString() })}
          </div>
        </div>
      )}
    </div>
  );
}
