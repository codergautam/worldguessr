import { useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, Platform, GestureResponderEvent } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { colors } from '../../shared';

interface GuessMapProps {
  guessPosition: { lat: number; lng: number } | null;
  actualPosition?: { lat: number; lng: number };
  onMapPress: (lat: number, lng: number) => void;
  isExpanded?: boolean;
}

const TAP_SLOP = 10; // max px movement to count as tap
const TAP_MAX_MS = 300; // max duration to count as tap

export default function GuessMap({
  guessPosition,
  actualPosition,
  onMapPress,
  isExpanded,
}: GuessMapProps) {
  const mapRef = useRef<MapView>(null);
  const touchStart = useRef({ x: 0, y: 0, time: 0 });
  const lastFastTap = useRef(0);

  // When showing result, fit both markers in view
  useEffect(() => {
    if (actualPosition && guessPosition && mapRef.current) {
      const coordinates = [
        { latitude: guessPosition.lat, longitude: guessPosition.lng },
        { latitude: actualPosition.lat, longitude: actualPosition.lng },
      ];

      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  }, [actualPosition, guessPosition]);

  // Fast tap detection via raw touch events (bypasses MapView's ~300ms onPress delay)
  const handleTouchStart = useCallback((e: GestureResponderEvent) => {
    touchStart.current = {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      time: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback(async (e: GestureResponderEvent) => {
    if (actualPosition) return;

    const dx = Math.abs(e.nativeEvent.pageX - touchStart.current.x);
    const dy = Math.abs(e.nativeEvent.pageY - touchStart.current.y);
    const dt = Date.now() - touchStart.current.time;

    if (dx < TAP_SLOP && dy < TAP_SLOP && dt < TAP_MAX_MS && mapRef.current) {
      try {
        const coord = await (mapRef.current as any).coordinateForPoint({
          x: e.nativeEvent.locationX,
          y: e.nativeEvent.locationY,
        });
        if (coord) {
          lastFastTap.current = Date.now();
          onMapPress(coord.latitude, coord.longitude);
        }
      } catch {
        // coordinateForPoint failed, fall through to MapView onPress
      }
    }
  }, [actualPosition, onMapPress]);

  // Fallback: MapView's built-in onPress (slower but reliable)
  const handleMapPress = useCallback((event: any) => {
    if (actualPosition) return;
    // Skip if fast tap already handled this touch
    if (Date.now() - lastFastTap.current < 500) return;

    const { latitude, longitude } = event.nativeEvent.coordinate;
    onMapPress(latitude, longitude);
  }, [actualPosition, onMapPress]);

  return (
    <View
      style={styles.container}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: 20,
          longitude: 0,
          latitudeDelta: 100,
          longitudeDelta: 100,
        }}
        onPress={handleMapPress}
        mapType="standard"
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {/* Guess marker */}
        {guessPosition && (
          <Marker
            coordinate={{
              latitude: guessPosition.lat,
              longitude: guessPosition.lng,
            }}
            pinColor={colors.primary}
            title="Your guess"
          />
        )}

        {/* Actual location marker */}
        {actualPosition && (
          <Marker
            coordinate={{
              latitude: actualPosition.lat,
              longitude: actualPosition.lng,
            }}
            pinColor={colors.success}
            title="Actual location"
          />
        )}

        {/* Line between guess and actual */}
        {guessPosition && actualPosition && (
          <Polyline
            coordinates={[
              { latitude: guessPosition.lat, longitude: guessPosition.lng },
              { latitude: actualPosition.lat, longitude: actualPosition.lng },
            ]}
            strokeColor={colors.error}
            strokeWidth={2}
            lineDashPattern={[10, 5]}
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
