import React from 'react';
import { useTranslation } from '@/components/useTranslations';

export default function DailyStreakBadge({ streak, variant = 'default', size = 'sm' }) {
  const { t: text } = useTranslation();
  if (!streak || streak <= 0) return null;

  const classList = ['daily-streak-pill'];
  if (variant === 'pulsing') classList.push('pulsing');
  if (variant === 'at-risk') classList.push('at-risk');
  if (variant === 'done') classList.push('done');
  if (streak >= 30) classList.push('diamond');

  const fontSize = size === 'lg' ? '0.9em' : undefined;

  return (
    <span className={classList.join(' ')} style={fontSize ? { fontSize } : undefined}>
      <span aria-hidden="true">{variant === 'done' ? '✓' : '🔥'}</span>
      <span>{streak === 1 ? text('streakOne') : text('streakDays', { count: streak })}</span>
    </span>
  );
}
