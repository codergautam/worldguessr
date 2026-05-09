import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors } from '../../shared';
import {
  ALL_CONTINENTS,
  flagUrl,
  nameFromCode,
} from '../../shared/data/countryHelpers';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';

const CONTINENT_EMOJI: Record<string, string> = {
  Africa: '🌍',
  Asia: '🌏',
  Europe: '🇪🇺',
  'North America': '🌎',
  'South America': '🌎',
  Oceania: '🇦🇶',
};

type Mode = 'country' | 'continent';

interface CountryButtonsProps {
  countries: string[];
  mode: Mode;
  shown: boolean;
  disabled?: boolean;
  selected?: string | null;
  correct?: string | null;
  onPress: (answer: string) => void;
}

export default function CountryButtons({
  countries,
  mode,
  shown,
  disabled,
  selected,
  correct,
  onPress,
}: CountryButtonsProps) {
  const { width } = useWindowDimensions();
  const isContinent = mode === 'continent';
  const items = isContinent ? [...ALL_CONTINENTS] : countries;

  // Anti-ghost-tap guard: when the option set changes, briefly ignore taps so
  // a finger lifting from a previous round's tile doesn't immediately fire here.
  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    setInteractive(false);
    const t = setTimeout(() => setInteractive(true), 500);
    return () => clearTimeout(t);
  }, [countries.join('|'), mode]);

  // One Animated.Value per slot; staggered fade-in matches web cardSlideIn.
  const anims = useRef(items.map(() => new Animated.Value(0))).current;
  // Re-create when length changes (continent → country switch).
  const animsRef = useRef(anims);
  if (animsRef.current.length !== items.length) {
    animsRef.current = items.map(() => new Animated.Value(0));
  }
  useEffect(() => {
    if (!shown) {
      animsRef.current.forEach((a) => a.setValue(0));
      return;
    }
    Animated.stagger(
      isContinent ? 60 : 70,
      animsRef.current.map((a) =>
        Animated.timing(a, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [shown, items.length, isContinent]);

  const cols = useMemo(() => {
    if (isContinent) return width >= 600 ? 3 : 2;
    if (width >= 700) return 3;
    return 2;
  }, [width, isContinent]);

  const tapDisabled = disabled || !interactive;

  if (!shown) return null;

  return (
    <View style={styles.wrap} pointerEvents={tapDisabled ? 'box-none' : 'auto'}>
      <Text style={styles.prompt}>
        {isContinent ? 'Which continent?' : 'Which country?'}
      </Text>
      <View style={[styles.grid]}>
        {items.map((item, i) => {
          const fullName = isContinent ? item : nameFromCode(item);
          const isSelected = selected === item;
          const isCorrect = correct && item === correct;
          const isWrongPick = selected && correct && isSelected && item !== correct;

          return (
            <Animated.View
              key={`${mode}-${item}`}
              style={[
                styles.cell,
                { width: `${100 / cols}%` },
                {
                  opacity: animsRef.current[i],
                  transform: [
                    {
                      translateY: animsRef.current[i].interpolate({
                        inputRange: [0, 1],
                        outputRange: [16, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Pressable
                onPress={() => !tapDisabled && onPress(item)}
                disabled={tapDisabled}
                style={({ pressed }) => [
                  styles.btn,
                  isCorrect && styles.btnCorrect,
                  isWrongPick && styles.btnWrong,
                  pressed && !tapDisabled && styles.btnPressed,
                ]}
              >
                {isContinent ? (
                  <Text style={styles.continentEmoji}>{CONTINENT_EMOJI[item] || '🌐'}</Text>
                ) : (
                  <Image source={{ uri: flagUrl(item) }} style={styles.flag} resizeMode="cover" />
                )}
                <Text style={styles.label} numberOfLines={1}>
                  {fullName}
                </Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    paddingHorizontal: spacing.md,
  },
  prompt: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
    marginBottom: spacing.sm,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  cell: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  btn: {
    backgroundColor: 'rgba(20, 50, 28, 0.92)',
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
  },
  btnPressed: {
    backgroundColor: 'rgba(36, 87, 52, 1)',
    transform: [{ scale: 0.97 }],
  },
  btnCorrect: {
    backgroundColor: 'rgba(34, 197, 94, 0.85)',
    borderColor: colors.successGlow,
  },
  btnWrong: {
    backgroundColor: 'rgba(239, 68, 68, 0.78)',
    borderColor: colors.errorGlow,
  },
  flag: {
    width: 36,
    height: 24,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  continentEmoji: {
    fontSize: 28,
    width: 36,
    textAlign: 'center',
  },
  label: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Medium',
    flexShrink: 1,
  },
});
