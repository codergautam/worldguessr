/**
 * Fullscreen overlay shown during the "getready" phase before a duel round.
 * A draining ring countdown with WorldGuessr branding + generation progress.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../../shared';
import { spacing } from '../../styles/theme';
import WgWordmark from '../ui/WgWordmark';
import MatchCountdown from '../ui/MatchCountdown';

interface GetReadyOverlayProps {
  round: number;
  totalRounds: number;
  /** Server timestamp when getready phase ends */
  nextEvtTime: number;
  /** Client-server time offset */
  timeOffset: number;
  /** Number of locations generated so far */
  generated: number;
}

export default function GetReadyOverlay({
  round,
  totalRounds,
  nextEvtTime,
  timeOffset,
  generated,
}: GetReadyOverlayProps) {
  const [seconds, setSeconds] = useState(5);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  // Countdown from server time (fractional — drives the draining ring)
  useEffect(() => {
    const update = () => {
      const remaining = Math.max(0, (nextEvtTime - Date.now() - timeOffset) / 1000);
      setSeconds(remaining);
    };
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [nextEvtTime, timeOffset]);

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={['rgba(6, 16, 10, 0.92)', 'rgba(3, 8, 5, 0.96)']}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.brandBar} edges={['top']} pointerEvents="none">
        <WgWordmark size="sm" />
      </SafeAreaView>

      <Animated.View style={[styles.body, { transform: [{ scale: scaleAnim }] }]}>
        <MatchCountdown
          seconds={seconds}
          label={t('getReady', undefined, 'Get Ready!')}
          sublabel={t('round', { r: round, mr: totalRounds }, 'Round #{{r}} / {{mr}}')}
          footnote={
            generated < totalRounds
              ? t(
                  'loadingLocationsProgress',
                  { generated, total: totalRounds },
                  'Loading locations... {{generated}}/{{total}}',
                )
              : undefined
          }
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  brandBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingLeft: spacing.xl,
    paddingTop: spacing.sm,
  },
  body: {
    alignItems: 'center',
  },
});
