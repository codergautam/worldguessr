/**
 * Blue "reload street view" button — the mobile counterpart of web's navbar
 * reload affordance (`components/ui/navbar.js` → `reloadBtnPressed` →
 * `window.reloadLoc()`). Sits beside BackButton and mirrors its silhouette
 * (44×44 rounded square) for HUD cohesion, but wears the web's blue gradient
 * (`--gradBlue`) and the real web icon asset (`return.png`) so it reads the same
 * on both platforms.
 *
 * The actual pano reload is owned by StreetViewWebView (`ref.reload()`); this
 * component is purely the animated control: press-scale feedback, a one-shot
 * icon spin on tap, and fade enter/exit — all of which collapse to instant,
 * non-jarring behaviour when the OS "Reduce Motion" setting is on.
 */

import { StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Pressable } from './SfxPressable';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  Easing,
  FadeInLeft,
  FadeOutLeft,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, t } from '../../shared';
import { haptics } from '../../services/haptics';

// Canonical web blue gradient (`--gradBlue` in styles/globals.scss). Same family
// as GameSurface's guess-submit button so the HUD stays on-palette.
const BLUE_GRADIENT = [
  'rgba(30,62,156,0.95)',
  'rgba(29,29,91,0.95)',
  'rgba(112,112,255,0.95)',
] as const;

interface ReloadButtonProps {
  onPress: () => void;
  /** Optional wrapper style (positioning, margins). */
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export default function ReloadButton({ onPress, style, disabled }: ReloadButtonProps) {
  const reduceMotion = useReducedMotion();
  const spin = useSharedValue(0);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const handlePress = () => {
    haptics.light();
    // Decorative spin — honour Reduce Motion by simply not animating it.
    if (!reduceMotion) {
      spin.value = withTiming(spin.value + 360, {
        duration: 500,
        easing: Easing.out(Easing.cubic),
      });
    }
    onPress();
  };

  return (
    <Animated.View
      // Slide + fade so the between-rounds hide/re-enter glides from the left
      // rather than popping. Reduce Motion → no layout animation (instant, never
      // jarring).
      entering={reduceMotion ? undefined : FadeInLeft.duration(260).easing(Easing.out(Easing.cubic))}
      exiting={reduceMotion ? undefined : FadeOutLeft.duration(200).easing(Easing.in(Easing.cubic))}
      style={style}
    >
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t('resetStreetView')}
        style={({ pressed }) => [
          styles.button,
          pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
        ]}
      >
        <LinearGradient
          colors={BLUE_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <Animated.View style={iconStyle}>
            <Ionicons name="refresh" size={24} color={colors.white} />
          </Animated.View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  gradient: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.4,
    borderColor: '#1d1d5b',
  },
});
