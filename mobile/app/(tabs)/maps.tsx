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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/shared';
import { api, MapItem } from '../../src/services/api';

// ── Section config ──────────────────────────────────────────
const SECTION_ORDER = ['countryMaps', 'spotlight', 'popular', 'recent'] as const;
const SECTION_LABELS: Record<string, string> = {
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
  isCountry,
  tileWidth,
}: {
  map: MapItem;
  onPress: () => void;
  isCountry?: boolean;
  tileWidth: number;
}) {
  const flagUrl = isCountry && map.countryMap
    ? `https://flagcdn.com/h240/${map.countryMap.toLowerCase()}.png`
    : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        { width: tileWidth },
        pressed && styles.tilePressed,
      ]}
      onPress={onPress}
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
          <Text style={[styles.tileName, isCountry && styles.tileNameCountry]} numberOfLines={2}>
            {map.name}
          </Text>
          {!isCountry && (
            <View style={styles.tileHearts}>
              <Text style={styles.tileHeartsText}>{formatNumber(map.hearts)}</Text>
              <Ionicons name="heart" size={12} color="#dc3545" />
            </View>
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
  numCols,
}: {
  title: string;
  maps: MapItem[];
  isCountry?: boolean;
  onMapPress: (map: MapItem) => void;
  numCols: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const GAP = 10;
  const tileWidth = gridWidth > 0
    ? Math.floor((gridWidth - GAP * (numCols - 1)) / numCols)
    : 0;
  const defaultVisible = numCols * 2;
  const displayedMaps = expanded ? maps : maps.slice(0, defaultVisible);
  const showExpandBtn = maps.length > defaultVisible;

  return (
    <View style={styles.section}>
      {/* Section title with green accent bar */}
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionAccent} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>

      {/* Section card */}
      <View style={styles.sectionCard}>
        <View
          style={styles.tileGrid}
          onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
        >
          {tileWidth > 0 && displayedMaps.map((map, i) => (
            <MapTile
              key={map.id || map.slug || i}
              map={map}
              onPress={() => onMapPress(map)}
              isCountry={isCountry}
              tileWidth={tileWidth}
            />
          ))}
        </View>

        {showExpandBtn && (
          <Pressable
            style={({ pressed }) => [styles.showMoreBtn, pressed && { opacity: 0.8 }]}
            onPress={() => setExpanded(!expanded)}
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
        )}
      </View>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────
export default function MapsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [mapHome, setMapHome] = useState<Record<string, MapItem[]>>({});
  const [searchResults, setSearchResults] = useState<MapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const numCols = width > 600 ? 3 : 2;

  const fetchMapHome = useCallback(async () => {
    setError(false);
    try {
      const data = await api.mapHome();
      setMapHome(data as Record<string, MapItem[]>);
    } catch (e) {
      console.error('Failed to fetch maps:', e);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMapHome();
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
      fetchMapHome();
    }
  }, [searchQuery, fetchMapHome, handleSearch]);

  const handleMapPress = (map: MapItem) => {
    const slug = map.countryMap || map.slug;
    router.push(`/game/singleplayer?map=${slug}` as any);
  };

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
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
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
                        numCols={numCols}
                      />
                    )}
                    {hasCommunity && (
                      <MapSection
                        title="Search Results"
                        maps={searchResults}
                        onMapPress={handleMapPress}
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
                      numCols={numCols}
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
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
    gap: 3,
    backgroundColor: 'rgba(220,53,69,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tileHeartsText: {
    fontSize: 11,
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
