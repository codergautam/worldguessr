import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GameLoadingOverlay from '../../src/components/game/GameLoadingOverlay';
import {
  SINGLEPLAYER_DEFAULT_MODE_KEY,
} from '../../src/hooks/useCountryGuesserGame';

export default function CountryGuesserConfigRedirect() {
  const router = useRouter();

  useEffect(() => {
    AsyncStorage.setItem(SINGLEPLAYER_DEFAULT_MODE_KEY, 'countryGuesser').catch(() => {});
    router.replace({
      pathname: '/game/[id]',
      params: { id: 'singleplayer', map: 'all', rounds: '10', mode: 'countryGuesser' },
    });
  }, [router]);

  return (
    <View style={{ flex: 1 }}>
      <GameLoadingOverlay />
    </View>
  );
}
