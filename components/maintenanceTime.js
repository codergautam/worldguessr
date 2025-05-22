export default function getTimeString() {
  const now = new Date();

  const startUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const endUTC = new Date(startUTC.getTime() + 60 * 60 * 1000);

  // Get components individually
  const start = startUTC.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true });
  const end = endUTC.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true });
  const tz = endUTC.toLocaleTimeString(undefined, { timeZoneName: 'short' }).split(' ').pop();

  return `${start} - ${end} ${tz}`;
}
