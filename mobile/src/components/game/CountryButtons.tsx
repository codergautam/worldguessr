import { useEffect, useMemo } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Pressable } from '../ui/SfxPressable';
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
  onPress: (answer: string) => void;
}

// One sizing tier for every surface, matching the web where onboarding and
// singleplayer buttons are the same coarse-pointer size (globals.scss). The
// old "non-compact" onboarding fork (minHeight 78, 52×35 flags, full-bleed
// dock) had no web counterpart. What web varies is COLUMNS, not size: 4
// onboarding options wrap at 44% (2×2), 6 singleplayer options at 30% (3×2) —
// so the column count is derived from the option count below.
export default function CountryButtons({
  countries,
  mode,
  shown,
  disabled,
  selected,
  correct,
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
  const containerWidth = isContinent
    ? isPhone
      ? width - 12
      : Math.min(width * (isTablet ? 0.82 : 0.7), isTablet ? 920 : 750)
    : useFlexLayout || isShort
      ? width - 12
      : undefined;

  const buttonMetrics = useMemo(() => {
    if (isShort) {
      return {
        containerPaddingH: 8,
        containerPaddingV: 6,
        containerGap: 3,
        rowGap: 4,
        buttonPaddingH: 3,
        buttonPaddingV: 4,
        buttonGap: 2,
        buttonRadius: 8,
        minWidth: 0,
        flagWidth: 30,
        flagHeight: 20,
        iconSize: 24,
        promptFont: 11.5,
        labelFont: 10.4,
      };
    }

    if (isTablet) {
      // Web parity: tablets use the coarse-pointer LAYOUT (handled above via
      // useFlexLayout/flexBasis) but with sizes scaled up from the phone
      // baseline by the tablet factor — so flags and labels read at iPad
      // proportions (intentionally a touch larger than web, which leaves them
      // at phone px on iPad). `sc()` is 1.0× on phones, so this branch only
      // ever runs on real tablets.
      return {
        containerPaddingH: sc(10),
        containerPaddingV: sc(9),
        containerGap: sc(6),
        rowGap: sc(8),
        buttonPaddingH: sc(isContinent ? 12 : 9),
        buttonPaddingV: sc(isContinent ? 11 : 8),
        buttonGap: sc(5),
        buttonRadius: sc(12),
        minWidth: 0,
        flagWidth: sc(35),
        flagHeight: sc(23),
        iconSize: sc(42),
        promptFont: sc(14),
        labelFont: sc(isContinent ? 13 : 11),
      };
    }

    if (isPhone) {
      return {
        containerPaddingH: 8,
        containerPaddingV: 8,
        containerGap: 5,
        rowGap: 5,
        buttonPaddingH: 6,
        buttonPaddingV: 8,
        buttonGap: 4,
        buttonRadius: 9,
        minWidth: 0,
        flagWidth: 40,
        flagHeight: 27,
        iconSize: 36,
        promptFont: 13.1,
        labelFont: 12.2,
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
  }, [isContinent, isTablet, isPhone, isShort, scale]);

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
        // Native driver (delay included) = compositor thread, like the web's
        // CSS cardSlideIn. The JS thread is busy mounting WebViews at exactly
        // the moment this runs, and a JS-driven fade stutters under that
        // load — most visibly on the first button, whose delay is 0.
        Animated.timing(a, {
          toValue: 1,
          duration: 260,
          delay: i * delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
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
        {
          width: containerWidth,
          // Continent wrap is capped at 750 by styles.wrapContinent; lift it on
          // tablets so the 6-button grid can use the wider scaled container.
          ...(isContinent && isTablet ? { maxWidth: 920 } : null),
          paddingHorizontal: buttonMetrics.containerPaddingH,
          paddingVertical: buttonMetrics.containerPaddingV,
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
          // Column count mirrors web: continents always 30% (3×2); country
          // rounds wrap 4 options at 44% (2×2, onboarding) and 6 at 30% (3×2).
          const flexBasis = isShort
            ? isContinent
              ? '14%'
              : 0
            : useFlexLayout
              ? isContinent || items.length > 4
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
                // Web data-no-click-sfx parity (countryButtons.js): the press
                // IS the guess, so the reveal whoosh is its sound — click_2
                // stacking on top was explicitly opted out on web.
                sfx="none"
                onPress={() => !tapDisabled && onPress(item)}
                disabled={tapDisabled}
                style={styles.pressable}
              >
                {({ pressed }) => (
                  <Animated.View
                    style={[
                      styles.btn,
                      {
                        minWidth: buttonMetrics.minWidth,
                        paddingHorizontal: buttonMetrics.buttonPaddingH,
                        paddingVertical: buttonMetrics.buttonPaddingV,
                        gap: buttonMetrics.buttonGap,
                        borderRadius: buttonMetrics.buttonRadius,
                        opacity: entrance,
                        // Press scale lives in the SAME transform array as the
                        // animated translateY: a separate static style would
                        // replace the whole transform (style arrays override
                        // `transform` as a unit) and detach the animated node.
                        transform: [
                          {
                            translateY: entrance.interpolate({
                              inputRange: [0, 1],
                              outputRange: [14, 0],
                            }),
                          },
                          { scale: pressed && !tapDisabled ? 0.97 : 1 },
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
                        fadeDuration={0}
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
                        // Android fades images in over 300ms by default, even
                        // from cache. The first button is visible from frame
                        // one (entrance delay 0), so that fade reads as the
                        // flag flickering in after the button shell.
                        fadeDuration={0}
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
  btnPressed: {
    backgroundColor: 'rgba(63, 185, 80, 0.1)',
    borderColor: '#3fb950',
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
