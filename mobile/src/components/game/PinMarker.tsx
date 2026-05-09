// react-native-maps temporarily removed for build testing — see comment in GuessMap.tsx.
import React from 'react';

interface PinMarkerProps {
  coordinate: { latitude: number; longitude: number };
  imageSource: any;
  scale?: number;
  opacity?: number;
  identifier?: string;
  stopPropagation?: boolean;
  children?: React.ReactNode;
}

export default function PinMarker(_props: PinMarkerProps) {
  return null;
}
