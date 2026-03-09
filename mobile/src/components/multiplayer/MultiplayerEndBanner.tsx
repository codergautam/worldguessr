/**
 * End-of-round banner for multiplayer games.
 * Shows your result, opponent results, and auto-transitions.
 * Replaces the singleplayer end banner when in multiplayer mode.
 */

import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, findDistance, calcPoints } from '../../shared';
import { spacing, fontSizes, borderRadius } from '../../styles/theme';
import { MPPlayer, MPLocation } from '../../store/multiplayerStore';

interface MultiplayerEndBannerProps {
  round: number;
  totalRounds: number;
  players: MPPlayer[];
  myId: string;
  location: MPLocation;
  maxDist: number;
  duel: boolean;
  /** Called when user taps continue (private games) or auto-transitions */
  onContinue?: () => void;
  /** Whether the game is waiting for next round (show "Waiting..." vs "Next Round") */
  isAutoTransition?: boolean;
}

export default function MultiplayerEndBanner({
  round,
  totalRounds,
  players,
  myId,
  location,
  maxDist,
  duel,
  onContinue,
  isAutoTransition = true,
}: MultiplayerEndBannerProps) {
  const me = players.find((p) => p.id === myId);

  // Calculate distances and points for display
  const playerResults = players
    .filter((p) => p.latLong && p.latLong[0] !== 0 && p.latLong[1] !== 0)
    .map((p) => {
      const dist = findDistance(
        location.lat,
        location.long,
        p.latLong![0],
        p.latLong![1],
      );
      const pts = calcPoints({
        lat: location.lat,
        lon: location.long,
        guessLat: p.latLong![0],
        guessLon: p.latLong![1],
        maxDist,
      });
      return { ...p, distance: dist, points: pts };
    })
    .sort((a, b) => b.points - a.points);

  const myResult = playerResults.find((p) => p.id === myId);
  const didGuess = me?.latLong && me.latLong[0] !== 0 && me.latLong[1] !== 0;

  const formatDist = (km: number) => {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    if (km < 100) return `${km.toFixed(1)} km`;
    return `${Math.round(km).toLocaleString()} km`;
  };

  const getPointsColor = (pts: number) => {
    if (pts >= 4000) return colors.success;
    if (pts >= 2000) return colors.warning;
    return colors.error;
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.roundLabel}>
          Round {round}/{totalRounds}
        </Text>

        {/* Your result */}
        {didGuess && myResult ? (
          <>
            <Text style={styles.distanceText}>
              Your guess was {formatDist(myResult.distance)} away
            </Text>
            <Text
              style={[
                styles.pointsText,
                { color: getPointsColor(myResult.points) },
              ]}
            >
              {myResult.points.toLocaleString()} points
            </Text>
          </>
        ) : (
          <Text style={styles.distanceText}>You didn't guess</Text>
        )}

        {/* Opponent results (show top players) */}
        {playerResults
          .filter((p) => p.id !== myId)
          .slice(0, duel ? 1 : 3)
          .map((p) => (
            <View key={p.id} style={styles.opponentRow}>
              <Text style={styles.opponentName} numberOfLines={1}>
                {p.username}
              </Text>
              <Text style={styles.opponentDist}>
                {formatDist(p.distance)}
              </Text>
              <Text
                style={[
                  styles.opponentPoints,
                  { color: getPointsColor(p.points) },
                ]}
              >
                {p.points.toLocaleString()} pts
              </Text>
            </View>
          ))}

        {/* Duel health deduction info */}
        {duel && myResult && playerResults.length >= 2 && (
          <DuelHealthInfo
            myPoints={myResult?.points ?? 0}
            oppPoints={
              playerResults.find((p) => p.id !== myId)?.points ?? 0
            }
          />
        )}

        {/* Continue button — only for non-auto-transition games */}
        {!isAutoTransition && onContinue && (
          <Pressable
            onPress={onContinue}
            style={({ pressed }) => [pressed && { opacity: 0.85 }]}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.continueBtn}
            >
              <Text style={styles.continueBtnText}>
                {round >= totalRounds ? 'View Results' : 'Next Round'}
              </Text>
            </LinearGradient>
          </Pressable>
        )}

        {isAutoTransition && (
          <Text style={styles.waitingText}>Next round starting...</Text>
        )}
      </View>
    </View>
  );
}

function DuelHealthInfo({
  myPoints,
  oppPoints,
}: {
  myPoints: number;
  oppPoints: number;
}) {
  const diff = Math.abs(myPoints - oppPoints);
  const iWon = myPoints > oppPoints;
  const isDraw = myPoints === oppPoints;

  return (
    <View style={styles.healthInfo}>
      {isDraw ? (
        <Text style={styles.healthDraw}>Draw — no HP change</Text>
      ) : (
        <Text
          style={[
            styles.healthChange,
            { color: iWon ? colors.success : colors.error },
          ]}
        >
          {iWon ? 'Opponent' : 'You'} lost {diff} HP
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1001,
  },
  card: {
    backgroundColor: 'rgba(17, 43, 24, 0.92)',
    borderRadius: 12,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  roundLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
  },
  distanceText: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
  },
  pointsText: {
    fontSize: fontSizes['2xl'],
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
  },
  opponentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
    width: '100%',
  },
  opponentName: {
    flex: 1,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
  },
  opponentDist: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
  },
  opponentPoints: {
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Bold',
    minWidth: 60,
    textAlign: 'right',
  },
  healthInfo: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    width: '100%',
    alignItems: 'center',
  },
  healthDraw: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
  },
  healthChange: {
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
  },
  continueBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['3xl'],
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    minWidth: 200,
  },
  continueBtnText: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontFamily: 'Lexend-SemiBold',
  },
  waitingText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
    marginTop: spacing.xs,
  },
});
