import { logEvent } from './analytics';

/** Mirrors the analytics surface that components/welcomeOverlay.js + onboardingComplete.js fire on web. */
export const onboardingAnalytics = {
  shown: () => logEvent('onboarding_shown'),
  modeSelected: (mode: 'country' | 'classic' | 'skipped') =>
    logEvent('onboarding_mode_selected', { mode }),
  begin: (mode: 'country' | 'classic') => logEvent('tutorial_begin', { mode }),
  continue: (target: 'classic' | 'duel' | 'communitymaps' | 'countryguesser') =>
    logEvent(`tutorial_continue_${target}`),
  homeClicked: () => logEvent('tutorial_home_clicked'),
  end: (mode: 'country' | 'classic', action: string) =>
    logEvent('tutorial_end', { mode, action }),
  casualConfigured: (challenge: 'country' | 'continent', region: string) =>
    logEvent('casual_mode_configured', { challenge, region }),
};
