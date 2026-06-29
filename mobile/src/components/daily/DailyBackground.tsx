import { type ReactNode } from 'react';
import { View, ImageBackground, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { dailyColors } from './styles';

/**
 * Daily Challenge backdrop. The `solid` variant matches the app's home screen
 * (street2.jpg + dark overlay + top-down green gradient) so the daily screens
 * feel like the rest of the app instead of a flat green sheet. The `overlay`
 * variant is a translucent warm-green wash for the submitting state, which
 * sits over the live Street View.
 */
interface Props {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'solid' | 'overlay';
}

const GREEN_GRADIENT = [
  'rgba(20,65,25,0.95)',
  'rgba(20,65,25,0.78)',
  'rgba(20,65,25,0.45)',
  'rgba(20,65,25,0.15)',
  'transparent',
] as const;

export default function DailyBackground({ children, style, variant = 'solid' }: Props) {
  const isOverlay = variant === 'overlay';

  return (
    <View style={[!isOverlay && styles.base, style]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {isOverlay ? (
          <LinearGradient
            colors={[dailyColors.bgOverlayTop, dailyColors.bgOverlayBottom]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <>
            <ImageBackground
              source={require('../../../assets/street2.jpg')}
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, styles.darkOverlay]} />
            <LinearGradient
              colors={GREEN_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: dailyColors.bgBottom },
  darkOverlay: { backgroundColor: 'rgba(0,0,0,0.6)' },
});
