import { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MapItem } from '../../services/api';
import MapTile from './MapTile';

export const SECTION_ORDER = ['myMaps', 'likedMaps', 'countryMaps', 'spotlight', 'popular', 'recent'] as const;
export const SECTION_LABELS: Record<string, string> = {
  myMaps: 'My Maps',
  likedMaps: 'Liked Maps',
  countryMaps: 'Country Maps',
  spotlight: 'Spotlight',
  popular: 'Popular',
  recent: 'Recent',
};

export default function MapSection({
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
  const [hasExpanded, setHasExpanded] = useState(false);
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

  const TILE_HEIGHT = isCountry ? 80 : 110;
  const extraRows = Math.ceil(extraMaps.length / numCols);
  const extraHeight = extraRows * TILE_HEIGHT + (extraRows - 1) * GAP + GAP;

  const sectionRef = useRef<View>(null);
  const scrollAnimValue = useRef(new Animated.Value(0)).current;

  const toggleExpand = () => {
    const toExpanded = !expanded;
    setExpanded(toExpanded);

    if (toExpanded && !hasExpanded) {
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
    const duration = Math.max(400, Math.min((extraHeight / 400) * 1000, 1800));
    const easingFn = Easing.bezier(0.4, 0.0, 0.2, 1);

    if (!toExpanded && scrollRef?.current && scrollOffsetRef) {
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
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionAccent} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>

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

export const sectionStyles = StyleSheet.create({
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
});

const styles = sectionStyles;
