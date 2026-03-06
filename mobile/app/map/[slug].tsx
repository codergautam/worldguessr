import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ImageBackground,
  Image,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import StreetViewWebView from '../../src/components/game/StreetViewWebView';
import { useAuthStore } from '../../src/store/authStore';
import { emitHeartUpdate, onHeartUpdate } from '../../src/store/heartSync';

function formatNumber(n: number): string {
  if (!n || isNaN(n)) return '0';
  return n.toLocaleString();
}

export default function MapDetailScreen() {
  const params = useLocalSearchParams<{ slug: string; hearts?: string; hearted?: string }>();
  const slug = params.slug;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { secret } = useAuthStore();
  const [mapData, setMapData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hearted, setHearted] = useState(params.hearted === '1');
  const [hearts, setHearts] = useState(params.hearts ? parseInt(params.hearts, 10) : 0);
  const [hearting, setHearting] = useState(false);

  const hasLoadedOnce = useRef(false);
  const fetchMapData = useCallback(() => {
    if (!slug) return;
    if (!hasLoadedOnce.current) setLoading(true);
    setError(false);
    api.mapPublicData(slug, secret || undefined)
      .then((res) => {
        setMapData(res.mapData);
        hasLoadedOnce.current = true;
        // Only use API hearts/hearted if not passed via params
        if (!params.hearts) {
          setHearts(res.mapData.hearts || 0);
        }
        if (!params.hearted) {
          setHearted(!!res.mapData.hearted);
        }
      })
      .catch(() => { if (!hasLoadedOnce.current) setError(true); })
      .finally(() => setLoading(false));
  }, [slug, secret]);

  // Update from params when navigating to a new map
  useEffect(() => {
    if (params.hearts) setHearts(parseInt(params.hearts, 10));
    if (params.hearted !== undefined) setHearted(params.hearted === '1');
  }, [params.hearts, params.hearted]);

  useFocusEffect(useCallback(() => {
    fetchMapData();
  }, [fetchMapData]));

  // Listen for heart updates from maps list page
  useEffect(() => {
    return onHeartUpdate(({ mapId, hearted: h, hearts: hc }) => {
      if (mapData && mapId === mapData._id) {
        setHearted(h);
        setHearts(hc);
      }
    });
  }, [mapData?._id]);

  const handlePlay = () => {
    const mapSlug = mapData?.countryCode || mapData?.slug || slug;
    router.push(`/game/singleplayer?map=${mapSlug}` as any);
  };

  const lastHeartTime = useRef(0);
  const handleHeart = useCallback(async () => {
    if (!secret || !mapData?._id || hearting) return;
    // Client-side rate limit (500ms)
    const now = Date.now();
    if (now - lastHeartTime.current < 500) return;
    lastHeartTime.current = now;

    const prevHearted = hearted;
    const prevHearts = hearts;

    // Optimistic update
    setHearted(!prevHearted);
    setHearts(prevHearts + (prevHearted ? -1 : 1));
    setHearting(true);

    try {
      const result = await api.heartMap(secret, mapData._id);
      if (result.success) {
        setHearted(result.hearted);
        setHearts(result.hearts);
        emitHeartUpdate({ mapId: mapData._id, hearted: result.hearted, hearts: result.hearts });
      } else {
        setHearted(prevHearted);
        setHearts(prevHearts);
      }
    } catch (e) {
      console.error('Heart error:', e);
      setHearted(prevHearted);
      setHearts(prevHearts);
    } finally {
      setHearting(false);
    }
  }, [secret, mapData, hearting, hearted, hearts]);

  const [svIndex, setSvIndex] = useState(0);
  const svTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cycle streetview images for custom maps
  useEffect(() => {
    if (!mapData?.data?.length) return;
    svTimer.current = setInterval(() => {
      setSvIndex((prev) => (prev + 1) % mapData.data.length);
    }, 5000);
    return () => { if (svTimer.current) clearInterval(svTimer.current); };
  }, [mapData?.data]);

  const flagUrl = mapData?.countryCode
    ? `https://flagcdn.com/w2560/${mapData.countryCode.toLowerCase()}.png`
    : null;

  const streetViewLocation = mapData?.data?.[svIndex]
    ? {
        lat: Number(mapData.data[svIndex].lat),
        long: Number(mapData.data[svIndex].lng),
      }
    : null;

  if (loading) {
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
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="white" />
        </View>
      </View>
    );
  }

  if (error || !mapData) {
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
          <View style={styles.centered}>
            <Ionicons name="map-outline" size={48} color="rgba(255,255,255,0.4)" />
            <Text style={styles.errorText}>Map not found</Text>
            <Pressable style={styles.backBtn} onPress={() => router.navigate('/(tabs)/maps')}>
              <Text style={styles.backBtnText}>Go Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

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
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Back button */}
          <Pressable
            style={({ pressed }) => [styles.headerBackBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.navigate('/(tabs)/maps')}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
            <Text style={styles.headerBackText}>Back</Text>
          </Pressable>

          {/* Status messages */}
          {mapData.in_review && (
            <View style={styles.statusBanner}>
              <Text style={styles.statusText}>This map is currently under review.</Text>
            </View>
          )}
          {mapData.reject_reason && (
            <View style={[styles.statusBanner, { backgroundColor: 'rgba(220,53,69,0.2)' }]}>
              <Text style={styles.statusText}>Rejected: {mapData.reject_reason}</Text>
            </View>
          )}

          {/* Map Header Image */}
          <View style={styles.mapHeader}>
            {flagUrl ? (
              <Image source={{ uri: flagUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            ) : streetViewLocation ? (
              <StreetViewWebView
                lat={streetViewLocation.lat}
                long={streetViewLocation.long}
                fov={82}
                pitch={12}
                smoothTransitions
                transitionDuration={450}
              />
            ) : (
              <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,30,15,0.6)' }]} />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.9)']}
              style={styles.mapHeaderOverlay}
            >
              <Text style={styles.mapName}>{mapData.name}</Text>
              {mapData.description_short && (
                <Text style={styles.mapShortDesc}>{mapData.description_short}</Text>
              )}
            </LinearGradient>
          </View>

          {/* Play Button */}
          <Pressable
            style={({ pressed }) => [styles.playButton, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
            onPress={handlePlay}
          >
            <LinearGradient
              colors={['#4CAF50', '#45a049']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.playButtonGradient}
            >
              <Ionicons name="play" size={24} color="white" />
              <Text style={styles.playButtonText}>PLAY</Text>
            </LinearGradient>
          </Pressable>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            {typeof mapData.plays !== 'undefined' && (
              <View style={styles.statCard}>
                <Text style={styles.statIcon}>👥</Text>
                <Text style={styles.statValue}>{formatNumber(mapData.plays)}</Text>
                <Text style={styles.statLabel}>Plays</Text>
              </View>
            )}
            {(mapData.locationcnt || mapData.data) && (
              <View style={styles.statCard}>
                <Text style={styles.statIcon}>📍</Text>
                <Text style={styles.statValue}>{formatNumber(mapData.locationcnt || mapData.data?.length || 0)}</Text>
                <Text style={styles.statLabel}>Locations</Text>
              </View>
            )}
            {typeof mapData.hearts !== 'undefined' && (
              <Pressable
                style={({ pressed }) => [styles.statCard, hearted && styles.statCardHearted, hearting && styles.statCardDisabled, pressed && !hearting && { opacity: 0.7 }]}
                onPress={handleHeart}
                disabled={hearting || !secret}
              >
                <Ionicons name={hearted ? 'heart' : 'heart-outline'} size={24} color={hearted ? '#ff4d6d' : '#fff'} />
                <Text style={styles.statValue}>{formatNumber(hearts)}</Text>
                <Text style={styles.statLabel}>Hearts</Text>
              </Pressable>
            )}
          </View>

          {/* Description */}
          {mapData.description_long && (
            <View style={styles.descriptionCard}>
              <Text style={styles.descriptionTitle}>About this map</Text>
              {mapData.description_long.split('\n').map((line: string, i: number) => (
                <Text key={i} style={styles.descriptionText}>{line}</Text>
              ))}
              {mapData.created_by && (
                <View style={styles.authorRow}>
                  <Text style={styles.authorText}>
                    Created by <Text style={styles.authorName}>{mapData.created_by}</Text>
                    {mapData.created_at ? ` ${mapData.created_at} ago` : ''}
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 18,
    fontFamily: 'Lexend-SemiBold',
    color: 'rgba(255,255,255,0.7)',
  },
  backBtn: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#245734',
    borderRadius: 8,
  },
  backBtnText: {
    fontSize: 14,
    fontFamily: 'Lexend-SemiBold',
    color: 'white',
  },
  scrollContent: {
    padding: 16,
  },

  // Header back
  headerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  headerBackText: {
    fontSize: 14,
    fontFamily: 'Lexend-Medium',
    color: 'white',
  },

  // Status banners
  statusBanner: {
    backgroundColor: 'rgba(255,193,7,0.2)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusText: {
    fontSize: 14,
    fontFamily: 'Lexend-Medium',
    color: 'white',
    textAlign: 'center',
  },

  // Map header image
  mapHeader: {
    height: 220,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,30,15,0.4)',
  },
  mapHeaderOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingTop: 60,
  },
  mapName: {
    fontSize: 26,
    fontFamily: 'Lexend-Bold',
    color: 'white',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    marginBottom: 4,
  },
  mapShortDesc: {
    fontSize: 14,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    lineHeight: 20,
  },

  // Play button
  playButton: {
    borderRadius: 15,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  playButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  playButtonText: {
    fontSize: 20,
    fontFamily: 'Lexend-Bold',
    color: 'white',
    letterSpacing: 1,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 4,
  },
  statCardHearted: {
    borderColor: 'rgba(255,77,109,0.3)',
    backgroundColor: 'rgba(255,77,109,0.08)',
  },
  statCardDisabled: {
    opacity: 0.3,
    backgroundColor: 'rgba(150,150,150,0.1)',
  },
  statIcon: {
    fontSize: 24,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Lexend-Bold',
    color: 'white',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Lexend-Medium',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Description
  descriptionCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  descriptionTitle: {
    fontSize: 20,
    fontFamily: 'Lexend-SemiBold',
    color: 'white',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  descriptionText: {
    fontSize: 15,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 22,
    marginBottom: 8,
  },
  authorRow: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  authorText: {
    fontSize: 14,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.7)',
    fontStyle: 'italic',
  },
  authorName: {
    fontFamily: 'Lexend-SemiBold',
    color: 'rgba(255,255,255,0.9)',
  },
});
