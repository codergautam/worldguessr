import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { useOnboardingStore } from '../src/store/onboardingStore';

export default function Index() {
  const { loadSession } = useAuthStore();
  const onboardingLoaded = useOnboardingStore((s) => s.loaded);
  const onboardingCompleted = useOnboardingStore((s) => s.completed);

  // Load auth session in the background — don't block navigation
  useEffect(() => {
    loadSession();
  }, []);

  // Wait for the AsyncStorage round-trip to finish before deciding where to
  // route. Without this, a returning user would see the home screen flash
  // before being yanked into the tutorial; or vice-versa.
  if (!onboardingLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#112b18' }} />;
  }

  if (!onboardingCompleted) {
    return <Redirect href="/onboarding/play" />;
  }

  return <Redirect href="/(tabs)/home" />;
}
