import { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../../shared';

interface StreetViewWebViewProps {
  lat: number;
  long: number;
  onLoad?: () => void;
  language?: string;
}

// Google Maps API key - same as web version
const GOOGLE_MAPS_API_KEY = 'AIzaSyA_t5gb2Mn37dZjhsaJ4F-OPp1PWDxqZyI';

export default function StreetViewWebView({ lat, long, onLoad, language = 'en' }: StreetViewWebViewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const prevLocationRef = useRef<string | null>(null);

  // Reset loading state when location changes
  useEffect(() => {
    const locationKey = `${lat}-${long}`;
    if (prevLocationRef.current !== null && prevLocationRef.current !== locationKey) {
      setIsLoading(true);
      setHasLoaded(false);
    }
    prevLocationRef.current = locationKey;
  }, [lat, long]);

  // Use Google Maps Street View embed URL - same format as web version
  const streetViewUrl = `https://www.google.com/maps/embed/v1/streetview?location=${lat},${long}&key=${GOOGLE_MAPS_API_KEY}&fov=100&language=${language}`;

  // Wrap in HTML with iframe since Google Maps Embed API requires iframe context
  const html = `
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

  // Don't render if no valid coordinates
  if (!lat || !long) {
    return (
      <View style={[styles.container, styles.loader]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      <WebView
        source={{ html }}
        style={[styles.webview, !hasLoaded && styles.hidden]}
        onLoadEnd={() => {
          setIsLoading(false);
          setHasLoaded(true);
          onLoad?.();
        }}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        scrollEnabled={false}
        bounces={false}
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={false}
        originWhitelist={['*']}
      />
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
  hidden: {
    opacity: 0,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    zIndex: 10,
  },
});
