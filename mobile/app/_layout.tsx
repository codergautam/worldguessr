import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View, ActivityIndicator, InteractionManager } from 'react-native';
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
import { hydrateSiteBackground } from '../src/store/siteBackgroundStore';
import { useOnboardingStore } from '../src/store/onboardingStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { initSoundSystem } from '../src/services/sound';
import { useReviewPromptStore } from '../src/store/reviewPromptStore';
import { useWebSocket } from '../src/hooks/useWebSocket';
import { useDeepLinkInvite } from '../src/hooks/useDeepLinkInvite';
import { useForceUpdate } from '../src/hooks/useForceUpdate';
import ToastProvider from '../src/components/multiplayer/ToastProvider';
import ActionableNotifications from '../src/components/multiplayer/ActionableNotifications';
import WsIndicator from '../src/components/multiplayer/WsIndicator';
import SetUsernameModal from '../src/components/SetUsernameModal';
import PartyLoginGate from '../src/components/auth/PartyLoginGate';
import ForceUpdateModal from '../src/components/ForceUpdateModal';
import GlobalErrorBoundary from '../src/components/GlobalErrorBoundary';
import { initAds, preloadInterstitial } from '../src/services/ads';
import { initAnalytics } from '../src/services/analytics';

// Anchor the root stack on the tab navigator: any cold start on a deep URL —
// dev-client reload while on a game route, a party invite link, OS state
// restoration — mounts (tabs) UNDER the deep route, preserving the canonical
// stack shapes ([tabs, game], [tabs, queue], [tabs, game, results]) that every
// dismiss/back exit in the app assumes. Without this, reloading on
// /game/multiplayer made the game route the stack ROOT: router.dismissAll()
// had nothing to pop, every X button silently no-opped, and after leaving a
// finished match the user was stranded on game/[id]'s bare `!gameData`
// GameLoadingOverlay (the "infinite Loading instead of home" bug).
export const unstable_settings = {
  anchor: '(tabs)',
};

// Keep splash screen visible while fonts + assets load
SplashScreen.preventAutoHideAsync();
// Dissolve the native splash instead of the default hard cut. The home
// entrance (one-wave nav slide + background settle) starts underneath while
// this fade runs, so app-open reads as one continuous reveal.
SplashScreen.setOptions({ duration: 400, fade: true });

// Preload all runtime image assets during startup.
//
// The stock background only. A PURCHASED background is a network fetch and is
// deliberately NOT in this list: it is warmed in the background by
// hydrateSiteBackground() below, and gating the splash on it would hold the app
// closed behind somebody's hotel wifi. Until it lands, SiteBackground paints
// this file — which is why it stays bundled even for owners.
const imageAssets = [
  require('../assets/street2.jpg'),
];

