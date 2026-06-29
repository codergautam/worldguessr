/**
 * Returns true if v1 is a higher semantic version than v2.
 * Mirrors web's components/utils/versionCompare.js.
 */
export function isVersionHigher(v1: string, v2: string): boolean {
  const a = v1.split('.').map(Number);
  const b = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }

  return false; // versions are equal
}
