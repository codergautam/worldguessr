import { useEffect } from 'react';
import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { t } from '../../shared/locale';
import { dailyColors } from './styles';

interface Round {
  score: number;
  distance?: number | null;
  timeMs?: number | null;
  guessLat?: number | null;
  guessLng?: number | null;
  country?: string | null;
}

interface LocationLike {
  lat: number;
  long: number;
}

function barColor(score: number) {
  if (score >= 3000) return dailyColors.barHigh;
  if (score >= 1500) return dailyColors.barMid;
  return dailyColors.barLow;
}

function Badge({
  round,
  index,
  avg,
  location,
  allowMapLinks,
}: {
  round: Round;
  index: number;
  avg: number | null;
  location?: LocationLike;
  allowMapLinks: boolean;
}) {
  const score = round.score || 0;
  const perfect = score >= 4850;
  const color = barColor(score);

  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const delay = index * 100;
    scale.value = withDelay(delay, withSpring(1, { damping: 10, stiffness: 180 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  let diffLabel: string | null = null;
  if (avg !== null && avg > 0 && score > 0) {
    const diff = Math.round(((score - avg) / avg) * 100);
    if (diff > 0) diffLabel = t('aboveAvg', { pct: diff });
  } else if (avg === 0 && score > 0) {
    diffLabel = t('aboveAvg', { pct: 100 });
  }

  const mapUrl =
    allowMapLinks && location && Number.isFinite(location.lat) && Number.isFinite(location.long)
      ? `https://www.google.com/maps?q=${location.lat},${location.long}`
      : null;

  const content = (
    <>
      <Text style={styles.num}>#{index + 1}</Text>
      <Text style={styles.score}>{Math.round(score).toLocaleString()}</Text>
      {diffLabel && <Text style={styles.diff}>{diffLabel}</Text>}
      {perfect && <Text style={styles.star}>★</Text>}
      {mapUrl && <Text style={styles.mapHint}>{t('openInMaps')}</Text>}
    </>
  );

  if (mapUrl) {
    return (
      <Animated.View style={[styles.badge, { borderColor: color }, animatedStyle]}>
        <Pressable onPress={() => Linking.openURL(mapUrl)} style={styles.badgeInner}>
          {content}
        </Pressable>
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[styles.badge, { borderColor: color }, animatedStyle]}>
      <View style={styles.badgeInner}>{content}</View>
    </Animated.View>
  );
}

interface Props {
  rounds: Round[];
  roundAverages?: number[];
  locations?: LocationLike[];
  allowMapLinks?: boolean;
}

export default function RoundBadges({
  rounds,
  roundAverages = [],
  locations = [],
  allowMapLinks = true,
}: Props) {
  return (
    <View style={styles.row}>
      {rounds.map((r, i) => (
        <Badge
          key={i}
          round={r}
          index={i}
          avg={Number.isFinite(roundAverages[i]) ? roundAverages[i] : null}
          location={locations[i]}
          allowMapLinks={allowMapLinks}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 16,
    flexWrap: 'wrap',
  },
  badge: {
    borderWidth: 2,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    minWidth: 90,
  },
  badgeInner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  num: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  score: {
    color: '#fff',
    fontFamily: 'JockeyOne',
    fontSize: 22,
    marginTop: 2,
  },
  diff: {
    color: dailyColors.green,
    fontFamily: 'Lexend-SemiBold',
    fontSize: 10,
    marginTop: 2,
  },
  star: {
    color: dailyColors.gold,
    fontSize: 16,
    position: 'absolute',
    top: 2,
    right: 6,
  },
  mapHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    marginTop: 4,
  },
});
