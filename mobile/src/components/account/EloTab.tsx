import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { getLeague, leagues } from '../../shared/user/leagues';
import {
  GlassCard,
  StatItem,
  ProgressionGraph,
  sharedStyles,
  ProgressionEntry,
} from './shared';

interface EloData {
  elo: number;
  rank: number;
  duels_wins: number;
  duels_losses: number;
  duels_tied: number;
  win_rate: number;
}

interface EloTabProps {
  eloData: EloData | null;
  progression: ProgressionEntry[];
  progressionLoading: boolean;
  screenWidth: number;
  onScrollEnable?: (enabled: boolean) => void;
}

export default function EloTab({
  eloData,
  progression,
  progressionLoading,
  screenWidth,
  onScrollEnable,
}: EloTabProps) {
  if (!eloData) return null;

  const userLeague = getLeague(eloData.elo);
  const leagueList = Object.values(leagues);
  const [pressedLeague, setPressedLeague] = useState<string | null>(null);

  return (
    <View style={{ gap: 20 }}>
      {/* Leagues Card */}
      <GlassCard>
        <Text style={sharedStyles.cardTitle}>Leagues</Text>
        <View style={sharedStyles.leagueContainer}>
          {leagueList.map((league) => {
            const isCurrent = userLeague.name === league.name;
            const showBadge = pressedLeague === league.name;
            return (
              <Pressable
                key={league.name}
                style={sharedStyles.leagueItem}
                onPress={() => setPressedLeague(showBadge ? null : league.name)}
              >
                {showBadge && (
                  <View style={[localStyles.eloBadge, { backgroundColor: league.color }]}>
                    <Text style={localStyles.eloBadgeText}>{league.min} ELO</Text>
                  </View>
                )}
                <View
                  style={[
                    sharedStyles.leagueBox,
                    { backgroundColor: league.color },
                    isCurrent && sharedStyles.leagueBoxCurrent,
                  ]}
                >
                  <Text style={sharedStyles.leagueEmoji}>{league.emoji}</Text>
                </View>
                <Text
                  style={[
                    sharedStyles.leagueName,
                    isCurrent && sharedStyles.leagueNameCurrent,
                  ]}
                >
                  {league.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassCard>

      {/* Statistics Card */}
      <GlassCard>
        <Text style={sharedStyles.cardTitle}>Statistics</Text>
        <View style={sharedStyles.statsGrid}>
          <StatItem label="ELO" value={String(eloData.elo)} />
          <StatItem label="Global Rank" value={`#${eloData.rank}`} />
          <StatItem label="Duels Won" value={String(eloData.duels_wins)} />
          <StatItem label="Duels Lost" value={String(eloData.duels_losses)} />
          {eloData.duels_tied > 0 && (
            <StatItem label="Duels Tied" value={String(eloData.duels_tied)} />
          )}
          {eloData.win_rate > 0 && (
            <StatItem
              label="Win Rate"
              value={`${(eloData.win_rate * 100).toFixed(2)}%`}
            />
          )}
        </View>
      </GlassCard>

      {/* ELO Progression Graph */}
      <ProgressionGraph
        data={progression}
        loading={progressionLoading}
        mode="elo"
        screenWidth={screenWidth}
        onChartTouch={onScrollEnable}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  eloBadge: {
    position: 'absolute',
    top: -24,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    zIndex: 10,
  },
  eloBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
  },
});
