// react-native-maps removed temporarily for build testing.
// Restore from git history (or replace with leaflet) once a working IPA exists.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface OpponentGuess {
  lat: number;
  lng: number;
  username: string;
  points?: number;
}

type Extent = [number, number, number, number] | null;

interface GuessMapProps {
  guessPosition: { lat: number; lng: number } | null;
  actualPosition?: { lat: number; lng: number };
  onMapPress: (lat: number, lng: number) => void;
  isExpanded?: boolean;
  extent?: Extent;
  opponentGuesses?: OpponentGuess[];
  guessPoints?: number;
}

export default function GuessMap(_props: GuessMapProps) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.text}>Map disabled (build test)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#888',
    fontSize: 14,
  },
});
