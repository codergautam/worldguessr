import React from 'react';
import { Image, Platform } from 'react-native';
import { Marker } from 'react-native-maps';

const PIN_WIDTH = 28;
const PIN_HEIGHT = 40;

interface PinMarkerProps {
  coordinate: { latitude: number; longitude: number };
  imageSource: any;
  scale?: number;
  opacity?: number;
  identifier?: string;
  stopPropagation?: boolean;
  children?: React.ReactNode;
}

export default function PinMarker({
  coordinate,
  imageSource,
  scale = 1,
  opacity = 1,
  identifier,
  stopPropagation,
  children,
}: PinMarkerProps) {
  const w = PIN_WIDTH * scale;
  const h = PIN_HEIGHT * scale;

  return (
    <Marker
      identifier={identifier}
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={Platform.OS === 'ios' ? { x: 0, y: -h / 2 } : undefined}
      opacity={opacity}
      stopPropagation={stopPropagation}
      tracksViewChanges={false}
    >
      <Image source={imageSource} style={{ width: w, height: h }} resizeMode="contain" />
      {children}
    </Marker>
  );
}
