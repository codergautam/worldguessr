// OVHcloud maintenance: Tuesday 2025-12-23, 13:00-15:00 UTC

export const MAINTENANCE_START_UTC = new Date("2025-12-23T13:00:00Z");
export const MAINTENANCE_END_UTC = new Date("2025-12-23T15:00:00Z");

export default function getTimeString() {
  const startUTC = MAINTENANCE_START_UTC;
  const endUTC = MAINTENANCE_END_UTC;

  // Get components individually in user's local time
  const start = startUTC.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  const end = endUTC.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  const tz = endUTC.toLocaleTimeString(undefined, { timeZoneName: 'short' }).split(' ').pop();

  return `${start} - ${end} ${tz}`;
}

export function getMaintenanceDate() {
  return MAINTENANCE_START_UTC.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}
