import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MapItem } from '../../services/api';

export function formatNumber(n: number): string {
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

export default function MapTile({
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

export const tileStyles = StyleSheet.create({
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
});

const styles = tileStyles;