export default function RootLayout() {
  const pathname = usePathname();
  const [fontsLoaded] = useFonts({
    JockeyOne: JockeyOne_400Regular,
    Lexend: Lexend_400Regular,
    'Lexend-Medium': Lexend_500Medium,
    'Lexend-SemiBold': Lexend_600SemiBold,
    'Lexend-Bold': Lexend_700Bold,
  });

  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [rootViewLaidOut, setRootViewLaidOut] = useState(false);
  const splashHiddenRef = useRef(false);
  // User preferences (units / map type / language / emotes). Gating the splash
  // on this means the i18n table is primed before the first screen renders, so
  // the (tabs) navigator mounts in the right language with no remount flash.
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  // Also gate on the onboarding flag: index.tsx can't Redirect until it loads,
  // and without this the splash fade would lift onto its blank green interim
  // view for a frame instead of the real destination (home or tutorial).
  const onboardingLoaded = useOnboardingStore((s) => s.loaded);

  // Establish WebSocket connection (persists across all screens)
  useWebSocket();

  // Handle party invite deep links (?party=CODE / worldguessr://?party=CODE)
  useDeepLinkInvite();

  // Gate stale builds on breaking releases: checks the per-platform minimum
  // supported version (worldguessr.com/minVersion{Ios,Android}.txt) on launch and
  // on every foreground. True ⇒ render the blocking, non-dismissible update modal.
  const updateRequired = useForceUpdate();

  useEffect(() => {
    Asset.loadAsync(imageAssets)
      .catch(() => { /* The bundled image still has SiteBackground's fallback. */ })
      .finally(() => setAssetsLoaded(true));
  }, []);

  // Load auth session + user preferences on app start
  useEffect(() => {
    useAuthStore.getState().loadSession();
    useOnboardingStore.getState().loadFlag();
    useSettingsStore.getState().loadSettings();
    useReviewPromptStore.getState().load();
    // Replays this device's last equipped background so an owner's first frame
    // is their own city rather than the stock one, and starts tracking the
    // session so the answer is corrected the moment auth resolves. NOT awaited
    // and NOT gated on: it decides which photograph is prettier, never whether
    // the app opens.
    hydrateSiteBackground();
  }, []);

  // Ads and analytics are not launch-critical. Initializing their native SDKs
  // during the first navigation wave can steal the exact frames the user sees,
  // so let the entrance interaction complete before waking them up.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      initAnalytics();
      initAds().then(() => preloadInterstitial());
    });
    return () => task.cancel();
  }, []);

  // Boot the sound system once persisted volumes are known (a pre-load start
  // would misread the defaults for a muted user and stream a track they never
  // asked for). Music is allowed on ALL app routes (user sign-off), so the
  // root layout owns the one-time start + lifecycle wiring.
  useEffect(() => {
    if (!settingsLoaded) return;
    const task = InteractionManager.runAfterInteractions(() => initSoundSystem());
    return () => task.cancel();
  }, [settingsLoaded]);

  const bootReady = fontsLoaded && assetsLoaded && settingsLoaded && onboardingLoaded;
  const handleRootLayout = useCallback(() => setRootViewLaidOut(true), []);

  useEffect(() => {
    // `/` is only the redirector. Wait until the actual destination has
    // committed and the native root has dimensions, otherwise the splash fade
    // exposes one frame of the brand-colour placeholder between screens.
    if (
      !splashHiddenRef.current &&
      bootReady &&
      rootViewLaidOut &&
      pathname !== '/'
    ) {
      splashHiddenRef.current = true;
      SplashScreen.hideAsync().catch(() => {
        // Native may already have dismissed it during a development reload.
      });
    }
  }, [bootReady, pathname, rootViewLaidOut]);

  if (!bootReady) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container} onLayout={handleRootLayout}>
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
              // Kill the interactive swipe-to-navigate gesture app-wide (the only
              // directional drag a native-stack has). Navigation is button-driven
              // only; the Android system back is handled per-screen (game/daily
              // confirm). Individual screens no longer need their own
              // gestureEnabled:false.
              gestureEnabled: false,
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
              options={{ headerShown: false, animation: 'fade', animationDuration: 300 }}
            />
            <Stack.Screen name="game/results" options={{ headerShown: false, animation: 'fade', animationDuration: 300 }} />
            <Stack.Screen name="party/create" options={{ headerShown: false, animation: 'fade', animationDuration: 250 }} />
            <Stack.Screen name="party/join" options={{ headerShown: false, animation: 'fade', animationDuration: 250 }} />
            <Stack.Screen name="queue" options={{ headerShown: false, animation: 'fade', animationDuration: 250 }} />
            <Stack.Screen name="daily/index" options={{ headerShown: false, animation: 'fade', animationDuration: 250 }} />
            <Stack.Screen name="user/[username]" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="shop" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding/play" options={{ headerShown: false }} />
          </Stack>
          <ToastProvider />
          <ActionableNotifications />
          <WsIndicator />
          {/* Login sheet for guest joins that hit the server's 2v2 login gate
              (deep links have no owning screen, so the gate lives at root).
              It renders a native Modal, so mount order vs the overlays below
              doesn't matter — but keep it before SetUsernameModal to mirror
              the sign-in → set-username choreography. */}
          <PartyLoginGate />
          {/* Forces a new account with no username to set one before using the app.
              Mounted last + at root so its modal overlays EVERYTHING (home,
              onboarding, game) and cannot be bypassed. */}
          <SetUsernameModal />
          {/* Mounted last so the hard update gate overlays EVERYTHING — home,
              onboarding, game, even the set-username modal. There is no way past
              it but to update. */}
          <ForceUpdateModal visible={updateRequired} />
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
