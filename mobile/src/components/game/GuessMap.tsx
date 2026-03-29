import React, { useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, Platform, GestureResponderEvent } from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import PinMarker from './PinMarker';

// Pre-create Asset objects (doesn't download yet)
const guessPinModule = require('../../../assets/marker-src.png');
const actualPinModule = require('../../../assets/marker-dest.png');
const opponentPinModule = require('../../../assets/marker-opp.png');

interface OpponentGuess {
  lat: number;
  lng: number;
  username: string;
  points?: number;
}

// extent = [west, south, east, north] i.e. [minLng, minLat, maxLng, maxLat]
type Extent = [number, number, number, number] | null;

/** Color based on points scored — matches web's getPointsColor (roundOverScreen.js:468-472) */
function getPointsColor(points: number): string {
  if (points >= 3000) return '#4CAF50'; // green
  if (points >= 1500) return '#FFC107'; // yellow
  return '#F44336';                      // red
}

interface GuessMapProps {
  guessPosition: { lat: number; lng: number } | null;
  actualPosition?: { lat: number; lng: number };
  onMapPress: (lat: number, lng: number) => void;
  isExpanded?: boolean;
  extent?: Extent;
  opponentGuesses?: OpponentGuess[];
  /** Points scored for the player's own guess (determines line color) */
  guessPoints?: number;
}

const TAP_SLOP = 10; // max px movement to count as tap
const TAP_MAX_MS = 300; // max duration to count as tap
const MARKER_SCALE = 1.1;

// World view fallback
const WORLD_REGION = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 100,
  longitudeDelta: 100,
};

/** Convert [west, south, east, north] extent to a react-native-maps region */
function extentToRegion(extent: [number, number, number, number]) {
  const [west, south, east, north] = extent;
  const latDelta = Math.abs(north - south) * 1.15; // 15% padding
  const lngDelta = Math.abs(east - west) * 1.15;
  return {
    latitude: (south + north) / 2,
    longitude: (west + east) / 2,
    latitudeDelta: Math.max(latDelta, 0.5),
    longitudeDelta: Math.max(lngDelta, 0.5),
  };
}

export default function GuessMap({
  guessPosition,
  actualPosition,
  onMapPress,
  isExpanded,
  extent,
  opponentGuesses,
  guessPoints,
}: GuessMapProps) {
  const mapRef = useRef<MapView>(null);
  const touchStart = useRef({ x: 0, y: 0, time: 0 });
  const lastFastTap = useRef(0);

  // When showing result, fit markers in view (or pan to actual if no guess)
  useEffect(() => {
    if (!actualPosition || !mapRef.current) return;

    if (guessPosition) {
      const coords = [
        { latitude: guessPosition.lat, longitude: guessPosition.lng },
        { latitude: actualPosition.lat, longitude: actualPosition.lng },
        ...(opponentGuesses ?? []).map((o) => ({ latitude: o.lat, longitude: o.lng })),
      ];
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 120, right: 120, bottom: 300, left: 120 },
        animated: true,
      });
    } else {
      // No guess — just show actual location
      mapRef.current.animateToRegion(
        {
          latitude: actualPosition.lat,
          longitude: actualPosition.lng,
          latitudeDelta: 5,
          longitudeDelta: 5,
        },
        400,
      );
    }
  }, [actualPosition, guessPosition]);

  const defaultRegion = extent ? extentToRegion(extent) : WORLD_REGION;

  // Reset map to extent/world view when a new round starts (actualPosition cleared)
  const prevActualPosition = useRef(actualPosition);
  useEffect(() => {
    if (prevActualPosition.current && !actualPosition && mapRef.current) {
      mapRef.current.animateToRegion(defaultRegion, 0);
    }
    prevActualPosition.current = actualPosition;
  }, [actualPosition]);

  // When extent changes (map switched), animate to the new region
  const prevExtent = useRef(extent);
  useEffect(() => {
    if (prevExtent.current !== extent && mapRef.current && !actualPosition) {
      mapRef.current.animateToRegion(defaultRegion, 300);
    }
    prevExtent.current = extent;
  }, [extent]);

  // Force correct region after map initialization (safety net for 0-height mount)
  const handleMapReady = useCallback(() => {
    if (mapRef.current && !actualPosition) {
      mapRef.current.animateToRegion(defaultRegion, 0);
    }
  }, [actualPosition, extent]);

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

  // Keep markers always mounted to avoid image reload delay between rounds.
  // Toggle opacity instead of mount/unmount.
  const guessCoord = guessPosition
    ? { latitude: guessPosition.lat, longitude: guessPosition.lng }
    : { latitude: 0, longitude: 0 };
  const actualCoord = actualPosition
    ? { latitude: actualPosition.lat, longitude: actualPosition.lng }
    : { latitude: 0, longitude: 0 };

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
        initialRegion={defaultRegion}
        onPress={handleMapPress}
        onMapReady={handleMapReady}
        moveOnMarkerPress={false}
        mapType="standard"
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <PinMarker
          key="guess"
          coordinate={guessCoord}
          imageSource={guessPinModule}
          scale={MARKER_SCALE}
          opacity={guessPosition ? 1 : 0}
        />
        <PinMarker
          key="actual"
          coordinate={actualCoord}
          imageSource={actualPinModule}
          scale={MARKER_SCALE}
          opacity={actualPosition ? 1 : 0}
        />

        {/* Opponent markers + lines to actual */}
        {actualPosition && opponentGuesses?.map((opp, i) => (
          <React.Fragment key={`opp-${i}`}>
            <PinMarker
              coordinate={{ latitude: opp.lat, longitude: opp.lng }}
              imageSource={opponentPinModule}
              scale={MARKER_SCALE}
              opacity={1}
            />
            <Polyline
              coordinates={[
                { latitude: opp.lat, longitude: opp.lng },
                { latitude: actualPosition.lat, longitude: actualPosition.lng },
              ]}
              strokeColor={getPointsColor(opp.points ?? 0)}
              strokeWidth={2}
            />
          </React.Fragment>
        ))}

        {/* Line between guess and actual */}
        {guessPosition && actualPosition && (
          <Polyline
            coordinates={[
              { latitude: guessPosition.lat, longitude: guessPosition.lng },
              { latitude: actualPosition.lat, longitude: actualPosition.lng },
            ]}
            strokeColor={getPointsColor(guessPoints ?? 0)}
            strokeWidth={3}
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
