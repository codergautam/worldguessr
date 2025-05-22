export default function getTimeString() {
  const now = new Date();

  const startUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const endUTC = new Date(startUTC.getTime() + 60 * 60 * 1000);

  const start = startUTC.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true });
  const end = endUTC.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true });
  const tz = endUTC.toLocaleTimeString(undefined, { timeZoneName: 'short' }).split(' ').pop();

  return `${start} - ${end} ${tz}`;
}

export function getMaintenanceDate() {
  const cstDate = new Date(Date.UTC(2025, 4, 24, 1)); // May 23, 2025 at 7 PM CST (which is May 24, 1 AM UTC)
  return cstDate.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });
}
