import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { haptics } from '../../services/haptics';
import { colors } from '../../shared';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

const PAD = 4;

/**
 * iOS-style segmented control with a pill that slides between equal-width
 * segments. Used for binary/short choices (units). The pill animates with a
 * cubic ease and selection fires a light haptic.
 */
export default function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const [width, setWidth] = useState(0);
  const count = options.length;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const seg = width > 0 ? (width - PAD * 2) / count : 0;
  const tx = useSharedValue(0);

  useEffect(() => {
    tx.value = withTiming(index * seg, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.Never,
    });
  }, [index, seg, tx]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  return (
    <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {seg > 0 && <Animated.View style={[styles.pill, { width: seg }, pillStyle]} />}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={styles.item}
            onPress={() => {
              if (!active) {
                onChange(o.value);
                haptics.selection();
              }
            }}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    borderRadius: borderRadius.lg,
    padding: PAD,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pill: {
    position: 'absolute',
    top: PAD,
    left: PAD,
    bottom: PAD,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  item: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Lexend-Medium',
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
  },
});
