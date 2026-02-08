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

// Keep splash screen visible while fonts + assets load
SplashScreen.preventAutoHideAsync();

// Preload all runtime image assets during startup
const imageAssets = [
  require('../assets/street2.jpg'),
  require('../assets/marker-src.png'),
  require('../assets/marker-dest.png'),
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

  useEffect(() => {
    Asset.loadAsync(imageAssets).then(() => setAssetsLoaded(true));
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
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen
            name="game/[id]"
            options={{
              headerShown: false,
              gestureEnabled: false,
              animation: 'fade',
            }}
          />
          <Stack.Screen name="game/results" options={{ headerShown: false }} />
          <Stack.Screen name="party/create" options={{ presentation: 'modal' }} />
          <Stack.Screen name="party/[code]" options={{ headerShown: false }} />
          <Stack.Screen name="friends" options={{ presentation: 'modal' }} />
          <Stack.Screen name="history/[gameId]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="user/[username]" options={{ presentation: 'modal' }} />
        </Stack>
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
