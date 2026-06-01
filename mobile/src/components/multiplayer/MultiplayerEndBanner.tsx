/**
 * End-of-round banner for multiplayer games.
 * Reuses the singleplayer ClassicEndBanner for the "my result" card so visuals stay
 * consistent across modes; adds opponent rows + duel HP info on top of that.
 */

import { View, Text, StyleSheet } from 'react-native';
import { colors, findDistance, calcPoints, formatDistance } from '../../shared';
import { spacing, fontSizes } from '../../styles/theme';
import ClassicEndBanner from '../game/ClassicEndBanner';
import { MPPlayer, MPLocation } from '../../store/multiplayerStore';
import { useSettingsStore } from '../../store/settingsStore';

interface MultiplayerEndBannerProps {
  round: number;
  totalRounds: number;
  players: MPPlayer[];
  myId: string;
  location: MPLocation;
  maxDist: number;
  duel: boolean;
  /** Whether the game is waiting for next round (show "Waiting..." vs "Next Round") */
  isAutoTransition?: boolean;
}

function getPointsColor(pts: number) {
  if (pts >= 4000) return colors.success;
  if (pts >= 2000) return colors.warning;
  return colors.error;
}

export default function MultiplayerEndBanner({
  round,
  totalRounds,
  players,
  myId,
  location,
  maxDist,
  duel,
  isAutoTransition = true,
}: MultiplayerEndBannerProps) {
  const units = useSettingsStore((s) => s.units);
  const me = players.find((p) => p.id === myId);

  const playerResults = players
    .filter((p) => p.latLong && p.latLong[0] !== 0 && p.latLong[1] !== 0)
    .map((p) => {
      const dist = findDistance(location.lat, location.long, p.latLong![0], p.latLong![1]);
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
  const didGuess = !!(me?.latLong && me.latLong[0] !== 0 && me.latLong[1] !== 0);

  const opponents = playerResults
    .filter((p) => p.id !== myId)
    .slice(0, duel ? 1 : 3);

  const duelInfo = duel && myResult && playerResults.length >= 2
    ? buildDuelHpLine(myResult.points, playerResults.find((p) => p.id !== myId)?.points ?? 0)
    : null;

  const footerSlot = (
    <View style={styles.footerStack}>
      {opponents.length > 0 && (
        <View style={styles.opponentsBox}>
          {opponents.map((p) => (
            <View key={p.id} style={styles.opponentRow}>
              <Text style={styles.opponentName} numberOfLines={1}>
                {p.username}
              </Text>
              <Text style={styles.opponentDist}>{formatDistance(p.distance, units)}</Text>
              <Text style={[styles.opponentPoints, { color: getPointsColor(p.points) }]}>
                {p.points.toLocaleString()} pts
              </Text>
            </View>
          ))}
        </View>
      )}
      {duelInfo && (
        <Text
          style={[
            styles.duelHpLine,
            duelInfo.color ? { color: duelInfo.color } : null,
          ]}
        >
          {duelInfo.text}
        </Text>
      )}
      {isAutoTransition && <Text style={styles.waitingText}>Next round starting...</Text>}
    </View>
  );

  return (
    <View style={styles.container} pointerEvents="none">
      <ClassicEndBanner
        round={round}
        totalRounds={totalRounds}
        points={myResult?.points ?? 0}
        distance={myResult?.distance ?? null}
        didGuess={didGuess}
        compact
        footerSlot={footerSlot}
      />
    </View>
  );
}

function buildDuelHpLine(myPoints: number, oppPoints: number): { text: string; color?: string } {
  if (myPoints === oppPoints) {
    return { text: 'Draw — no HP change' };
  }
  const diff = Math.abs(myPoints - oppPoints);
  const iWon = myPoints > oppPoints;
  return {
    text: `${iWon ? 'Opponent' : 'You'} lost ${diff} HP`,
    color: iWon ? colors.success : colors.error,
  };
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1001,
  },
  footerStack: {
    width: '100%',
    gap: spacing.xs,
  },
  opponentsBox: {
    width: '100%',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 2,
  },
  opponentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
    width: '100%',
  },
  opponentName: {
    flex: 1,
    color: 'rgba(255,255,255,0.72)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
  },
  opponentDist: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
  },
  opponentPoints: {
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Bold',
    minWidth: 60,
    textAlign: 'right',
  },
  duelHpLine: {
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.6)',
  },
  waitingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
    textAlign: 'center',
  },
});
