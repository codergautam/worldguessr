import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

// Haptics fire only on iOS/Android AND when the user hasn't disabled them in
// Settings. Read the store imperatively (getState works outside React) so every
// call site honors the toggle without needing to be a hook. Defaults to true
// before settings load, so feedback works from the first frame.
const enabled = () => supported && useSettingsStore.getState().hapticsEnabled;

export const haptics = {
  light: () => enabled() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => enabled() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  heavy: () => enabled() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  selection: () => enabled() && Haptics.selectionAsync().catch(() => {}),
  success: () => enabled() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => enabled() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => enabled() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};

/**
 * Score-graded guess feedback — the closer the guess, the richer and LONGER the
 * burst, so the player physically feels how good it was. Points are on
 * WorldGuessr's 0–5000 scale (calcPoints); normalize multi-round totals first.
 *
 * Why bursts and not just Light/Medium/Heavy: a single impact's intensity is
 * nearly indistinguishable phone-to-phone, so a "1500-point" tap felt the same
 * as a "4500-point" tap (the original complaint). Encoding closeness in the
 * RHYTHM and COUNT of taps — a lone faint blip for a miss vs a triumphant
 * escalating roll for a bullseye — is far more perceptible than amplitude alone.
 */
export function hapticForScore(points: number): void {
  if (points >= 4750) {
    // Bullseye — an escalating roll (soft→firm→hard) capped by a success chime.
    // Unmistakably the biggest, longest pattern in the set.
    haptics.light();
    setTimeout(() => haptics.medium(), 90);
    setTimeout(() => haptics.heavy(), 200);
    setTimeout(() => haptics.success(), 330);
  } else if (points >= 3500) {
    // Excellent — a firm double-knock ending heavy.
    haptics.medium();
    setTimeout(() => haptics.heavy(), 110);
  } else if (points >= 2000) {
    // Good — a clear double tap (count is the tell, not strength).
    haptics.medium();
    setTimeout(() => haptics.medium(), 120);
  } else if (points >= 800) {
    // Fair — one solid tap.
    haptics.medium();
  } else {
    // Miss — a single faint blip, deliberately underwhelming.
    haptics.light();
  }
}
