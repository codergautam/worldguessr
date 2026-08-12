import { useState } from 'react';
import { Linking, View, Text, StyleSheet } from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import { getActiveLeagues, resolveLeague, type ServerLeague } from '../../shared/user/leagues';
import { colors, t } from '../../shared';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';
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
  /**
   * The league as api/eloRank.js computed it (`getLeague(user.elo)` — the WHOLE
   * object). PREFERRED over the local cutoff table: a seasonal re-anchor of the
   * tiers then lands for everyone without a store release. Absent on older
   * servers, in which case the local table answers.
   */
  league?: ServerLeague;
  duels_wins: number;
  duels_losses: number;
  duels_tied: number;
  win_rate: number;
  // 2v2 team stats (unranked) — absent on servers predating the fields.
  team2v2_wins?: number;
  team2v2_losses?: number;
  team2v2_tied?: number;
  team2v2_win_rate?: number;
}

interface EloTabProps {
  eloData: EloData | null;
  progression: ProgressionEntry[];
  progressionLoading: boolean;
  onScrollEnable?: (enabled: boolean) => void;
}

const ELO_REBUILD_URL = 'https://worldguessr.forum/t/ranked-elo-is-being-rebuilt/1237';

export default function EloTab({
  eloData,
  progression,
  progressionLoading,
  onScrollEnable,
}: EloTabProps) {
  const [pressedLeague, setPressedLeague] = useState<string | null>(null);

  if (!eloData) return null;

  // The badge shows the CURRENT tier, so the server's answer wins here. The
  // LADDER below is still the local table — it is a static reference chart of
  // every tier, and the server only ever tells us about the one the user is in.
  const userLeague = resolveLeague(eloData.elo, eloData.league);
  const leagueList = Object.values(getActiveLeagues());

  return (
    <View style={{ gap: 20 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${t('eloRebuildNotice')} ${t('eloRebuildLink')}`}
        onPress={() => Linking.openURL(ELO_REBUILD_URL).catch(() => {})}
        style={localStyles.eloNotice}
      >
        <Text style={localStyles.eloNoticeText}>
          {t('eloRebuildNotice')}{' '}
          <Text style={localStyles.eloNoticeLink}>{t('eloRebuildLink')} →</Text>
        </Text>
      </Pressable>

      {/* Leagues Card */}
      <GlassCard>
        <Text style={sharedStyles.cardTitle}>{t('leagues')}</Text>
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
                    <Text style={localStyles.eloBadgeText}>{league.min}+ {t('elo')}</Text>
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
        <Text style={sharedStyles.cardTitle}>{t('statistics')}</Text>
        <View style={sharedStyles.statsGrid}>
          <StatItem label={t('elo')} value={String(eloData.elo)} />
          <StatItem label={t('globalRank')} value={`#${eloData.rank}`} />
          <StatItem label={t('duels_won')} value={String(eloData.duels_wins)} />
          <StatItem label={t('duels_lost')} value={String(eloData.duels_losses)} />
          {eloData.duels_tied > 0 && (
            <StatItem label={t('duels_tied')} value={String(eloData.duels_tied)} />
          )}
          {eloData.win_rate > 0 && (
            <StatItem
              label={t('win_rate')}
              value={`${(eloData.win_rate * 100).toFixed(2)}%`}
            />
          )}
          {/* 2v2 team stats (unranked) — only once the user has played 2v2
              (web eloView.js parity). */}
          {((eloData.team2v2_wins ?? 0) + (eloData.team2v2_losses ?? 0) + (eloData.team2v2_tied ?? 0)) > 0 && (
            <>
              <StatItem label={t('twovtwoWon')} value={String(eloData.team2v2_wins ?? 0)} />
              <StatItem label={t('twovtwoLost')} value={String(eloData.team2v2_losses ?? 0)} />
              {(eloData.team2v2_tied ?? 0) > 0 && (
                <StatItem label={t('twovtwoTied')} value={String(eloData.team2v2_tied)} />
              )}
              {/* typeof: a genuine 0% win rate must still render (falsy-zero
                  hid the tile for 0-win records — web comment ported). */}
              {typeof eloData.team2v2_win_rate === 'number' && (
                <StatItem
                  label={t('twovtwoWinRate')}
                  value={`${(eloData.team2v2_win_rate * 100).toFixed(2)}%`}
                />
              )}
            </>
          )}
        </View>
      </GlassCard>

      {/* ELO Progression Graph */}
      <ProgressionGraph
        data={progression}
        loading={progressionLoading}
        mode="elo"
        onChartTouch={onScrollEnable}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  eloNotice: {
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.35)',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eloNoticeText: {
    color: colors.success,
    fontFamily: 'Lexend',
    fontSize: fontSizes.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  eloNoticeLink: {
    fontFamily: 'Lexend-SemiBold',
    textDecorationLine: 'underline',
  },
  eloBadge: {
    position: 'absolute',
    top: -24,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    zIndex: 10,
  },
  eloBadgeText: {
    color: colors.black,
    fontSize: 10,
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
  },
});
