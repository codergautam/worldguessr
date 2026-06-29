import { StyleSheet } from 'react-native';
import { colors } from '../shared';

// Typography
export const fonts = {
  regular: 'System',
  bold: 'System',
  // TODO: Add custom Lexend font
};

export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

// Common styles
export const commonStyles = StyleSheet.create({
  // Containers
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Cards
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardPressed: {
    opacity: 0.8,
  },

  // Text
  title: {
    fontSize: fontSizes['2xl'],
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
  },
  body: {
    fontSize: fontSizes.md,
    color: colors.text,
  },
  caption: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  muted: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },

  // Buttons
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Inputs
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: fontSizes.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  inputFocused: {
    borderColor: colors.primary,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.primaryDark,
    borderRadius: borderRadius.xl,
    padding: spacing['2xl'],
    width: '90%',
    maxWidth: 400,
  },

  // Shadows (iOS)
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: spacing.lg,
  },
});

// Re-export colors for convenience
export { colors };
