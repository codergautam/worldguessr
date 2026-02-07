import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function Index() {
  const { loadSession } = useAuthStore();

  // Load auth session in the background — don't block navigation
  useEffect(() => {
    loadSession();
  }, []);

  return <Redirect href="/(tabs)/home" />;
}
