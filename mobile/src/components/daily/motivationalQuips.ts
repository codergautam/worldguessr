function hashStringToInt(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function quipKey(score: number, date: string): string {
  let bracket = 'Mid';
  if (score >= 12000) bracket = 'Good';
  else if (score < 6000) bracket = 'Bad';
  const idx = (hashStringToInt(`${date || ''}-${bracket}`) % 10) + 1;
  return `dailyQuip${bracket}${idx}`;
}
