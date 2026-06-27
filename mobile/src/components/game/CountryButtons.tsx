import { useEffect, useMemo } from 'react';
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
import { BlurView } from 'expo-blur';
import { colors, t } from '../../shared';
import {
  ALL_CONTINENTS,
  flagUrl,
  nameFromCode,
} from '../../shared/data/countryHelpers';
import { gameUiScale, isTabletSize } from '../../styles/responsive';

const ANIMATED_ONE = new Animated.Value(1);

const CONTINENT_IMAGES: Record<string, string> = {
  Africa: 'https://www.worldguessr.com/continents/africa.png',
  Asia: 'https://www.worldguessr.com/continents/asia.png',
  Europe: 'https://www.worldguessr.com/continents/europe.png',
  'North America': 'https://www.worldguessr.com/continents/north-america.png',
  'South America': 'https://www.worldguessr.com/continents/south-america.png',
  Oceania: 'https://www.worldguessr.com/continents/oceania.png',
};

type Mode = 'country' | 'continent';

interface CountryButtonsProps {
  countries: string[];
  mode: Mode;
  shown: boolean;
  disabled?: boolean;
  selected?: string | null;
  correct?: string | null;
  compact?: boolean;
  bottomInset?: number;
  onPress: (answer: string) => void;
}

export default function CountryButtons({
  countries,
  mode,
  shown,
  disabled,
  selected,
  correct,
  compact = true,
  bottomInset = 0,
  onPress,
}: CountryButtonsProps) {
  const { width, height } = useWindowDimensions();
  const scale = gameUiScale(width, height);
  const isTablet = isTabletSize(width, height);
  /** Tablet-scaled value, rounded to the nearest 0.5dp. 1.0× (no-op) on phones. */
  const sc = (v: number) => Math.round(v * scale * 2) / 2;
  const isContinent = mode === 'continent';
  const items = isContinent ? [...ALL_CONTINENTS] : countries;
  const isShort = height <= 500;
  // Tablets are excluded from the phone tier and get their own (below). Phones
  // keep the existing width<=600 behaviour untouched.
  const isPhone = width <= 600 && !isTablet;
  // The app is always a touch device, so — exactly like the web's
  // `@media (pointer: coarse)` rules — phones AND tablets use the full-width,
  // wrapping, flex-basis layout (never the desktop content-hug). This is the
  // fix for the iPad "buttons too small + skewed right with empty left space"
  // bug: the old code routed tablets down the `undefined`-width hug path.
  const useFlexLayout = isPhone || isTablet;
  const containerWidth = !compact
    ? width
    : isContinent
    ? isPhone
      ? width - 12
      : Math.min(width * (isTablet ? 0.82 : 0.7), isTablet ? 920 : 750)
    : useFlexLayout || isShort
      ? width - 12
      : undefined;

  const buttonMetrics = useMemo(() => {
    if (isShort) {
      return {
        containerPaddingH: compact ? 8 : 10,
        containerPaddingV: compact ? 6 : 8,
        containerGap: compact ? 3 : 5,
        rowGap: compact ? 4 : 6,
        buttonPaddingH: compact ? 3 : 6,
        buttonPaddingV: compact ? 4 : 7,
        buttonGap: compact ? 2 : 4,
        buttonRadius: compact ? 8 : 10,
        minWidth: 0,
        flagWidth: compact ? 30 : 38,
        flagHeight: compact ? 20 : 26,
        iconSize: compact ? 24 : 30,
        promptFont: compact ? 11.5 : 13,
        labelFont: compact ? 10.4 : 12.2,
      };
    }

    if (isTablet) {
      // Web parity: tablets use the coarse-pointer LAYOUT (handled above via
      // useFlexLayout/flexBasis) but with sizes scaled up from the phone-compact
      // baseline by the tablet factor — so flags and labels read at iPad
      // proportions (intentionally a touch larger than web, which leaves them at
      // phone px on iPad). `sc()` is 1.0× on phones, so this branch only ever
      // runs on real tablets.
      //
      // The compact COUNTRY guesser (flag buttons) was overshooting on iPads, so
      // its flag/label/vertical-padding are dialed back a notch — still clearly
      // larger than the old phone-px baseline, just no longer giant. Continent
      // buttons and the non-compact onboarding grid are deliberately untouched.
      const countryCompact = compact && !isContinent;
      return {
        containerPaddingH: sc(compact ? 10 : 14),
        containerPaddingV: sc(compact ? 9 : 13),
        containerGap: sc(compact ? 6 : 8),
        rowGap: sc(compact ? 8 : 10),
        buttonPaddingH: sc(countryCompact ? 9 : compact ? 12 : 16),
        buttonPaddingV: sc(countryCompact ? 8 : compact ? 11 : 13),
        buttonGap: sc(5),
        buttonRadius: sc(compact ? 12 : 14),
        minWidth: 0,
        // Non-compact (onboarding) flags trimmed so they don't overshoot ~2x web
        // on a 12.9" iPad; compact singleplayer flags pulled in from 46→35.
        flagWidth: sc(countryCompact ? 35 : 48),
        flagHeight: sc(countryCompact ? 23 : 32),
        iconSize: sc(compact ? 42 : 46),
        promptFont: sc(compact ? 14 : 15.5),
        labelFont: sc(countryCompact ? 11 : compact ? 13 : 14.5),
      };
    }

    if (isPhone) {
      return {
        containerPaddingH: compact ? 8 : 14,
        containerPaddingV: compact ? 8 : 14,
        containerGap: compact ? 5 : 8,
        rowGap: compact ? 5 : 8,
        buttonPaddingH: compact ? 6 : 12,
        buttonPaddingV: compact ? 8 : 12,
        buttonGap: compact ? 4 : 6,
        buttonRadius: compact ? 9 : 12,
        minWidth: 0,
        flagWidth: compact ? 40 : 52,
        flagHeight: compact ? 27 : 35,
        iconSize: compact ? 36 : 42,
        promptFont: compact ? 13.1 : 15,
        labelFont: compact ? 12.2 : 14,
      };
    }

    return {
      containerPaddingH: 14,
      containerPaddingV: 12,
      containerGap: isContinent ? 6 : 8,
      rowGap: 8,
      buttonPaddingH: isContinent ? 10 : 12,
      buttonPaddingV: isContinent ? 6 : 8,
      buttonGap: 5,
      buttonRadius: 12,
      minWidth: isContinent ? 78 : 86,
      flagWidth: 40,
      flagHeight: 27,
      iconSize: 30,
      promptFont: 13.6,
      labelFont: 12,
    };
  }, [compact, isContinent, isTablet, isPhone, isShort, scale]);

  const rowWrap = isShort && !isContinent ? 'nowrap' : 'wrap';

  const tapDisabled = !!disabled;
  const itemsKey = `${mode}:${items.join('|')}`;
  const entranceAnims = useMemo(
    () => items.map(() => new Animated.Value(0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemsKey],
  );

  useEffect(() => {
    if (!shown) {
      entranceAnims.forEach((a) => a.setValue(0));
      return;
    }

    entranceAnims.forEach((a) => a.setValue(0));
    const delay = isContinent ? 45 : 55;
    const animation = Animated.parallel(
      entranceAnims.map((a, i) =>
        Animated.sequence([
          Animated.delay(i * delay),
          Animated.timing(a, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
        ]),
      ),
      { stopTogether: false },
    );
    animation.start();
    return () => animation.stop();
  }, [shown, isContinent, entranceAnims]);

  if (!shown) return null;

  return (
    <View
      style={[
        styles.wrap,
        isPhone && styles.wrapPhone,
        isShort && styles.wrapShort,
        isContinent && styles.wrapContinent,
        !compact && styles.wrapFullBottom,
        {
          width: containerWidth,
          // Continent wrap is capped at 750 by styles.wrapContinent; lift it on
          // tablets so the 6-button grid can use the wider scaled container.
          ...(isContinent && isTablet ? { maxWidth: 920 } : null),
          paddingHorizontal: buttonMetrics.containerPaddingH,
          paddingTop: buttonMetrics.containerPaddingV,
          paddingBottom: buttonMetrics.containerPaddingV + bottomInset,
          gap: buttonMetrics.containerGap,
        },
      ]}
      pointerEvents="box-none"
    >
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} pointerEvents="none" />
      <Text
        style={[
          styles.prompt,
          {
            fontSize: buttonMetrics.promptFont,
            // Only override the fixed lineHeight on tablets (where the font grew);
            // phones keep styles.prompt.lineHeight (18) exactly — a true no-op.
            ...(isTablet ? { lineHeight: Math.round(buttonMetrics.promptFont * 1.32) } : null),
          },
        ]}
      >
        {t(isContinent ? 'whichContinent' : 'whichCountry')}
      </Text>
      <View
        style={[
          styles.grid,
          {
            flexWrap: rowWrap,
            gap: buttonMetrics.rowGap,
          },
        ]}
        pointerEvents={tapDisabled ? 'none' : 'auto'}
      >
        {items.map((item, i) => {
          const fullName = isContinent ? item : nameFromCode(item);
          const isSelected = selected === item;
          const isCorrect = correct && item === correct;
          const isWrongPick = selected && correct && isSelected && item !== correct;
          const flexBasis = isShort
            ? isContinent
              ? '14%'
              : 0
            : useFlexLayout
              ? isContinent
                ? '30%'
                : compact
                  ? '30%'
                  : '44%'
              : isContinent
                ? width <= 900
                  ? '30%'
                  : undefined
                : undefined;
          const entrance = entranceAnims[i] ?? ANIMATED_ONE;

          return (
            <View
              key={`${mode}-${item}`}
              style={[
                styles.cell,
                {
                  flexBasis,
                  flexGrow: flexBasis === undefined ? 0 : 1,
                  flexShrink: 1,
                },
              ]}
            >
              <Pressable
                onPress={() => !tapDisabled && onPress(item)}
                disabled={tapDisabled}
                style={styles.pressable}
              >
                {({ pressed }) => (
                  <Animated.View
                    style={[
                      styles.btn,
                      !compact && styles.btnOnboarding,
                      {
                        minWidth: buttonMetrics.minWidth,
                        paddingHorizontal: buttonMetrics.buttonPaddingH,
                        paddingVertical: buttonMetrics.buttonPaddingV,
                        gap: buttonMetrics.buttonGap,
                        borderRadius: buttonMetrics.buttonRadius,
                        opacity: entrance,
                        transform: [
                          {
                            translateY: entrance.interpolate({
                              inputRange: [0, 1],
                              outputRange: [14, 0],
                            }),
                          },
                        ],
                      },
                      isCorrect && styles.btnCorrect,
                      isWrongPick && styles.btnWrong,
                      pressed && !tapDisabled && styles.btnPressed,
                    ]}
                  >
                    {isContinent ? (
                      <Image
                        source={{ uri: CONTINENT_IMAGES[item] }}
                        style={[
                          styles.continentIcon,
                          {
                            width: buttonMetrics.iconSize,
                            height: buttonMetrics.iconSize,
                          },
                        ]}
                        resizeMode="contain"
                      />
                    ) : (
                      <Image
                        source={{ uri: flagUrl(item, 'w80') }}
                        style={[
                          styles.flag,
                          {
                            width: buttonMetrics.flagWidth,
                            height: buttonMetrics.flagHeight,
                          },
                        ]}
                        resizeMode="contain"
                      />
                    )}
                    <Text
                      style={[
                        styles.label,
                        {
                          fontSize: buttonMetrics.labelFont,
                          // Tablet-only lineHeight bump; phones keep styles.label
                          // lineHeight (15) untouched.
                          ...(isTablet ? { lineHeight: Math.round(buttonMetrics.labelFont * 1.2) } : null),
                        },
                      ]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      adjustsFontSizeToFit
                      minimumFontScale={0.76}
                    >
                      {fullName}
                    </Text>
                  </Animated.View>
                )}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  wrapPhone: {
    borderRadius: 12,
  },
  wrapShort: {
    borderRadius: 10,
  },
  wrapContinent: {
    maxWidth: 750,
  },
  wrapFullBottom: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  prompt: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: 'Lexend-Medium',
    textAlign: 'center',
    lineHeight: 18,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    width: '100%',
  },
  cell: {
    alignItems: 'stretch',
  },
  pressable: {
    alignSelf: 'stretch',
  },
  btn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 2,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOnboarding: {
    minHeight: 78,
  },
  btnPressed: {
    backgroundColor: 'rgba(63, 185, 80, 0.1)',
    borderColor: '#3fb950',
    transform: [{ scale: 0.97 }],
  },
  btnCorrect: {
    backgroundColor: 'rgba(63, 185, 80, 0.16)',
    borderColor: colors.successGlow,
  },
  btnWrong: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderColor: colors.errorGlow,
  },
  flag: {
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  continentIcon: {
    tintColor: colors.white,
  },
  label: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
    lineHeight: 15,
    maxWidth: '100%',
  },
});
