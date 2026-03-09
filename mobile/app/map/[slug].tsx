import { useCallback } from 'react';
import { View, StyleSheet, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import MapDetailView from '../../src/components/maps/MapDetailView';

export default function MapDetailScreen() {
  const params = useLocalSearchParams<{ slug: string; hearts?: string; hearted?: string }>();
  const slug = params.slug;
  const router = useRouter();

  const handlePlay = useCallback((mapSlug: string) => {
    router.push(`/game/singleplayer?map=${mapSlug}` as any);
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
      <ImageBackground
        source={require('../../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
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
    backgroundColor: '#000',
  },
});
