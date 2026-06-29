// In-game emote reactions — must match web `components/emoteReactions.js` so
// the `emote` index sent over WS maps to the same glyph on every client.
export const EMOTES = ['👋', '👍', '😂', '😮', '🤔', '🎯', '😡', 'GG'] as const;

export const EMOTE_TTL_MS = 3200; // how long an incoming reaction floats
export const EMOTE_COOLDOWN_MS = 1500; // min gap between sends (server also enforces)
