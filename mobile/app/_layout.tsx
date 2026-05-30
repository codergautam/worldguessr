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
import { useWebSocket } from '../src/hooks/useWebSocket';
import { useDeepLinkInvite } from '../src/hooks/useDeepLinkInvite';
import ToastProvider from '../src/components/multiplayer/ToastProvider';
import ActionableNotifications from '../src/components/multiplayer/ActionableNotifications';
import WsIndicator from '../src/components/multiplayer/WsIndicator';
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

  // Establish WebSocket connection (persists across all screens)
  useWebSocket();

  // Handle party invite deep links (?party=CODE / worldguessr://?party=CODE)
  useDeepLinkInvite();

  useEffect(() => {
    Asset.loadAsync(imageAssets).then(() => setAssetsLoaded(true));
  }, []);

  // Load auth session on app start
  useEffect(() => {
    useAuthStore.getState().loadSession();
    useOnboardingStore.getState().loadFlag();
  }, []);

  // Initialize native services (ads, analytics)
  useEffect(() => {
    initAnalytics();
    initAds().then(() => preloadInterstitial());
  }, []);

  useEffect(() => {
    if (fontsLoaded && assetsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, assetsLoaded]);

  if (!fontsLoaded || !assetsLoaded) {
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
          <Stack.Screen
            name="game/[id]"
            options={{ headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen name="game/results" options={{ headerShown: false }} />
          <Stack.Screen name="party/create" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="party/join" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="queue" options={{ headerShown: false }} />
          <Stack.Screen
            name="daily/index"
            options={{ headerShown: false, animation: 'slide_from_bottom', animationDuration: 280 }}
          />
          <Stack.Screen name="user/[username]" options={{ headerShown: false }} />
          <Stack.Screen
            name="onboarding/play"
            options={{ headerShown: false, gestureEnabled: false }}
          />
        </Stack>
        <ToastProvider />
        <ActionableNotifications />
        <WsIndicator />
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
