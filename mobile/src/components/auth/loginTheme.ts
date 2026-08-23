import type { TextStyle, ViewStyle } from 'react-native';

/**
 * The login surface's own world, shared by AccountSelectSheet (email + code,
 * Apple, Google) and SetUsernameModal (the first name after a Google / Apple
 * sign-in). Mirrors styles/login.css on web: a charcoal card with a whisper of
 * green, dark fields, white type, ONE mint chunky button with a 4px bottom
 * edge that presses down, green only for "go" and "correct", red only for
 * refusals. One palette and one set of field/button/error recipes, so the two
 * places a player names themselves can never drift.
 */

// Palette (mirrors styles/login.css custom properties)
export const CARD = '#171c19';
export const INK = '#ffffff';
export const INK_SOFT = 'rgba(255, 255, 255, 0.66)';
export const MUTED = 'rgba(255, 255, 255, 0.42)';
export const FIELD = '#232a26';
export const FIELD_FOCUS = '#1d2320';
export const LINE = '#313a35';
export const RULE = 'rgba(255, 255, 255, 0.12)';
export const RING = 'rgba(255, 255, 255, 0.85)';
export const BTN = '#4ade80';
export const BTN_EDGE = '#16a34a';
export const BTN_INK = '#052e16';
export const GOOD = '#4ade80';
export const BAD = '#f87171';
export const BAD_INK = '#fca5a5';
export const BAD_SOFT = 'rgba(248, 113, 113, 0.12)';

// Shared recipes. Spread into each consumer's StyleSheet.create({ ... }).
export const loginStyleDefs = {
  head: {
    gap: 6,
    marginBottom: 4,
  },
  title: {
    color: INK,
    fontFamily: 'Lexend-Bold',
    fontSize: 24,
    letterSpacing: -0.2,
  },
  subtitle: {
    color: INK_SOFT,
    fontFamily: 'Lexend',
    fontSize: 15,
    lineHeight: 21,
  },
  field: {
    position: 'relative',
  },
  // web .wgLogin__input
  input: {
    width: '100%',
    height: 56,
    paddingHorizontal: 18,
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
    color: INK,
    backgroundColor: FIELD,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 16,
  },
  inputFocused: {
    backgroundColor: FIELD_FOCUS,
    borderColor: RING,
  },
  inputWithGlyph: {
    paddingRight: 52,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  inputError: {
    borderColor: BAD,
    backgroundColor: BAD_SOFT,
  },
  // Availability glyph inside the field: spinner / check / cross
  avail: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // web .wgLogin__btn: mint, 4px bottom edge, presses down
  primaryButton: {
    width: '100%',
    height: 56,
    paddingHorizontal: 22,
    backgroundColor: BTN,
    borderRadius: 16,
    borderBottomWidth: 4,
    borderBottomColor: BTN_EDGE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryButtonPressed: {
    borderBottomWidth: 0,
    marginTop: 4,
  },
  primaryButtonDisabled: {
    backgroundColor: FIELD,
    borderBottomWidth: 0,
    marginTop: 4,
  },
  primaryText: {
    color: BTN_INK,
    fontSize: 16,
    fontFamily: 'Lexend-Bold',
    letterSpacing: 0.2,
  },
  primaryTextDisabled: {
    color: MUTED,
  },
  // web .wgLogin__error: one small red sentence ABOVE the field it talks about
  errorText: {
    color: BAD_INK,
    fontFamily: 'Lexend-SemiBold',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'left',
    paddingHorizontal: 2,
    marginBottom: -4,
  },
} satisfies Record<string, ViewStyle | TextStyle>;
