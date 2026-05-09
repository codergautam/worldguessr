import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GameLoadingOverlay from '../../src/components/game/GameLoadingOverlay';
import {
  SINGLEPLAYER_DEFAULT_MODE_KEY,
  defaultModeValueForSubMode,
} from '../../src/hooks/useCountryGuesserGame';

export default function CountryGuesserPlayRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<{ subMode?: string }>();
  const mode = params.subMode === 'continent' ? 'continent' : 'country';
  const defaultMode = defaultModeValueForSubMode(mode);

  useEffect(() => {
    AsyncStorage.setItem(SINGLEPLAYER_DEFAULT_MODE_KEY, defaultMode).catch(() => {});
    router.replace({
      pathname: '/game/[id]',
      params: { id: 'singleplayer', map: 'all', rounds: '10', mode: defaultMode },
    });
  }, [defaultMode, router]);

  return (
    <View style={{ flex: 1 }}>
      <GameLoadingOverlay />
    </View>
  );
}
