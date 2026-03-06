import { useState, useEffect, useRef, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet, Animated, Easing } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../../shared';

interface StreetViewWebViewProps {
  lat: number;
  long: number;
  onLoad?: () => void;
  language?: string;
  fov?: number;
  pitch?: number;
  smoothTransitions?: boolean;
  transitionDuration?: number;
}

type SlotKey = 'primary' | 'secondary';

interface WebViewSourceState {
  key: string;
  html: string;
}

// Google Maps API key - same as web version
const GOOGLE_MAPS_API_KEY = 'AIzaSyA_t5gb2Mn37dZjhsaJ4F-OPp1PWDxqZyI';

function buildStreetViewHtml(lat: number, long: number, language: string, fov: number, pitch: number) {
  const streetViewUrl = `https://www.google.com/maps/embed/v1/streetview?location=${lat},${long}&key=${GOOGLE_MAPS_API_KEY}&fov=${fov}&pitch=${pitch}&language=${language}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: #1a1a2e; }
        iframe {
          width: 100vw;
          height: calc(100vh + 300px);
          border: none;
          transform: translateY(-285px);
        }
      </style>
    </head>
    <body>
      <iframe
        src="${streetViewUrl}"
        referrerpolicy="no-referrer-when-downgrade"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
        loading="eager"
      ></iframe>
    </body>
    </html>
  `;
}

export default function StreetViewWebView({
  lat,
  long,
  onLoad,
  language = 'en',
  fov = 100,
  pitch = 0,
  smoothTransitions = false,
  transitionDuration = 350,
}: StreetViewWebViewProps) {
  const [sources, setSources] = useState<Record<SlotKey, WebViewSourceState | null>>({
    primary: null,
    secondary: null,
  });
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const activeSlotRef = useRef<SlotKey>('primary');
  const pendingSlotRef = useRef<SlotKey | null>(null);
  const sourcesRef = useRef<Record<SlotKey, WebViewSourceState | null>>({
    primary: null,
    secondary: null,
  });
  const primaryOpacity = useRef(new Animated.Value(1)).current;
  const secondaryOpacity = useRef(new Animated.Value(0)).current;

  const setSlotVisible = useCallback((slot: SlotKey) => {
    primaryOpacity.setValue(slot === 'primary' ? 1 : 0);
    secondaryOpacity.setValue(slot === 'secondary' ? 1 : 0);
    activeSlotRef.current = slot;
  }, [primaryOpacity, secondaryOpacity]);

  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  const isValidCoordinate = Number.isFinite(lat) && Number.isFinite(long);

  useEffect(() => {
    if (!isValidCoordinate) return;

    const locationKey = `${lat}-${long}-${language}-${fov}-${pitch}`;
    const nextSource = {
      key: locationKey,
      html: buildStreetViewHtml(lat, long, language, fov, pitch),
    };

    const activeSlot = activeSlotRef.current;
    const activeSource = sourcesRef.current[activeSlot];

    if (!activeSource) {
      pendingSlotRef.current = null;
      setIsInitialLoading(true);
      setSources({ primary: nextSource, secondary: null });
      setSlotVisible('primary');
      return;
    }

    if (activeSource.key === nextSource.key) return;

    if (!smoothTransitions) {
      pendingSlotRef.current = null;
      setIsInitialLoading(true);
      setSources((prev) => ({
        ...prev,
        [activeSlot]: nextSource,
      }));
      return;
    }

    const nextSlot: SlotKey = activeSlot === 'primary' ? 'secondary' : 'primary';
    pendingSlotRef.current = nextSlot;
    if (nextSlot === 'primary') {
      primaryOpacity.setValue(0);
    } else {
      secondaryOpacity.setValue(0);
    }
    setSources((prev) => ({
      ...prev,
      [nextSlot]: nextSource,
    }));
  }, [lat, long, language, fov, pitch, isValidCoordinate, setSlotVisible, smoothTransitions, primaryOpacity, secondaryOpacity]);

  const handleLoadEnd = useCallback((slot: SlotKey) => {
    const pendingSlot = pendingSlotRef.current;
    const activeSlot = activeSlotRef.current;

    if (smoothTransitions && pendingSlot === slot && slot !== activeSlot) {
      const incomingOpacity = slot === 'primary' ? primaryOpacity : secondaryOpacity;
      const outgoingOpacity = activeSlot === 'primary' ? primaryOpacity : secondaryOpacity;

      Animated.parallel([
        Animated.timing(incomingOpacity, {
          toValue: 1,
          duration: transitionDuration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(outgoingOpacity, {
          toValue: 0,
          duration: transitionDuration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(() => {
        activeSlotRef.current = slot;
        pendingSlotRef.current = null;
        setHasLoadedOnce(true);
        setIsInitialLoading(false);
        onLoad?.();
      });
      return;
    }

    if (slot === activeSlot || !smoothTransitions) {
      setSlotVisible(slot);
      setHasLoadedOnce(true);
      setIsInitialLoading(false);
      onLoad?.();
    }
  }, [smoothTransitions, primaryOpacity, secondaryOpacity, transitionDuration, setSlotVisible, onLoad]);

  // Don't render if no valid coordinates
  if (!isValidCoordinate) {
    return (
      <View style={[styles.container, styles.loader]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!hasLoadedOnce && isInitialLoading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      {(sources.primary || sources.secondary) && (
        <>
          {sources.primary && (
            <Animated.View pointerEvents="none" style={[styles.webviewLayer, { opacity: primaryOpacity }]}>
              <WebView
                source={{ html: sources.primary.html }}
                style={styles.webview}
                onLoadEnd={() => handleLoadEnd('primary')}
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
                scrollEnabled={false}
                bounces={false}
                mediaPlaybackRequiresUserAction={false}
                allowsFullscreenVideo={false}
                originWhitelist={['*']}
              />
            </Animated.View>
          )}
          {sources.secondary && (
            <Animated.View pointerEvents="none" style={[styles.webviewLayer, { opacity: secondaryOpacity }]}>
              <WebView
                source={{ html: sources.secondary.html }}
                style={styles.webview}
                onLoadEnd={() => handleLoadEnd('secondary')}
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
                scrollEnabled={false}
                bounces={false}
                mediaPlaybackRequiresUserAction={false}
                allowsFullscreenVideo={false}
                originWhitelist={['*']}
              />
            </Animated.View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e', // Dark background to prevent white flash during loading
  },
  webview: {
    flex: 1,
  },
  webviewLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    zIndex: 10,
  },
});
