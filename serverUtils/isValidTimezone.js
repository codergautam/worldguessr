import moment from 'moment-timezone';
export default function isValidTimezone(tz) {
  return !!moment.tz.zone(tz);
}
