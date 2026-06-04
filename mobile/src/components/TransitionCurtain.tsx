/**
 * A full-screen curtain that masks a heavy in-place view swap (the multiplayer
 * lobby ⇄ in-game WebView scene) by briefly showing the app's SHARED brand
 * backdrop — the same `street2` image + dim that the lobby and the in-game
 * loading overlay already display. Because both sides of the swap sit on that
 * exact backdrop, the curtain reads as a smooth fade *through* the common
 * backdrop rather than a solid-colour flash (it used to be solid green, which
 * popped). It covers instantly on the swap (pre-paint, via useLayoutEffect) so
 * the unmounting WebView's teardown is never visible, then fades away to reveal
 * the freshly-mounted tree.
 *
 * No-op on first mount (only real `sceneKey` changes trigger it). Render it as
 * the LAST child of the screen container, a sibling of the swapping content.
 */
import { useLayoutEffect, useRef } from 'react';
import { Animated, Easing, ImageBackground, Platform, StyleSheet, View } from 'react-native';

const STREET2 = require('../../assets/street2.jpg');

export default function TransitionCurtain({ sceneKey }: { sceneKey: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const prevKey = useRef(sceneKey);

  useLayoutEffect(() => {
    if (prevKey.current === sceneKey) return;
    prevKey.current = sceneKey;
    // Cover instantly (this commit, pre-paint) so the swap is never visible,
    // hold one beat for the incoming tree to mount, then reveal it.
    opacity.stopAnimation();
    opacity.setValue(1);
    Animated.timing(opacity, {
      toValue: 0,
      duration: 360,
      delay: 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [sceneKey, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, styles.curtain, { opacity }]}
    >
      <ImageBackground
        source={STREET2}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        fadeDuration={0}
      />
      <View style={styles.dim} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  curtain: {
    // Near-black fallback only ever visible for a frame if the (preloaded)
    // street2 image somehow isn't painted yet — deliberately NOT the brand green.
    backgroundColor: '#0a140d',
    zIndex: 9999,
    // Android paints by elevation; keep the curtain above any elevated content
    // (lobby buttons, etc.) it needs to cover during the swap.
    ...Platform.select({ android: { elevation: 30 } }),
  },
  // Matches GameLoadingOverlay's dim so the curtain and the loading state that
  // often follows it are visually identical (no brightness jump between them).
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
});
