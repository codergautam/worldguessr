import React, { useMemo, useState } from 'react';
import { useTranslation } from '@/components/useTranslations';

function emojiForScore(score) {
  if (score >= 3000) return '🟢';
  if (score >= 1500) return '🟡';
  return '🔴';
}

export default function DailyShareModal({ rounds, totalScore, challengeNumber, rank, onClose }) {
  const { t: text } = useTranslation();
  const [copied, setCopied] = useState(false);

  const shareText = useMemo(() => {
    const title = text('dailyShareTitle', { num: challengeNumber });
    const score = Math.round(totalScore);
    const max = (rounds?.length || 3) * 5000;
    const scoreLine = typeof rank === 'number'
      ? text('dailyShareScoreLine', { score, max, rank })
      : text('dailyShareAnonLine', { score, max });
    const emojis = (rounds || []).map(r => emojiForScore(r.score)).join('');
    const url = typeof window !== 'undefined' ? `${window.location.origin}/daily` : 'worldguessr.com/daily';
    return `${title}\n${scoreLine}\n${emojis}\n${url}`;
  }, [rounds, totalScore, challengeNumber, rank, text]);

  async function doShare() {
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
        setCopied(true);
      } else {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
  }

  return (
    <div className="daily-share-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="daily-share-modal-card" onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: 'Jockey One, sans-serif', fontSize: '1.3rem', marginBottom: 8 }}>
          {text('share')}
        </h3>
        <div className="daily-share-text">{shareText}</div>
        <div className="daily-actions">
          <button className="g2_green_button" onClick={doShare}>
            {copied ? text('shareCopied') : text('share')}
          </button>
          <button className="g2_green_button3" onClick={onClose}>
            {text('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
