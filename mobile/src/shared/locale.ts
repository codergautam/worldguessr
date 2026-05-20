/**
 * Tiny i18n helper — looks up a key in `locales-en.json` and interpolates
 * `{{var}}` placeholders. Use this everywhere instead of re-implementing
 * the same lookup function per component.
 *
 * Example:
 *   t('gameStartingIn', { t: 4 })        → "Game starting in 4s"
 *   t('youGotFriendReq', { from: 'Bob' }) → "Bob sent you a friend request!"
 *
 * If `key` isn't in the locale file we fall back to `fallback` (when given)
 * or the key itself — better than rendering an empty string in production.
 */

import strings from './locales-en.json';

const TABLE = strings as Record<string, string>;

export function t(
  key: string,
  vars?: Record<string, string | number | undefined | null>,
  fallback?: string,
): string {
  const template = TABLE[key] ?? fallback ?? key;
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
    const value = vars[varName];
    return value === undefined || value === null ? `{{${varName}}}` : String(value);
  });
}

/** Direct key access for callers that don't need interpolation. */
export function localeString(key: string, fallback?: string): string {
  return TABLE[key] ?? fallback ?? key;
}
