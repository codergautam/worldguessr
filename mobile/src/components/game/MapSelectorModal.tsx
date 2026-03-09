import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Switch,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api, MapItem } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { emitHeartUpdate } from '../../store/heartSync';
import MapSection, { SECTION_ORDER, SECTION_LABELS } from '../maps/MapSection';
import MapDetailView from '../maps/MapDetailView';

interface MapSelectorModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectMap: (slug: string, name: string) => void;
  currentMapSlug: string;
  nmpzEnabled: boolean;
  onNmpzToggle: (v: boolean) => void;
  timerEnabled: boolean;
  onTimerToggle: (v: boolean) => void;
  timerDuration: number;
  onTimerDurationChange: (s: number) => void;
  /** Optional rounds stepper (for party mode) */
  rounds?: number;
  onRoundsChange?: (r: number) => void;
}

interface SelectedMapInfo {
  slug: string;
  hearts?: number;
  hearted?: boolean;
}

export default function MapSelectorModal({
  visible,
  onClose,
  onSelectMap,
  currentMapSlug,
  nmpzEnabled,
  onNmpzToggle,
  timerEnabled,
  onTimerToggle,
  timerDuration,
  onTimerDurationChange,
  rounds,
  onRoundsChange,
}: MapSelectorModalProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { secret } = useAuthStore();

  const [mapHome, setMapHome] = useState<Record<string, MapItem[]>>({});
  const [searchResults, setSearchResults] = useState<MapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);

  // When a map is tapped, show its detail view inline
  const [selectedMap, setSelectedMap] = useState<SelectedMapInfo | null>(null);
  // Keep a ref to the selected map so detail view stays mounted during exit animation
  const selectedMapRef = useRef<SelectedMapInfo | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current; // 0 = list, 1 = detail

  const isLandscape = width > 600;
  const numCols = isLandscape ? 3 : 2;
  const countryNumCols = isLandscape ? 4 : 3;

  // Reset detail view when modal closes
  useEffect(() => {
    if (!visible) {
      setSelectedMap(null);
      selectedMapRef.current = null;
      slideAnim.setValue(0);
    }
  }, [visible]);

  const showDetail = useCallback((map: SelectedMapInfo) => {
    selectedMapRef.current = map;
    setSelectedMap(map);
    slideAnim.setValue(0);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const hideDetail = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setSelectedMap(null);
      selectedMapRef.current = null;
    });
  }, [slideAnim]);

  // Fetch map home data when modal opens
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    api.mapHome(secret || undefined)
      .then((data) => setMapHome(data as Record<string, MapItem[]>))
      .catch((e) => console.error('Failed to fetch maps:', e))
      .finally(() => setLoading(false));
  }, [visible, secret]);

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

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
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  }, []);

  // Navigate to inline detail view with slide animation
  const handleMapPress = useCallback((map: MapItem) => {
    const slug = map.slug || map.countryMap;
    showDetail({
      slug: slug!,
      hearts: map.hearts,
      hearted: map.hearted,
    });
  }, [showDetail]);

  // "Select Map" from detail view
  const handleDetailPlay = useCallback((slug: string, name: string) => {
    selectedMapRef.current = null;
    setSelectedMap(null);
    slideAnim.setValue(0);
    onSelectMap(slug, name);
  }, [onSelectMap, slideAnim]);

  // Heart functionality (same as maps tab)
  const [heartingMap, setHeartingMap] = useState('');
  const lastHeartTimeRef = useRef(0);
  const handleHeartMap = useCallback(async (map: MapItem) => {
    if (!secret) return;
    if (!map.id || heartingMap) return;
    const now = Date.now();
    if (now - lastHeartTimeRef.current < 500) return;
    lastHeartTimeRef.current = now;
    setHeartingMap(map.id);

    const newHearted = !map.hearted;
    const newHearts = map.hearts + (newHearted ? 1 : -1);

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
        updateMaps(map.hearted!, map.hearts);
      }
    } catch (e) {
      console.error('Heart map error:', e);
      updateMaps(map.hearted!, map.hearts);
    } finally {
      setHeartingMap('');
    }
  }, [secret, heartingMap]);

  const isSearching = searchQuery.trim().length >= 3;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* List view - slides left when detail is shown */}
        <Animated.View style={[
          styles.slidePanel,
          {
            transform: [{
              translateX: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -width],
              }),
            }],
          },
        ]}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Game Options</Text>
              <Pressable
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
                onPress={onClose}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>

            <ScrollView
              ref={scrollRef}
              onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={16}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* ── Game Options ── */}
              <View style={styles.optionsCard}>
                {/* Rounds (party mode only) */}
                {onRoundsChange && rounds !== undefined && (
                  <>
                    <View style={styles.optionRow}>
                      <View style={styles.optionLabel}>
                        <Ionicons name="repeat-outline" size={20} color="#fff" />
                        <Text style={styles.optionText}>Rounds</Text>
                      </View>
                      <View style={styles.stepperRowInline}>
                        <Pressable
                          style={({ pressed }) => [styles.stepperBtn, pressed && { opacity: 0.6 }, rounds <= 1 && { opacity: 0.3 }]}
                          onPress={() => onRoundsChange(Math.max(1, rounds - 1))}
                          disabled={rounds <= 1}
                        >
                          <Ionicons name="remove" size={20} color="#fff" />
                        </Pressable>
                        <Text style={styles.stepperValue}>{rounds}</Text>
                        <Pressable
                          style={({ pressed }) => [styles.stepperBtn, pressed && { opacity: 0.6 }, rounds >= 20 && { opacity: 0.3 }]}
                          onPress={() => onRoundsChange(Math.min(20, rounds + 1))}
                          disabled={rounds >= 20}
                        >
                          <Ionicons name="add" size={20} color="#fff" />
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.divider} />
                  </>
                )}
                {/* NMPZ Toggle */}
                <View style={styles.optionRow}>
                  <View style={styles.optionLabel}>
                    <Ionicons name="eye-off-outline" size={20} color="#fff" />
                    <Text style={styles.optionText}>NMPZ</Text>
                    <Text style={styles.optionSubtext}>(No Move, Pan, Zoom)</Text>
                  </View>
                  <Switch
                    value={nmpzEnabled}
                    onValueChange={onNmpzToggle}
                    trackColor={{ false: 'rgba(255,255,255,0.2)', true: '#4CAF50' }}
                    thumbColor="#fff"
                  />
                </View>

                {/* Timer Toggle */}
                <View style={styles.divider} />
                <View style={styles.optionRow}>
                  <View style={styles.optionLabel}>
                    <Ionicons name="timer-outline" size={20} color="#fff" />
                    <Text style={styles.optionText}>Timer</Text>
                  </View>
                  <Switch
                    value={timerEnabled}
                    onValueChange={onTimerToggle}
                    trackColor={{ false: 'rgba(255,255,255,0.2)', true: '#4CAF50' }}
                    thumbColor="#fff"
                  />
                </View>

                {/* Timer Duration Stepper */}
                {timerEnabled && (
                  <View style={styles.stepperRow}>
                    <Pressable
                      style={({ pressed }) => [styles.stepperBtn, pressed && { opacity: 0.6 }, timerDuration <= 10 && { opacity: 0.3 }]}
                      onPress={() => onTimerDurationChange(Math.max(10, timerDuration - 10))}
                      disabled={timerDuration <= 10}
                    >
                      <Ionicons name="remove" size={20} color="#fff" />
                    </Pressable>
                    <Text style={styles.stepperValue}>{timerDuration}s</Text>
                    <Pressable
                      style={({ pressed }) => [styles.stepperBtn, pressed && { opacity: 0.6 }, timerDuration >= 300 && { opacity: 0.3 }]}
                      onPress={() => onTimerDurationChange(Math.min(300, timerDuration + 10))}
                      disabled={timerDuration >= 300}
                    >
                      <Ionicons name="add" size={20} color="#fff" />
                    </Pressable>
                  </View>
                )}
              </View>

              {/* ── Map Selection ── */}
              <View style={styles.sectionHeader}>
                <View style={styles.sectionAccent} />
                <Text style={styles.sectionHeaderText}>Select Map</Text>
              </View>

              {/* All Countries option */}
              <Pressable
                style={({ pressed }) => [
                  styles.allCountriesTile,
                  currentMapSlug === 'all' && styles.allCountriesTileActive,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => onSelectMap('all', 'All Countries')}
              >
                <LinearGradient
                  colors={['#1a4423', '#245734']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <Ionicons name="globe-outline" size={24} color="#fff" />
                <Text style={styles.allCountriesText}>All Countries</Text>
                {currentMapSlug === 'all' && (
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                )}
              </Pressable>

              {/* Search */}
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={18} color="#666" />
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
                    <Ionicons name="close-circle" size={18} color="#999" />
                  </Pressable>
                )}
              </View>

              {/* Map Sections */}
              {loading ? (
                <View style={styles.centered}>
                  <ActivityIndicator size="large" color="#4CAF50" />
                  <Text style={styles.loadingText}>Loading maps...</Text>
                </View>
              ) : isSearching ? (
                <>
                  {searchResults.length > 0 && (
                    <MapSection
                      title="Search Results"
                      maps={searchResults}
                      onMapPress={handleMapPress}
                      onHeartMap={secret ? handleHeartMap : undefined}
                      heartingMapId={heartingMap}
                      numCols={numCols}
                    />
                  )}
                  {!searchLoading && searchResults.length === 0 && (
                    <View style={styles.centered}>
                      <Ionicons name="search" size={32} color="rgba(255,255,255,0.3)" />
                      <Text style={styles.loadingText}>No maps found</Text>
                    </View>
                  )}
                  {searchLoading && (
                    <ActivityIndicator size="small" color="white" style={{ marginTop: 12 }} />
                  )}
                </>
              ) : (
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
                </>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
        </Animated.View>

        {/* Detail view - slides in from the right */}
        {(selectedMap || selectedMapRef.current) && (
          <Animated.View style={[
            styles.slidePanel,
            styles.detailPanel,
            { paddingTop: insets.top },
            {
              transform: [{
                translateX: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [width, 0],
                }),
              }],
            },
          ]}>
            <MapDetailView
              slug={(selectedMap || selectedMapRef.current)!.slug}
              onBack={hideDetail}
              onPlay={handleDetailPlay}
              playLabel="SELECT MAP"
              initialHearts={(selectedMap || selectedMapRef.current)!.hearts}
              initialHearted={(selectedMap || selectedMapRef.current)!.hearted}
            />
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1a0c',
    overflow: 'hidden',
  },
  slidePanel: {
    flex: 1,
  },
  detailPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0a1a0c',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Lexend-Bold',
    color: '#fff',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  // Game Options
  optionsCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  optionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionText: {
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
    color: '#fff',
  },
  optionSubtext: {
    fontSize: 12,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.4)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 12,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 16,
  },
  stepperRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValue: {
    fontSize: 18,
    fontFamily: 'Lexend-Bold',
    color: '#4CAF50',
    minWidth: 56,
    textAlign: 'center',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionAccent: {
    width: 4,
    height: 22,
    borderRadius: 2,
    backgroundColor: '#3a7a52',
  },
  sectionHeaderText: {
    fontSize: 20,
    fontFamily: 'Lexend-SemiBold',
    color: '#fff',
  },

  // All Countries tile
  allCountriesTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  allCountriesTileActive: {
    borderColor: '#4CAF50',
  },
  allCountriesText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
    color: '#fff',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 25,
    paddingHorizontal: 16,
    gap: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Lexend',
    color: '#333',
  },

  // States
  centered: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: 'Lexend',
    color: 'rgba(255,255,255,0.7)',
  },
});
