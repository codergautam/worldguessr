import React, { useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, GestureResponderEvent } from 'react-native';
import MapView, { Marker, Polyline, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
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
  color?: string;
}

interface PlayerGuess {
  id: string;
  lat: number;
  lng: number;
  username: string;
  points?: number;
  color: string;
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
  countryGuessPosition?: { lat: number; lng: number } | null;
  actualPosition?: { lat: number; lng: number };
  onMapPress: (lat: number, lng: number) => void;
  isExpanded?: boolean;
  extent?: Extent;
  opponentGuesses?: OpponentGuess[];
  playerGuesses?: PlayerGuess[];
  /** Points scored for the player's own guess (determines line color) */
  guessPoints?: number;
  /**
   * When true, the no-guess result reveal skips the cinematic two-step zoom
   * and just snaps the map to a sensible region. Used by the country / continent
   * guesser variants where the map is fading in (not sliding up), so a long
   * camera pulse on top of an already-static reveal felt heavy.
   */
  instantReveal?: boolean;
  /** Hint circle to draw while guessing (offset center + radius in meters). */
  hintCircle?: { center: { lat: number; lng: number }; radiusMeters: number } | null;
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

type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

// MapKit's setRegion throws (SIGABRT) on NaN / out-of-range regions. Clamp to
// valid bounds and drop anything non-finite — valid regions pass through
// unchanged, so normal camera behavior is untouched.
function safeRegion(r: Region | null | undefined): Region | null {
  if (!r) return null;
  const { latitude, longitude, latitudeDelta, longitudeDelta } = r;
  if (![latitude, longitude, latitudeDelta, longitudeDelta].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return null;
  }
  return {
    latitude: Math.max(-90, Math.min(90, latitude)),
    longitude: Math.max(-180, Math.min(180, longitude)),
    latitudeDelta: Math.max(0.002, Math.min(180, latitudeDelta)),
    longitudeDelta: Math.max(0.002, Math.min(360, longitudeDelta)),
  };
}

function animateRegionSafe(map: MapView | null, r: Region | null | undefined, duration: number) {
  const safe = safeRegion(r);
  if (map && safe) map.animateToRegion(safe, duration);
}

export default function GuessMap({
  guessPosition,
  countryGuessPosition,
  actualPosition,
  onMapPress,
  isExpanded,
  extent,
  opponentGuesses,
  playerGuesses,
  guessPoints,
  instantReveal,
  hintCircle,
}: GuessMapProps) {
  const mapRef = useRef<MapView>(null);
  const touchStart = useRef({ x: 0, y: 0, time: 0 });
  const lastFastTap = useRef(0);

  // When showing result, fit markers in view (or zoom in to actual if no
  // guess). The no-guess path uses a longer two-step animation so country-
  // mode reveals feel as cinematic as the classic-mode "zoom out to fit
  // both pins" payoff.
  useEffect(() => {
    if (!actualPosition || !mapRef.current) return;

    if (guessPosition || countryGuessPosition) {
      const coords = [
        ...(guessPosition ? [{ latitude: guessPosition.lat, longitude: guessPosition.lng }] : []),
        ...(countryGuessPosition
          ? [{ latitude: countryGuessPosition.lat, longitude: countryGuessPosition.lng }]
          : []),
        { latitude: actualPosition.lat, longitude: actualPosition.lng },
        ...(opponentGuesses ?? []).map((o) => ({ latitude: o.lat, longitude: o.lng })),
        ...(playerGuesses ?? []).map((p) => ({ latitude: p.lat, longitude: p.lng })),
      ].filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));
      if (coords.length > 0) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 120, right: 120, bottom: 300, left: 120 },
          animated: true,
        });
      }
    } else {
      // No guess (country / continent guesser): a single slow zoom from
      // wherever the map currently sits down onto the actual location.
      // We deliberately run this longer than the layer's own fade-in
      // (1200 ms) so the camera is still gliding when the dim clears,
      // giving the result a calmer cinematic feel.
      animateRegionSafe(
        mapRef.current,
        {
          latitude: actualPosition.lat,
          longitude: actualPosition.lng,
          latitudeDelta: 8,
          longitudeDelta: 8,
        },
        instantReveal ? 1500 : 1100,
      );
    }
  }, [actualPosition, guessPosition, countryGuessPosition, opponentGuesses, playerGuesses, instantReveal]);

  // Pan to the hint circle when it first appears (during guessing). Deduped by
  // center so re-renders don't keep re-panning; reset when the hint clears.
  const pannedHintKey = useRef<string | null>(null);
  useEffect(() => {
    if (!hintCircle) {
      pannedHintKey.current = null;
      return;
    }
    if (actualPosition || !mapRef.current) return; // result reveal owns the camera
    const key = `${hintCircle.center.lat},${hintCircle.center.lng}`;
    if (pannedHintKey.current === key) return;
    pannedHintKey.current = key;
    const radiusDeg = hintCircle.radiusMeters / 111000;
    const delta = Math.min(150, radiusDeg * 2.6);
    animateRegionSafe(
      mapRef.current,
      {
        latitude: hintCircle.center.lat,
        longitude: hintCircle.center.lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      },
      600,
    );
  }, [hintCircle, actualPosition]);

  const defaultRegion = extent ? extentToRegion(extent) : WORLD_REGION;

  // Reset map to extent/world view when a new round starts (actualPosition cleared)
  const prevActualPosition = useRef(actualPosition);
  useEffect(() => {
    if (prevActualPosition.current && !actualPosition && mapRef.current) {
      animateRegionSafe(mapRef.current, defaultRegion, 0);
    }
    prevActualPosition.current = actualPosition;
  }, [actualPosition]);

  // When extent changes (map switched), animate to the new region
  const prevExtent = useRef(extent);
  useEffect(() => {
    if (prevExtent.current !== extent && mapRef.current && !actualPosition) {
      animateRegionSafe(mapRef.current, defaultRegion, 300);
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
  const countryGuessCoord = countryGuessPosition
    ? { latitude: countryGuessPosition.lat, longitude: countryGuessPosition.lng }
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
        provider={PROVIDER_GOOGLE}
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
        {/* ALWAYS mounted — react-native-maps on the New Architecture crashes
            (-[AIRMap insertReactSubview:atIndex:] → NSArray insertObject out of
            bounds, SIGABRT) when map children are added/removed dynamically.
            Like the markers, we keep it mounted and toggle visibility via props. */}
        <Circle
          center={
            hintCircle
              ? { latitude: hintCircle.center.lat, longitude: hintCircle.center.lng }
              : { latitude: 0, longitude: 0 }
          }
          radius={hintCircle ? hintCircle.radiusMeters : 1}
          strokeColor={hintCircle ? 'rgba(255,193,7,0.95)' : 'transparent'}
          strokeWidth={hintCircle ? 3 : 0}
          fillColor={hintCircle ? 'rgba(255,193,7,0.22)' : 'transparent'}
          zIndex={50}
        />
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
        <PinMarker
          key="country-guess"
          coordinate={countryGuessCoord}
          imageSource={guessPinModule}
          scale={MARKER_SCALE}
          opacity={countryGuessPosition ? 1 : 0}
        />

        {/* Player-colored markers for multiplayer reveals. */}
        {actualPosition && playerGuesses?.map((playerGuess) => (
          <React.Fragment key={`player-${playerGuess.id}`}>
            <ColoredPlayerMarker
              coordinate={{ latitude: playerGuess.lat, longitude: playerGuess.lng }}
              color={playerGuess.color}
              username={playerGuess.username}
            />
            <Polyline
              coordinates={[
                { latitude: playerGuess.lat, longitude: playerGuess.lng },
                { latitude: actualPosition.lat, longitude: actualPosition.lng },
              ]}
              strokeColor={playerGuess.color}
              strokeWidth={2}
            />
          </React.Fragment>
        ))}

        {/* Opponent markers + lines to actual */}
        {actualPosition && opponentGuesses?.map((opp, i) => (
          <React.Fragment key={`opp-${i}`}>
            {opp.color ? (
              <ColoredPlayerMarker
                coordinate={{ latitude: opp.lat, longitude: opp.lng }}
                color={opp.color}
                username={opp.username}
              />
            ) : (
              <PinMarker
                coordinate={{ latitude: opp.lat, longitude: opp.lng }}
                imageSource={opponentPinModule}
                scale={MARKER_SCALE}
                opacity={1}
              />
            )}
            <Polyline
              coordinates={[
                { latitude: opp.lat, longitude: opp.lng },
                { latitude: actualPosition.lat, longitude: actualPosition.lng },
              ]}
              strokeColor={opp.color ?? getPointsColor(opp.points ?? 0)}
              strokeWidth={2}
            />
          </React.Fragment>
        ))}

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
        {countryGuessPosition && actualPosition && (
          <Polyline
            coordinates={[
              { latitude: countryGuessPosition.lat, longitude: countryGuessPosition.lng },
              { latitude: actualPosition.lat, longitude: actualPosition.lng },
            ]}
            strokeColor="#F44336"
            strokeWidth={3}
            lineDashPattern={[8, 8]}
          />
        )}
      </MapView>
    </View>
  );
}

function ColoredPlayerMarker({
  coordinate,
  color,
  username,
}: {
  coordinate: { latitude: number; longitude: number };
  color: string;
  username: string;
}) {
  const initial = username.trim().charAt(0).toUpperCase() || '?';

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={Platform.OS === 'ios' ? { x: 0, y: -17 } : undefined}
      tracksViewChanges={false}
    >
      <View style={styles.coloredPin}>
        <View style={[styles.coloredPinHead, { backgroundColor: color }]}>
          <Text style={styles.coloredPinText}>{initial}</Text>
        </View>
        <View style={[styles.coloredPinStem, { borderTopColor: color }]} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  coloredPin: {
    alignItems: 'center',
  },
  coloredPinHead: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  coloredPinText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Lexend-Bold',
  },
  coloredPinStem: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
  },
});
