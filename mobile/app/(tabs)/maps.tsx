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
  Image,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/shared';
import { api, MapItem } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { onHeartUpdate, emitHeartUpdate } from '../../src/store/heartSync';

// ── Section config ──────────────────────────────────────────
const SECTION_ORDER = ['myMaps', 'likedMaps', 'countryMaps', 'spotlight', 'popular', 'recent'] as const;
const SECTION_LABELS: Record<string, string> = {
  myMaps: 'My Maps',
  likedMaps: 'Liked Maps',
  countryMaps: 'Country Maps',
  spotlight: 'Spotlight',
  popular: 'Popular',
  recent: 'Recent',
};

// ── Helpers ─────────────────────────────────────────────────
function formatNumber(n: number): string {
  if (!n || isNaN(n)) return '0';
  if (n < 1000) return n.toString();
  const units = ['K', 'M', 'B'];
  const tier = (Math.log10(n) / 3) | 0;
  const suffix = units[tier - 1];
  const scale = Math.pow(10, tier * 3);
  const scaled = n / scale;
  const precision = Math.max(0, 1 - Math.floor(Math.log10(scaled)));
  let s = scaled.toFixed(precision).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return `${s}${suffix}`;
}

function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// ── Map Tile Component ──────────────────────────────────────
function MapTile({
  map,
  onPress,
  onHeart,
  isCountry,
  tileWidth,
  heartDisabled,
}: {
  map: MapItem;
  onPress: () => void;
  onHeart?: () => void;
  isCountry?: boolean;
  tileWidth: number;
  heartDisabled?: boolean;
}) {
  const flagUrl = isCountry && map.countryMap
    ? `https://flagcdn.com/h240/${map.countryMap.toLowerCase()}.png`
    : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        { width: tileWidth },
        isCountry && styles.tileCountry,
        pressed && styles.tilePressed,
      ]}
      onPress={onPress}
      onLongPress={() => Alert.alert(map.name)}
    >
      {/* Country flag background */}
      {flagUrl && (
        <>
          <Image
            source={{ uri: flagUrl }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.4)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        </>
      )}

      {/* Content */}
      <View style={styles.tileContent}>
        {/* Top: name + hearts */}
        <View style={styles.tileTop}>
          <Text style={[styles.tileName, isCountry && styles.tileNameCountry]} numberOfLines={3}>
            {map.name}
          </Text>
          {!isCountry && (
            <Pressable
              style={({ pressed }) => [styles.tileHearts, map.hearted && onHeart && styles.tileHeartsActive, heartDisabled && styles.tileHeartsDisabled, !onHeart && styles.tileHeartsLoggedOut, pressed && !heartDisabled && onHeart && { opacity: 0.6 }]}
              onPress={(e) => { e.stopPropagation(); onHeart?.(); }}
              disabled={heartDisabled || !onHeart}
              hitSlop={6}
            >
              <Text style={styles.tileHeartsText}>{formatNumber(map.hearts)}</Text>
              <Ionicons name={map.hearted ? "heart" : "heart-outline"} size={16} color={map.hearted ? "#ff4d6d" : "#dc3545"} />
            </Pressable>
          )}
        </View>

        {/* Bottom: author + locations */}
        {!isCountry && map.created_by_name && (
          <View style={styles.tileBottom}>
            <View style={styles.tileAuthorRow}>
              <Ionicons name="person" size={11} color="rgba(255,255,255,0.6)" />
              <Text style={styles.tileAuthor} numberOfLines={1}>
                {map.created_by_name}
              </Text>
              {map.locations != null && (
                <>
                  <Text style={styles.tileDot}> · </Text>
                  <Ionicons name="location" size={11} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.tileLocCount}>{formatNumber(map.locations)}</Text>
                </>
              )}
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── Section Component ───────────────────────────────────────
function MapSection({
  title,
  maps,
  isCountry,
  onMapPress,
  onHeartMap,
  heartingMapId,
  numCols,
  scrollRef,
  scrollOffsetRef,
}: {
  title: string;
  maps: MapItem[];
  isCountry?: boolean;
  onMapPress: (map: MapItem) => void;
  onHeartMap?: (map: MapItem) => void;
  heartingMapId?: string;
  numCols: number;
  scrollRef?: React.RefObject<ScrollView | null>;
  scrollOffsetRef?: React.RefObject<number>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasExpanded, setHasExpanded] = useState(false); // defer rendering until first open
  const [gridWidth, setGridWidth] = useState(0);
  const animValue = useRef(new Animated.Value(0)).current;

  const GAP = 10;
  const tileWidth = gridWidth > 0
    ? Math.floor((gridWidth - GAP * (numCols - 1)) / numCols)
    : 0;
  const defaultVisible = numCols * 2;
  const baseMaps = maps.slice(0, defaultVisible);
  const extraMaps = maps.slice(defaultVisible);
  const showExpandBtn = extraMaps.length > 0;

  // Calculate extra section height from tile dimensions
  const TILE_HEIGHT = isCountry ? 80 : 110;
  const extraRows = Math.ceil(extraMaps.length / numCols);
  const extraHeight = extraRows * TILE_HEIGHT + (extraRows - 1) * GAP + GAP; // +GAP for top padding

  const sectionRef = useRef<View>(null);

  const scrollAnimValue = useRef(new Animated.Value(0)).current;

  const toggleExpand = () => {
    const toExpanded = !expanded;
    setExpanded(toExpanded);

    if (toExpanded && !hasExpanded) {
      // First expand: render tiles first, then animate on next frame
      setHasExpanded(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          startAnimation(true);
        });
      });
      return;
    }

    startAnimation(toExpanded);
  };

  const startAnimation = (toExpanded: boolean) => {
    // Scale duration by height: ~400px/s max speed, minimum 400ms, max 1800ms
    const duration = Math.max(400, Math.min((extraHeight / 400) * 1000, 1800));
    const easingFn = Easing.bezier(0.4, 0.0, 0.2, 1);

    if (!toExpanded && scrollRef?.current && scrollOffsetRef) {
      // Measure before animating, then animate scroll in parallel with collapse
      const currentOffset = scrollOffsetRef.current;
      sectionRef.current?.measureLayout(
        scrollRef.current as any,
        (_x, sectionY) => {
          const targetOffset = sectionY < currentOffset
            ? Math.max(0, currentOffset - extraHeight)
            : currentOffset;

          if (targetOffset !== currentOffset) {
            scrollAnimValue.setValue(currentOffset);
            const listenerId = scrollAnimValue.addListener(({ value }) => {
              scrollRef.current?.scrollTo({ y: value, animated: false });
            });

            Animated.parallel([
              Animated.timing(animValue, { toValue: 0, duration, easing: easingFn, useNativeDriver: false }),
              Animated.timing(scrollAnimValue, { toValue: targetOffset, duration, easing: easingFn, useNativeDriver: false }),
            ]).start(() => {
              scrollAnimValue.removeListener(listenerId);
            });
          } else {
            Animated.timing(animValue, { toValue: 0, duration, easing: easingFn, useNativeDriver: false }).start();
          }
        },
        () => {
          Animated.timing(animValue, { toValue: 0, duration, easing: easingFn, useNativeDriver: false }).start();
        },
      );
    } else {
      Animated.timing(animValue, {
        toValue: toExpanded ? 1 : 0,
        duration,
        easing: easingFn,
        useNativeDriver: false,
      }).start();
    }
  };

  const animatedHeight = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, extraHeight],
  });

  return (
    <View ref={sectionRef} style={[styles.section, tileWidth === 0 && { opacity: 0 }]}>
      {/* Section title with green accent bar */}
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionAccent} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>

      {/* Section card */}
      <View style={styles.sectionCard}>
        <View
          style={[styles.tileGrid, tileWidth === 0 && { minHeight: 1 }]}
          onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
        >
          {tileWidth > 0 && baseMaps.map((map, i) => (
            <MapTile
              key={map.id || map.slug || i}
              map={map}
              onPress={() => onMapPress(map)}
              onHeart={onHeartMap ? () => onHeartMap(map) : undefined}
              heartDisabled={heartingMapId === (map.id || map.slug)}
              isCountry={isCountry}
              tileWidth={tileWidth}
            />
          ))}
        </View>

        {tileWidth > 0 && showExpandBtn && (
          <>
            <Animated.View style={{ height: animatedHeight, overflow: 'hidden' }}>
              <View style={[styles.tileGrid, { paddingTop: GAP }]}>
                {hasExpanded && tileWidth > 0 && extraMaps.map((map, i) => (
                  <MapTile
                    key={map.id || map.slug || i}
                    map={map}
                    onPress={() => onMapPress(map)}
                    onHeart={onHeartMap ? () => onHeartMap(map) : undefined}
                    heartDisabled={heartingMapId === (map.id || map.slug)}
                    isCountry={isCountry}
                    tileWidth={tileWidth}
                  />
                ))}
              </View>
            </Animated.View>

            <Pressable
              style={({ pressed }) => [styles.showMoreBtn, pressed && { opacity: 0.8 }]}
              onPress={toggleExpand}
            >
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="white"
              />
              <Text style={styles.showMoreText}>
                {expanded ? 'Show Less' : 'Show All'}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

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
            <Pressable style={styles.retryBtn} onPress={fetchMapHome}>
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
    backgroundColor: '#000',
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

  // Section
  section: {
    marginBottom: 28,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  sectionAccent: {
    width: 4,
    height: 22,
    borderRadius: 2,
    backgroundColor: '#3a7a52',
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Lexend-SemiBold',
    color: 'white',
  },
  sectionCard: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  // Tile
  tile: {
    height: 110,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  tileCountry: {
    height: 80,
    padding: 10,
  },
  tilePressed: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderColor: '#245734',
  },
  tileContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  tileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
  },
  tileName: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Lexend-SemiBold',
    color: 'white',
    lineHeight: 18,
  },
  tileNameCountry: {
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 4,
  },
  tileHearts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(220,53,69,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tileHeartsActive: {
    backgroundColor: 'rgba(220,53,69,0.35)',
  },
  tileHeartsDisabled: {
    opacity: 0.3,
    backgroundColor: 'rgba(150,150,150,0.2)',
  },
  tileHeartsLoggedOut: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  tileHeartsText: {
    fontSize: 12,
    fontFamily: 'Lexend-Medium',
    color: 'rgba(255,255,255,0.9)',
  },
  tileBottom: {
    marginTop: 'auto',
  },
  tileAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tileAuthor: {
    fontSize: 12,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.6)',
    flexShrink: 1,
  },
  tileDot: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  tileLocCount: {
    fontSize: 12,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.6)',
  },

  // Show more
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  showMoreText: {
    fontSize: 14,
    fontFamily: 'Lexend-Medium',
    color: 'white',
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
