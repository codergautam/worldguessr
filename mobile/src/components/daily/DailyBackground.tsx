import { type ReactNode } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient as SvgRadialGradient, Stop, Rect } from 'react-native-svg';
import { dailyColors } from './styles';

/**
 * DailyBackground — the warm-green backdrop shared across every Daily screen.
 * Ports the gradient family from `styles/daily.scss` `.daily-submitting`:
 *   radial-gradient(ellipse 80% 60% at 50% 40%, rgba(36,87,52,0.32) → transparent)
 *   + linear-gradient(180deg, rgba(8,22,14,.78) → rgba(3,12,7,.88))
 *
 * Variants:
 *   `solid`   — opaque base; use for landing / loading (no live scene behind).
 *   `overlay` — translucent stops; sits OVER the live Street View (submitting),
 *               so the backdrop reads as a soft crossfade, not a hard cut.
 *
 * Usage patterns:
 *   • Background layer behind a sibling ScrollView (landing):
 *       <View style={{flex:1}}><DailyBackground style={StyleSheet.absoluteFill}/><ScrollView/></View>
 *   • Centered wrapper (loading / submitting):
 *       <DailyBackground style={{flex:1, justifyContent:'center', alignItems:'center'}}>{spinner}</DailyBackground>
 */

interface Props {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'solid' | 'overlay';
}

export default function DailyBackground({ children, style, variant = 'solid' }: Props) {
  const isOverlay = variant === 'overlay';
  const linearColors = isOverlay
    ? ([dailyColors.bgOverlayTop, dailyColors.bgOverlayBottom] as const)
    : ([dailyColors.bgTop, dailyColors.bgBottom] as const);

  return (
    <View style={[!isOverlay && styles.solidBase, style]}>
      {/* Visual layers — non-interactive, painted behind any children. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={linearColors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <SvgRadialGradient id="dailyGlow" cx="0.5" cy="0.4" r="0.72">
              <Stop offset="0" stopColor={dailyColors.glowGreen} stopOpacity={0.32} />
              <Stop offset="0.7" stopColor={dailyColors.glowGreen} stopOpacity={0} />
            </SvgRadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#dailyGlow)" />
        </Svg>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  solidBase: {
    backgroundColor: dailyColors.bgBottom,
  },
});
