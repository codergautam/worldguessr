/**
 * Fullscreen overlay shown while searching for a multiplayer match.
 * Matches web's "Finding game..." queue UI.
 */

import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../shared';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import { wsService } from '../../services/websocket';
import { useMultiplayerStore } from '../../store/multiplayerStore';

interface QueueOverlayProps {
  onCancel: () => void;
}

export default function QueueOverlay({ onCancel }: QueueOverlayProps) {
  const gameQueued = useMultiplayerStore((s) => s.gameQueued);
  const publicDuelRange = useMultiplayerStore((s) => s.publicDuelRange);
  const playerCount = useMultiplayerStore((s) => s.playerCount);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Pulsing animation for the search icon
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const handleCancel = () => {
    wsService.send({ type: 'leaveQueue' });
    useMultiplayerStore.setState({ gameQueued: false, publicDuelRange: null });
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(onCancel);
  };

  const isRanked = gameQueued === 'publicDuel';

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <View style={styles.card}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Ionicons name="search" size={48} color={colors.primary} />
        </Animated.View>

        <Text style={styles.title}>
          {isRanked ? 'Finding Ranked Duel...' : 'Finding Game...'}
        </Text>

        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.spinner}
        />

        {isRanked && publicDuelRange && (
          <Text style={styles.eloRange}>
            ELO Range: {publicDuelRange[0]} - {publicDuelRange[1]}
          </Text>
        )}

        {playerCount > 0 && (
          <Text style={styles.playerCount}>
            {playerCount} player{playerCount !== 1 ? 's' : ''} online
          </Text>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.cancelBtn,
            pressed && styles.cancelBtnPressed,
          ]}
          onPress={handleCancel}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    padding: spacing.xl,
  },
  card: {
    backgroundColor: '#0f1f14',
    borderRadius: 20,
    padding: spacing['2xl'],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    width: '100%',
    maxWidth: 340,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.xl,
    fontFamily: 'Lexend-Bold',
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  spinner: {
    marginTop: spacing.md,
  },
  eloRange: {
    color: colors.warning,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
    marginTop: spacing.md,
  },
  playerCount: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    marginTop: spacing.sm,
  },
  cancelBtn: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  cancelBtnPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  cancelBtnText: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontFamily: 'Lexend-SemiBold',
  },
});
