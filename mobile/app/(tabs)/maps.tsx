import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  ImageBackground,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/shared';
import { api, MapItem } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { onHeartUpdate, emitHeartUpdate } from '../../src/store/heartSync';
import MapSection, { SECTION_ORDER, SECTION_LABELS } from '../../src/components/maps/MapSection';

// ── Main Screen ─────────────────────────────────────────────
export default function MapsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { secret } = useAuthStore();
  const [mapHome, setMapHome] = useState<Record<string, MapItem[]>>({});
  const [searchResults, setSearchResults] = useState<MapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);

  const isLandscape = width > 600;
  const numCols = isLandscape ? 3 : 2;
  const countryNumCols = isLandscape ? 4 : 3;

  const fetchMapHome = useCallback(async (showSpinner = false) => {
    setError(false);
    if (showSpinner) setLoading(true);
    try {
      const data = await api.mapHome(secret || undefined);
      setMapHome(data as Record<string, MapItem[]>);
    } catch (e) {
      console.error('Failed to fetch maps:', e);
      if (showSpinner) setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [secret]);

  // Initial load
  useEffect(() => {
    fetchMapHome(true);
  }, [fetchMapHome]);

  // Listen for heart updates from detail page
  useEffect(() => {
    return onHeartUpdate(({ mapId, hearted, hearts }) => {
      setMapHome((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((section) => {
          if (Array.isArray(updated[section])) {
            updated[section] = updated[section].map((m) =>
              m.id === mapId ? { ...m, hearts, hearted } : m
            );
          }
        });
        return updated;
      });
    });
  }, []);

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!text || text.trim().length < 3) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await api.searchMap(text.trim());
        setSearchResults(Array.isArray(results) ? results : []);
      } catch (e) {
        console.error('Search failed:', e);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (searchQuery.trim().length >= 3) {
      handleSearch(searchQuery);
      setRefreshing(false);
    } else {
      fetchMapHome(false);
    }
  }, [searchQuery, fetchMapHome, handleSearch]);

  const handleMapPress = (map: MapItem) => {
    const slug = map.slug || map.countryMap;
    router.push({
      pathname: `/map/${slug}`,
      params: {
        hearts: String(map.hearts ?? ''),
        hearted: map.hearted ? '1' : '0',
      },
    } as any);
  };

  const [heartingMap, setHeartingMap] = useState('');
  const lastHeartTimeRef = useRef(0);
  const handleHeartMap = useCallback(async (map: MapItem) => {
    if (!secret) return;
    if (!map.id || heartingMap) return;
    // Client-side rate limit (500ms)
    const now = Date.now();
    if (now - lastHeartTimeRef.current < 500) return;
    lastHeartTimeRef.current = now;
    setHeartingMap(map.id);

    const newHearted = !map.hearted;
    const newHearts = map.hearts + (newHearted ? 1 : -1);

    // Optimistic update
    const updateMaps = (hearted: boolean, hearts: number) => {
      setMapHome((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((section) => {
          if (Array.isArray(updated[section])) {
            updated[section] = updated[section].map((m) =>
              m.id === map.id ? { ...m, hearts, hearted } : m
            );
          }
        });
        return updated;
      });
    };

    updateMaps(newHearted, newHearts);

    try {
      const result = await api.heartMap(secret, map.id);
      if (result.success) {
        updateMaps(result.hearted, result.hearts);
        emitHeartUpdate({ mapId: map.id, hearted: result.hearted, hearts: result.hearts });
      } else {
        // Revert
        updateMaps(map.hearted!, map.hearts);
      }
    } catch (e) {
      console.error('Heart map error:', e);
      // Revert
      updateMaps(map.hearted!, map.hearts);
    } finally {
      setHeartingMap('');
    }
  }, [secret, heartingMap]);

  const isSearching = searchQuery.trim().length >= 3;

  return (
    <View style={styles.container}>
      {/* Background */}
      <ImageBackground
        source={require('../../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
      <LinearGradient
        colors={[
          'rgba(0, 0, 0, 0.9)',
          'rgba(20, 26, 57, 0.8)',
          'rgba(0, 0, 0, 0.9)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
            onPress={() => router.navigate('/(tabs)/home')}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Maps</Text>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color="#666" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for maps..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={handleSearch}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => handleSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color="#999" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="white" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="cloud-offline" size={48} color="rgba(255,255,255,0.4)" />
            <Text style={styles.errorText}>Failed to load maps</Text>
            <Pressable style={styles.retryBtn} onPress={() => fetchMapHome(true)}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="white"
              />
            }
          >
            {isSearching ? (
              // Search results — include matching country maps + API results
              (() => {
                const queryLower = searchQuery.trim().toLowerCase();
                const matchingCountryMaps = (mapHome.countryMaps || []).filter(
                  (m) => m.name?.toLowerCase().includes(queryLower)
                );
                const hasCountry = matchingCountryMaps.length > 0;
                const hasCommunity = searchResults.length > 0;
                const hasAny = hasCountry || hasCommunity;

                if (searchLoading && !hasAny) {
                  return (
                    <View style={styles.centered}>
                      <ActivityIndicator size="large" color="white" />
                      <Text style={styles.loadingText}>Searching...</Text>
                    </View>
                  );
                }

                if (!hasAny && !searchLoading) {
                  return (
                    <View style={styles.emptyState}>
                      <Ionicons name="map-outline" size={48} color="rgba(255,255,255,0.3)" />
                      <Text style={styles.emptyTitle}>No results found</Text>
                      <Text style={styles.emptySubtext}>
                        Try adjusting your search terms
                      </Text>
                    </View>
                  );
                }

                return (
                  <>
                    {hasCountry && (
                      <MapSection
                        title="Country Maps"
                        maps={matchingCountryMaps}
                        isCountry
                        onMapPress={handleMapPress}
                        numCols={countryNumCols}
                      />
                    )}
                    {hasCommunity && (
                      <MapSection
                        title="Search Results"
                        maps={searchResults}
                        onMapPress={handleMapPress}
                        onHeartMap={secret ? handleHeartMap : undefined}
                        heartingMapId={heartingMap}
                        numCols={numCols}
                      />
                    )}
                    {searchLoading && (
                      <ActivityIndicator size="small" color="white" style={{ marginTop: 12 }} />
                    )}
                  </>
                );
              })()
            ) : (
              // Map home sections
              <>
                {SECTION_ORDER.map((key) => {
                  const maps = mapHome[key];
                  if (!Array.isArray(maps) || maps.length === 0) return null;
                  return (
                    <MapSection
                      key={key}
                      title={SECTION_LABELS[key]}
                      maps={maps}
                      isCountry={key === 'countryMaps'}
                      onMapPress={handleMapPress}
                      onHeartMap={secret ? handleHeartMap : undefined}
                      heartingMapId={heartingMap}
                      numCols={key === 'countryMaps' ? countryNumCols : numCols}
                      scrollRef={scrollRef}
                      scrollOffsetRef={scrollOffsetRef}
                    />
                  );
                })}

                {/* If nothing loaded at all */}
                {SECTION_ORDER.every(
                  (k) => !Array.isArray(mapHome[k]) || mapHome[k].length === 0
                ) && (
                  <View style={styles.emptyState}>
                    <Ionicons name="map-outline" size={48} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.emptyTitle}>No maps available</Text>
                  </View>
                )}
              </>
            )}

            {/* Bottom padding for tab bar */}
            <View style={{ height: 100 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1a0c',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontFamily: 'Lexend-Bold',
    color: 'white',
  },

  // Search
  searchWrap: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 25,
    paddingHorizontal: 16,
    gap: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  searchIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Lexend',
    color: '#333',
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // States
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.7)',
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Lexend-Medium',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#245734',
    borderRadius: 8,
  },
  retryBtnText: {
    fontSize: 14,
    fontFamily: 'Lexend-SemiBold',
    color: 'white',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Lexend-SemiBold',
    color: 'rgba(255,255,255,0.6)',
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.4)',
  },
});
