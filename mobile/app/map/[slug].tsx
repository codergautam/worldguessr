import { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import SiteBackground from '../../src/components/SiteBackground';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import MapDetailView from '../../src/components/maps/MapDetailView';

export default function MapDetailScreen() {
  const params = useLocalSearchParams<{ slug: string; hearts?: string; hearted?: string }>();
  const slug = params.slug;
  const router = useRouter();

  const handlePlay = useCallback((mapSlug: string, name: string) => {
    // replace, not push: this detail screen keeps a 6s Street View rotator
    // (MapDetailView) running, so pushing the game on top left two live
    // WebViews crossfading behind every community-map game. Nothing pops back
    // here — every game exit is dismissAllSafe (POP_TO_TOP onto the maps tab).
    router.replace({
      pathname: '/game/[id]',
      params: {
        id: 'singleplayer',
        map: mapSlug,
        mapName: name,
      },
    });
  }, [router]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/(tabs)/maps');
  }, [router]);

  return (
    <View style={styles.container}>
      <SiteBackground style={StyleSheet.absoluteFillObject}/>
      <LinearGradient
        colors={['rgba(0,0,0,0.9)', 'rgba(0,30,15,0.8)', 'rgba(0,0,0,0.9)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <MapDetailView
          slug={slug!}
          onBack={handleBack}
          onPlay={handlePlay}
          initialHearts={params.hearts ? parseInt(params.hearts, 10) : undefined}
          initialHearted={params.hearted !== undefined ? params.hearted === '1' : undefined}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#112b18',
  },
});
