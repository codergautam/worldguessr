// Master kill switch for the stamps economy. Off unless explicitly enabled, so
// a deploy that ships the code but not the config mints nothing.
export const STAMPS_ENABLED = process.env.STAMPS_ENABLED === 'true';
