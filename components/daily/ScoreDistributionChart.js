import React, { useMemo, useState } from 'react';
import { useTranslation } from '@/components/useTranslations';

const WIDTH = 600;
const HEIGHT = 180;
const PADDING_X = 24;
const PADDING_Y = 16;
const MAX_SCORE = 15000;
const CHUNK_WIDTH = 1000; // Display-side bucket size (server stores 500-pt buckets)
const CHUNK_COUNT = Math.ceil(MAX_SCORE / CHUNK_WIDTH); // 15
const BAR_GAP = 2;

export default function ScoreDistributionChart({ buckets = [], totalPlays = 0, userScore }) {
  const { t: text } = useTranslation();
  const [hovered, setHovered] = useState(null);

  const { bars, userX, userBucketIdx } = useMemo(() => {
    if (!buckets.length) return { bars: [], userX: null, userBucketIdx: -1 };

    // Server stores 500-pt buckets; aggregate into wider CHUNK_WIDTH chunks
    // for display so there aren't 50 tiny rectangles. Server bucket i covers
    // [i*serverW, (i+1)*serverW), which falls in chunk floor(i / ratio).
    const serverW = MAX_SCORE / (buckets.length - 1);
    const chunks = new Array(CHUNK_COUNT).fill(0);
    buckets.forEach((val, i) => {
      const startScore = i * serverW;
      const chunkIdx = Math.min(CHUNK_COUNT - 1, Math.floor(startScore / CHUNK_WIDTH));
      chunks[chunkIdx] += val || 0;
    });

    const maxY = Math.max(1, ...chunks);
    const innerW = WIDTH - PADDING_X * 2;
    const innerH = HEIGHT - PADDING_Y * 2;
    const slotW = innerW / CHUNK_COUNT;
    const barW = Math.max(1, slotW - BAR_GAP);

    const bars = chunks.map((val, i) => {
      const h = (val / maxY) * innerH;
      const x = PADDING_X + i * slotW + BAR_GAP / 2;
      const y = HEIGHT - PADDING_Y - h;
      return { x, y, w: barW, h, val, i, cx: x + barW / 2 };
    });

    let userX = null;
    let userBucketIdx = -1;
    if (typeof userScore === 'number') {
      const clamped = Math.max(0, Math.min(MAX_SCORE, userScore));
      userX = PADDING_X + (clamped / MAX_SCORE) * innerW;
      userBucketIdx = Math.min(CHUNK_COUNT - 1, Math.floor(clamped / CHUNK_WIDTH));
    }

    return { bars, userX, userBucketIdx };
  }, [buckets, userScore]);

  const hoveredBar = hovered != null ? bars[hovered] : null;
  const rangeFrom = hovered != null ? hovered * CHUNK_WIDTH : 0;
  const rangeTo = hovered != null
    ? Math.min(MAX_SCORE, (hovered + 1) * CHUNK_WIDTH - 1)
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
              fill={isUser ? 'url(#ddc-bar-user)' : 'url(#ddc-bar)'}
              opacity={hovered == null || isHover ? 1 : 0.55}
              style={{ transition: 'opacity 120ms ease', cursor: 'default' }}
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
            <text x={userX} y={PADDING_Y - 6} fill="#ffd700" fontSize="12" fontWeight="700" textAnchor="middle">
              {text('yourScore')}: {Math.round(userScore)}
            </text>
          </g>
        )}

        <text x={PADDING_X} y={HEIGHT - 2} fill="rgba(255,255,255,0.55)" fontSize="10">0</text>
        <text x={WIDTH - PADDING_X} y={HEIGHT - 2} fill="rgba(255,255,255,0.55)" fontSize="10" textAnchor="end">
          {MAX_SCORE.toLocaleString()}
        </text>
      </svg>

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
