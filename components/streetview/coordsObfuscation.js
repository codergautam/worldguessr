/**
 * Simple coordinate obfuscation to prevent trivial cheating via DevTools.
 * Coordinates are encoded before being sent via postMessage or URL params,
 * and decoded inside the Street View iframe.
 *
 * NOTE: This is obfuscation, not encryption. It prevents casual cheating
 * but is not a cryptographic security measure.
 */

const OBFUSCATION_KEY = 0x5a3f;

/**
 * Encodes a coordinate (number) to an opaque string.
 * @param {number} coord
 * @returns {string}
 */
export function encodeCoord(coord) {
  if (coord == null || isNaN(coord)) return "";
  // Multiply to preserve decimal precision, XOR with key, convert to base-36
  const int = Math.round(coord * 1e7);
  const xored = int ^ OBFUSCATION_KEY;
  return xored.toString(36);
}

/**
 * Decodes an encoded coordinate string back to a number.
 * @param {string} encoded
 * @returns {number|null}
 */
export function decodeCoord(encoded) {
  if (!encoded) return null;
  try {
    const xored = parseInt(encoded, 36);
    const int = xored ^ OBFUSCATION_KEY;
    return int / 1e7;
  } catch {
    return null;
  }
}
