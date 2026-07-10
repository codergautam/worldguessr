export function advanceOnboardingState(previous, completedAt = Date.now()) {
  if (!previous || previous.completed) return previous;

  const totalRounds = previous.locations?.length || 3;
  if (previous.round < totalRounds) {
    return {
      ...previous,
      round: previous.round + 1,
      nextRoundTime: 0,
    };
  }

  return {
    ...previous,
    completed: true,
    finalOnboardingShown: true,
    round: previous.round,
    timeTaken: Math.max(0, completedAt - (previous.startTime || completedAt)),
    locations: previous.gameResults || [],
  };
}
