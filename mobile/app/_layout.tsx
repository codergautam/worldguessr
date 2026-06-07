import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { useFonts } from 'expo-font';
import { JockeyOne_400Regular } from '@expo-google-fonts/jockey-one';
import {
  Lexend_400Regular,
  Lexend_500Medium,
  Lexend_600SemiBold,
  Lexend_700Bold,
} from '@expo-google-fonts/lexend';
import { Asset } from 'expo-asset';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from '../src/shared';
import { useAuthStore } from '../src/store/authStore';
import { useOnboardingStore } from '../src/store/onboardingStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { useReviewPromptStore } from '../src/store/reviewPromptStore';
import { useWebSocket } from '../src/hooks/useWebSocket';
import { useDeepLinkInvite } from '../src/hooks/useDeepLinkInvite';
import ToastProvider from '../src/components/multiplayer/ToastProvider';
import ActionableNotifications from '../src/components/multiplayer/ActionableNotifications';
import WsIndicator from '../src/components/multiplayer/WsIndicator';
import SetUsernameModal from '../src/components/SetUsernameModal';
import GlobalErrorBoundary from '../src/components/GlobalErrorBoundary';
import { initAds, preloadInterstitial } from '../src/services/ads';
import { initAnalytics } from '../src/services/analytics';

// Keep splash screen visible while fonts + assets load
SplashScreen.preventAutoHideAsync();

// Preload all runtime image assets during startup
const imageAssets = [
  require('../assets/street2.jpg'),
  require('../assets/marker-src.png'),
  require('../assets/marker-dest.png'),
  require('../assets/marker-opp.png'),
];

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    JockeyOne: JockeyOne_400Regular,
    Lexend: Lexend_400Regular,
    'Lexend-Medium': Lexend_500Medium,
    'Lexend-SemiBold': Lexend_600SemiBold,
    'Lexend-Bold': Lexend_700Bold,
  });

  const [assetsLoaded, setAssetsLoaded] = useState(false);
  // User preferences (units / map type / language / emotes). Gating the splash
  // on this means the i18n table is primed before the first screen renders, so
  // the (tabs) navigator mounts in the right language with no remount flash.
  const settingsLoaded = useSettingsStore((s) => s.loaded);

  // Establish WebSocket connection (persists across all screens)
  useWebSocket();

  // Handle party invite deep links (?party=CODE / worldguessr://?party=CODE)
  useDeepLinkInvite();

  useEffect(() => {
    Asset.loadAsync(imageAssets).then(() => setAssetsLoaded(true));
  }, []);

  // Load auth session + user preferences on app start
  useEffect(() => {
    useAuthStore.getState().loadSession();
    useOnboardingStore.getState().loadFlag();
    useSettingsStore.getState().loadSettings();
    useReviewPromptStore.getState().load();
  }, []);

  // Initialize native services (ads, analytics)
  useEffect(() => {
    initAnalytics();
    initAds().then(() => preloadInterstitial());
  }, []);

  useEffect(() => {
    if (fontsLoaded && assetsLoaded && settingsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, assetsLoaded, settingsLoaded]);

  if (!fontsLoaded || !assetsLoaded || !settingsLoaded) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {/* Catch any render/commit-phase throw so a single screen crash shows a
            branded recovery fallback instead of white-screening the whole app.
            Inside SafeAreaProvider/GestureHandlerRootView (so the fallback keeps
            safe-area + gesture context and those providers survive a crash) but
            outside StatusBar (so the status bar style is preserved). */}
        <GlobalErrorBoundary>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              // iOS-style slide-in on Android, native push on iOS.
              // Slides keep the outgoing screen opaque underneath. The card bg is
              // colors.background (brand dark green = splash bg), so the incoming
              // screen never flashes black before its content paints.
              animation: 'ios_from_right',
              animationDuration: 200,
              // Make router.replace (queue→game, party→game) slide forward, not back.
              animationTypeForReplace: 'push',
              freezeOnBlur: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            {/* The multiplayer flow (home → queue/party → game → results) and the
                daily challenge all crossfade instead of sliding. Every one of these
                screens sits on the SAME street2 backdrop, so a fade keeps the
                backdrop continuous and only crossfades the foreground — smooth, and
                no slide-gap ever exposes the solid green card background. */}
            <Stack.Screen
              name="game/[id]"
              options={{ headerShown: false, gestureEnabled: false, animation: 'fade', animationDuration: 300 }}
            />
            <Stack.Screen name="game/results" options={{ headerShown: false, animation: 'fade', animationDuration: 300 }} />
            <Stack.Screen name="party/create" options={{ headerShown: false, gestureEnabled: false, animation: 'fade', animationDuration: 250 }} />
            <Stack.Screen name="party/join" options={{ headerShown: false, gestureEnabled: false, animation: 'fade', animationDuration: 250 }} />
            <Stack.Screen name="queue" options={{ headerShown: false, animation: 'fade', animationDuration: 250 }} />
            <Stack.Screen name="daily/index" options={{ headerShown: false, animation: 'fade', animationDuration: 250 }} />
            <Stack.Screen name="user/[username]" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen
              name="onboarding/play"
              options={{ headerShown: false, gestureEnabled: false }}
            />
          </Stack>
          <ToastProvider />
          <ActionableNotifications />
          <WsIndicator />
          {/* Forces a new account with no username to set one before using the app.
              Mounted last + at root so its modal overlays EVERYTHING (home,
              onboarding, game) and cannot be bypassed. */}
          <SetUsernameModal />
        </GlobalErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
