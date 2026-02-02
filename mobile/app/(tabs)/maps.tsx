import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/shared';
import { api } from '../../src/services/api';
import { commonStyles, spacing, fontSizes, borderRadius } from '../../src/styles/theme';

interface MapItem {
  slug: string;
  name: string;
  created_by: string;
  plays: number;
  hearts: number;
  locationCount: number;
  description?: string;
}

function MapCard({ map, onPress }: { map: MapItem; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.mapCard,
        pressed && commonStyles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.mapHeader}>
        <Text style={styles.mapName} numberOfLines={1}>
          {map.name}
        </Text>
        <View style={styles.mapStats}>
          <Ionicons name="heart" size={14} color={colors.error} />
          <Text style={styles.mapStatText}>{map.hearts}</Text>
        </View>
      </View>
      <Text style={styles.mapAuthor}>by {map.created_by}</Text>
      <View style={styles.mapFooter}>
        <Text style={styles.mapPlays}>{map.plays} plays</Text>
        <Text style={styles.mapLocations}>{map.locationCount} locations</Text>
      </View>
    </Pressable>
  );
}

export default function MapsScreen() {
  const router = useRouter();
  const [maps, setMaps] = useState<MapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  const fetchMaps = useCallback(async (query?: string) => {
    try {
      if (query && query.trim()) {
        const response = await api.searchMap(query);
        setMaps(response.maps);
      } else {
        const response = await api.mapHome();
        setMaps(response.maps);
      }
    } catch (error) {
      console.error('Failed to fetch maps:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMaps();
  }, []);

  const handleSearch = (text: string) => {
    setSearchQuery(text);

    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    const timeout = setTimeout(() => {
      fetchMaps(text);
    }, 500);

    setSearchTimeout(timeout);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMaps(searchQuery);
  }, [searchQuery]);

  const handleMapPress = (map: MapItem) => {
    // TODO: Navigate to map detail or start game
    router.push(`/game/singleplayer?map=${map.slug}`);
  };

  return (
    <SafeAreaView style={commonStyles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Community Maps</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search maps..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={handleSearch}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={commonStyles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={maps}
          keyExtractor={(item) => item.slug}
          renderItem={({ item }) => (
            <MapCard map={item} onPress={() => handleMapPress(item)} />
          )}
          contentContainerStyle={styles.listContent}
          numColumns={1}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="map-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyText}>No maps found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes['2xl'],
    fontWeight: 'bold',
    color: colors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: fontSizes.md,
    color: colors.text,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.md,
  },
  mapCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  mapName: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: spacing.md,
  },
  mapStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  mapStatText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  mapAuthor: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  mapFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mapPlays: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  mapLocations: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
  },
  emptyText: {
    fontSize: fontSizes.lg,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
});
