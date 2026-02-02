import { useRef, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { colors } from '../../shared';

interface GuessMapProps {
  guessPosition: { lat: number; lng: number } | null;
  actualPosition?: { lat: number; lng: number };
  onMapPress: (lat: number, lng: number) => void;
  isExpanded?: boolean;
}

export default function GuessMap({
  guessPosition,
  actualPosition,
  onMapPress,
  isExpanded,
}: GuessMapProps) {
  const mapRef = useRef<MapView>(null);

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

  const handleMapPress = (event: any) => {
    if (actualPosition) return; // Don't allow new guesses when showing result

    const { latitude, longitude } = event.nativeEvent.coordinate;
    onMapPress(latitude, longitude);
  };

  return (
    <View style={styles.container}>
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
