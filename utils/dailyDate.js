export function getClientLocalDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysBetween(aStr, bStr) {
  if (!aStr || !bStr) return null;
  const a = Date.parse(`${aStr}T00:00:00Z`);
  const b = Date.parse(`${bStr}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function msUntilLocalMidnight(date = new Date()) {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - date.getTime();
}

export function formatCountdown(ms) {
  if (ms <= 0) return '0s';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function challengeNumber(dateStr) {
  const epoch = Date.parse('2026-04-16T00:00:00Z');
  const target = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(target)) return 1;
  return Math.max(1, Math.floor((target - epoch) / (24 * 60 * 60 * 1000)) + 1);
}
