import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

const COLORS = ['#fbbf24', '#34d399', '#60a5fa', '#f87171', '#a78bfa', '#f472b6'];

interface Piece {
  startX: number;
  endX: number;
  endY: number;
  rotation: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
}

interface Props {
  /** Bumping this key replays the burst — fire it on mount of OnboardingComplete. */
  trigger: number;
  /** Number of confetti pieces. */
  count?: number;
}

export default function ConfettiBurst({ trigger, count = 60 }: Props) {
  const { width, height } = useWindowDimensions();
  const anims = useRef<Animated.Value[]>([]).current;

  const pieces: Piece[] = useMemo(() => {
    return Array.from({ length: count }, () => {
      const startX = width * 0.5 + (Math.random() - 0.5) * 60;
      return {
        startX,
        endX: startX + (Math.random() - 0.5) * width * 0.9,
        endY: height * (0.4 + Math.random() * 0.55),
        rotation: (Math.random() - 0.5) * 720,
        delay: Math.random() * 200,
        duration: 1100 + Math.random() * 900,
        size: 6 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, width, height, count]);

  if (anims.length !== pieces.length) {
    anims.length = 0;
    for (let i = 0; i < pieces.length; i++) anims.push(new Animated.Value(0));
  }

  useEffect(() => {
    anims.forEach((a) => a.setValue(0));
    const animations = pieces.map((p, i) =>
      Animated.timing(anims[i], {
        toValue: 1,
        duration: p.duration,
        delay: p.delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    Animated.parallel(animations).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const t = anims[i];
        const translateX = t.interpolate({
          inputRange: [0, 1],
          outputRange: [p.startX, p.endX],
        });
        const translateY = t.interpolate({
          inputRange: [0, 1],
          outputRange: [-20, p.endY],
        });
        const rotate = t.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${p.rotation}deg`],
        });
        const opacity = t.interpolate({
          inputRange: [0, 0.85, 1],
          outputRange: [1, 1, 0],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.piece,
              {
                width: p.size,
                height: p.size * 1.4,
                backgroundColor: p.color,
                opacity,
                transform: [{ translateX }, { translateY }, { rotate }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 1,
  },
});
