/**
 * Slide-up sheet showing today's Top-100 daily-challenge leaderboard — opt-in
 * from the landing's scores section (web shows the same list in a modal, see
 * components/daily/DailyLeaderboardModal.js). Follows the app's established
 * bottom-sheet pattern (see ProfileSheet / InviteFriendsModal): native Modal +
 * slide animation + dimmed backdrop that closes on tap.
 *
 * Pagination is client-side over the single top-100 response, 10 rows per
 * page — same as web.
 */

import { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../shared/locale';
import { api } from '../../services/api';
import type { DailyLeaderboardEntry } from '@shared/daily/types';
import { dailyColors } from './styles';

const PAGE_SIZE = 10;

interface Props {
  visible: boolean;
  date: string;
  userData?: any;
  isLoggedIn: boolean;
  onSignIn?: () => void;
  onClose: () => void;
}

function medalFor(rank: number): string | null {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

function Row({ entry, isMe }: { entry: DailyLeaderboardEntry; isMe: boolean }) {
  const medal = medalFor(entry.rank);
  return (
    <View style={[styles.row, isMe && styles.rowSelf]}>
      <View style={styles.rankNameGroup}>
        {medal ? (
          <Text style={styles.rankMedal}>{medal}</Text>
        ) : (
          <Text style={styles.rankNum}>#{entry.rank}</Text>
        )}
        <Text style={styles.name} numberOfLines={1}>{entry.username}</Text>
      </View>
      <Text style={styles.score}>{entry.score.toLocaleString()}</Text>
    </View>
  );
}

export default function DailyLeaderboardSheet({ visible, date, userData, isLoggedIn, onSignIn, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<DailyLeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);

  const fetchLeaderboard = useCallback(async () => {
    setError(false);
    try {
      const data = await api.dailyChallenge.leaderboard(date);
      setEntries(Array.isArray(data?.leaderboard) ? data.leaderboard : []);
    } catch {
      setError(true);
    }
  }, [date]);

  // Refetch on every open (server caches for a few seconds anyway); keep the
  // previous list rendered meanwhile so reopening doesn't flash a spinner.
  useEffect(() => {
    if (!visible) return;
    setPage(0);
    fetchLeaderboard();
  }, [visible, fetchLeaderboard]);

  const username = userData?.username;
  const totalPages = entries ? Math.ceil(entries.length / PAGE_SIZE) : 0;
  const pageEntries = entries ? entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];
  const userInList = !!(username && entries?.some(e => e.username === username));
  const showSelfRow = !userInList && typeof userData?.ownRank === 'number' && isLoggedIn;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} sfx="none" />
        <View style={styles.sheetShadow}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title}>{t('dailyLeaderboardTitle')}</Text>
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </Pressable>
            </View>

            {error && !entries ? (
              <View style={styles.centerBox}>
                <Text style={styles.emptyText}>{t('error')}</Text>
                <Pressable onPress={fetchLeaderboard} style={styles.retryBtn}>
                  <Text style={styles.retryBtnText}>{t('retry')}</Text>
                </Pressable>
              </View>
            ) : !entries ? (
              <View style={styles.centerBox}>
                <ActivityIndicator color={dailyColors.green} size="large" />
              </View>
            ) : entries.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.emptyText}>{t('dailyLandingNoWinnersYet')}</Text>
              </View>
            ) : (
              <>
                <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                  {pageEntries.map(entry => (
                    <Row key={entry.rank} entry={entry} isMe={isLoggedIn && entry.username === username} />
                  ))}

                  {/* Own standing when it isn't in the top-100 at all (rank
                      comes from the bucket-derived distribution rank, so it
                      can run past 100). */}
                  {showSelfRow && (
                    <>
                      <Text style={styles.separator}>•••</Text>
                      <View style={[styles.row, styles.rowSelf]}>
                        <View style={styles.rankNameGroup}>
                          <Text style={styles.rankNum}>#{userData.ownRank}</Text>
                          <Text style={styles.name} numberOfLines={1}>
                            {username || t('yourScore')}
                          </Text>
                        </View>
                        <Text style={styles.score}>{Number(userData?.ownScore || 0).toLocaleString()}</Text>
                      </View>
                    </>
                  )}

                  {!isLoggedIn && (
                    <View style={styles.signinBox}>
                      <Text style={styles.signinText}>{t('signInToCompete')}</Text>
                      {onSignIn && (
                        <Pressable onPress={onSignIn} style={styles.signinBtn}>
                          <Text style={styles.signinBtnText}>{t('signIn')}</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </ScrollView>

                {totalPages > 1 && (
                  <View style={[styles.pagination, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                    <Pressable
                      onPress={() => setPage(p => p - 1)}
                      disabled={page === 0}
                      style={[styles.pageBtn, page === 0 && styles.pageBtnDisabled]}
                    >
                      <Text style={styles.pageBtnText}>{t('previous')}</Text>
                    </Pressable>
                    <Text style={styles.pageOf}>
                      {t('pageOf', { current: page + 1, total: totalPages })}
                    </Text>
                    <Pressable
                      onPress={() => setPage(p => p + 1)}
                      disabled={page >= totalPages - 1}
                      style={[styles.pageBtn, page >= totalPages - 1 && styles.pageBtnDisabled]}
                    >
                      <Text style={styles.pageBtnText}>{t('next')}</Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetShadow: {
    // Definite height (not maxHeight) so the sheet doesn't jump when the last
    // page has fewer than PAGE_SIZE rows.
    height: '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
    }),
  },
  sheet: {
    flex: 1,
    backgroundColor: dailyColors.cardBgSolid,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 18,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: 'Lexend',
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: dailyColors.green,
    borderRadius: 10,
  },
  retryBtnText: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 14 },
  list: { flex: 1 },
  listContent: { padding: 14, gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  rowSelf: {
    backgroundColor: 'rgba(76,175,80,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.4)',
  },
  rankNameGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  rankMedal: { fontSize: 17, minWidth: 34, textAlign: 'center' },
  rankNum: {
    minWidth: 34,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.65)',
    fontFamily: 'Lexend-Bold',
    fontSize: 13,
  },
  name: {
    flex: 1,
    color: '#fff',
    fontFamily: 'Lexend-Medium',
    fontSize: 15,
  },
  score: {
    fontFamily: 'JockeyOne',
    fontSize: 19,
    color: dailyColors.green,
    fontVariant: ['tabular-nums'],
  },
  separator: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.3)',
    fontSize: 15,
    letterSpacing: 4,
    marginVertical: 4,
  },
  signinBox: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    gap: 10,
  },
  signinText: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: 'Lexend',
    fontSize: 13,
    textAlign: 'center',
  },
  signinBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: dailyColors.green,
    borderRadius: 10,
  },
  signinBtnText: { color: '#fff', fontFamily: 'Lexend-SemiBold', fontSize: 13 },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  pageBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  pageBtnDisabled: { opacity: 0.35 },
  pageBtnText: { color: '#fff', fontFamily: 'Lexend-Medium', fontSize: 13 },
  pageOf: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Lexend',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
