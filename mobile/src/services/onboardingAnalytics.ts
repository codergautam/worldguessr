import { logEvent } from './analytics';

/** Mirrors the analytics surface that components/welcomeOverlay.js + onboardingComplete.js fire on web. */
export const onboardingAnalytics = {
  shown: () => logEvent('onboarding_shown'),
  modeSelected: (mode: 'country' | 'classic') =>
    logEvent('onboarding_mode_selected', { mode }),
  skipped: () => logEvent('onboarding_skipped'),
  begin: (mode: 'country' | 'classic') => logEvent('tutorial_begin', { mode }),
  continue: (
    mode: 'country' | 'classic',
    nextAction: 'classic' | 'duel' | 'communitymaps' | 'countryguesser',
  ) => logEvent(`tutorial_continue_${nextAction}`, { mode, next_action: nextAction }),
  homeClicked: (mode: 'country' | 'classic') =>
    logEvent('tutorial_home_clicked', { mode, next_action: 'home' }),
  end: (mode: 'country' | 'classic', round: number) =>
    logEvent('tutorial_end', { mode, round }),
  exit: (
    mode: 'country' | 'classic',
    round: number,
    reason: 'menu' | 'join_game' | 'login' | 'party' | string,
  ) => logEvent('tutorial_exit', { mode, round, reason }),
  casualConfigured: (challenge: 'country' | 'continent', region: string) =>
    logEvent('casual_mode_configured', { challenge, region }),
};
