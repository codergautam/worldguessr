import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Linking,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { t } from '../../shared';
import { GlassCard, sharedStyles } from './shared';

interface ModerationTabProps {
  secret: string;
  banned?: boolean;
  banType?: string;
  banExpiresAt?: string;
  banPublicNote?: string;
  pendingNameChange?: boolean;
  pendingNameChangePublicNote?: string;
  username?: string;
  supporter?: boolean;
  onLogout?: () => void;
  pendingDeletion?: boolean;
  scheduledDeletionAt?: string;
}

interface ModerationData {
  totalEloRefunded: number;
  reportStats: { total: number; actionTaken: number };
  eloRefunds: Array<{ id: string; amount: number; bannedUsername: string; date: string }>;
  moderationHistory: Array<{
    id: string;
    actionType: string;
    actionDescription: string;
    publicNote?: string;
    date: string;
    expiresAt?: string;
    durationString?: string;
  }>;
  submittedReports: Array<{
    id: string;
    reportedUsername: string;
    reason: string;
    status: string;
    date: string;
  }>;
}

type SubTab = 'refunds' | 'history' | 'reports';

export default function ModerationTab({
  secret,
  banned,
  banType,
  banExpiresAt,
  banPublicNote,
  pendingNameChange,
  pendingNameChangePublicNote,
  username,
  supporter,
  onLogout,
  pendingDeletion,
  scheduledDeletionAt,
}: ModerationTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ModerationData | null>(null);
  const [activeSection, setActiveSection] = useState<SubTab>(
    banned || pendingNameChange ? 'history' : 'refunds'
  );
  // Account deletion — 2-layer confirm: Alert warning, then type-to-confirm modal.
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const updateUser = useAuthStore((s) => s.updateUser);

  const confirmMatches =
    !!username && deleteConfirmText.trim().toLowerCase() === username.toLowerCase();

  // Layer 1: warning Alert. On "Continue", open the type-to-confirm modal.
  const startDelete = () => {
    const supporterWarning = supporter
      ? '\n\n' + t('deleteAccountWarningSupporter', undefined, 'You are a Supporter — deleting your account permanently removes your ad-free perk and badge. This cannot be restored even on a new account.')
      : '';
    Alert.alert(
      t('deleteAccountConfirmTitle', undefined, 'Delete your account?'),
      t('deleteAccountConfirmBody', { days: 7 }, 'Your account will be permanently deleted in {{days}} days. Log back in before then to restore it. You will lose your XP, ELO, friends, and created maps.') + supporterWarning,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('continue', undefined, 'Continue'),
          style: 'destructive',
          onPress: () => { setDeleteConfirmText(''); setDeleteModalVisible(true); },
        },
      ],
    );
  };

  // Layer 2: type-to-confirm. Schedules deletion (fast — 7-day grace) then logs out.
  const confirmDelete = async () => {
    if (deleting || !confirmMatches) return;
    try {
      setDeleting(true);
      await api.deleteAccount(secret);
      setDeleteModalVisible(false);
      onLogout?.();
    } catch (e: any) {
      Alert.alert(t('error', undefined, 'Error'), e?.message || String(e));
      setDeleting(false);
    }
  };

  // Cancel a scheduled deletion (account is inside its 7-day grace window).
  const handleRestore = async () => {
    if (restoring) return;
    try {
      setRestoring(true);
      await api.cancelDeletion(secret);
      updateUser({ pendingDeletion: false, scheduledDeletionAt: undefined });
      Alert.alert(
        t('accountRestoredTitle', undefined, 'Account Restored'),
        t('accountRestoredBody', undefined, 'Your account is no longer scheduled for deletion.'),
      );
    } catch (e: any) {
      Alert.alert(t('error', undefined, 'Error'), e?.message || String(e));
    } finally {
      setRestoring(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await api.userModerationData(secret);
        setData(result);
      } catch (err: any) {
        setError(err.message || t('failedToLoad', undefined, 'Failed to load'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [secret]);

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    if (diff <= 0) return t('expired');

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#ffd700';
      case 'action_taken': return '#4caf50';
      case 'ignored': return '#888';
      default: return '#b0b0b0';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open': return t('reportStatusOpen');
      case 'action_taken': return t('reportStatusActionTaken');
      case 'ignored': return t('reportStatusIgnored');
      default: return status;
    }
  };

  const getReasonText = (reason: string) => {
    switch (reason) {
      case 'inappropriate_username': return t('reportReasonInappropriateUsername');
      case 'cheating': return t('reportReasonCheating');
      case 'other': return t('reportReasonOther');
      default: return reason;
    }
  };

  if (loading) {
    return (
      <GlassCard>
        <View style={{ alignItems: 'center', gap: 16, paddingVertical: 40 }}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontFamily: 'Lexend' }}>
            {t('loadingModerationData')}
          </Text>
        </View>
      </GlassCard>
    );
  }

  if (error) {
    return (
      <GlassCard>
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Text style={{ color: '#f44336', fontSize: 16, fontFamily: 'Lexend' }}>
            {t('error')}: {error}
          </Text>
        </View>
      </GlassCard>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {/* Suspension Banner */}
      {banned && !pendingNameChange && (
        <View style={styles.suspensionBanner}>
          <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>🚫</Text>
          <Text style={styles.suspensionTitle}>
            {t(banType === 'temporary' ? 'accountTempSuspended' : 'accountSuspended')}
          </Text>

          {banType === 'temporary' && banExpiresAt && (
            <View style={styles.timeRemainingCard}>
              <Text style={styles.timeRemainingLabel}>{t('timeRemaining')}</Text>
              <Text style={styles.timeRemainingValue}>{getTimeRemaining(banExpiresAt)}</Text>
              <Text style={styles.timeRemainingExpires}>
                {t('expires')}: {new Date(banExpiresAt).toLocaleString()}
              </Text>
            </View>
          )}

          {banPublicNote && (
            <View style={styles.reasonCard}>
              <Text style={styles.reasonLabel}>{t('reason')}</Text>
              <Text style={styles.reasonText}>{banPublicNote}</Text>
            </View>
          )}

          <Text style={styles.suspensionExplanation}>
            {t(banType === 'temporary'
              ? 'suspensionExplanationTemp'
              : 'suspensionExplanationPerm')}
          </Text>

          {/* Appeal */}
          <View style={styles.appealCard}>
            <Text style={styles.appealTitle}>{t('wantToAppeal')}</Text>
            <Text style={styles.appealText}>
              {t('appealInstructions')}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.discordButton, pressed && { opacity: 0.8 }]}
              onPress={() => Linking.openURL('https://discord.gg/ADw47GAyS5')}
            >
              <Text style={styles.discordButtonText}>{t('joinDiscord')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Name Change Required Banner */}
      {pendingNameChange && (
        <View style={styles.nameChangeBanner}>
          <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>✏️</Text>
          <Text style={styles.nameChangeTitle}>{t('usernameChangeRequired')}</Text>
          {pendingNameChangePublicNote && (
            <View style={styles.reasonCard}>
              <Text style={styles.reasonLabel}>{t('reason')}</Text>
              <Text style={styles.reasonText}>{pendingNameChangePublicNote}</Text>
            </View>
          )}
          <Text style={[styles.suspensionExplanation, { color: '#e0e0e0' }]}>
            {t('usernameFlaggedGoToProfileTab', undefined, 'Your username has been flagged. Please change it from the Profile tab.')}
          </Text>
        </View>
      )}

      {/* Stats Card */}
      <GlassCard>
        <Text style={sharedStyles.cardTitle}>{t('moderation')}</Text>
        <View style={sharedStyles.statsGrid}>
          <View style={styles.modStat}>
            <Text style={styles.modStatLabel}>{t('eloRefunded')}</Text>
            <Text style={[styles.modStatValue, { color: '#4caf50' }]}>
              +{data?.totalEloRefunded || 0}
            </Text>
          </View>
          <View style={styles.modStat}>
            <Text style={styles.modStatLabel}>{t('reportsFiled')}</Text>
            <Text style={[styles.modStatValue, { color: '#ffd700' }]}>
              {data?.reportStats?.total || 0}
            </Text>
          </View>
          <View style={styles.modStat}>
            <Text style={styles.modStatLabel}>{t('effectiveReports')}</Text>
            <Text style={[styles.modStatValue, { color: '#4caf50' }]}>
              {data?.reportStats?.actionTaken || 0}
            </Text>
          </View>
        </View>

        {/* Sub-tabs */}
        <View style={styles.subTabRow}>
          {(['refunds', 'history', 'reports'] as SubTab[]).map((tab) => {
            const labels: Record<SubTab, string> = {
              refunds: t('eloRefundsTabCount', { count: data?.eloRefunds?.length || 0 }, 'ELO Refunds ({{count}})'),
              history: t('historyTabCount', { count: data?.moderationHistory?.length || 0 }, 'History ({{count}})'),
              reports: t('myReportsTabCount', { count: data?.submittedReports?.length || 0 }, 'My Reports ({{count}})'),
            };
            return (
              <Pressable
                key={tab}
                style={[styles.subTab, activeSection === tab && styles.subTabActive]}
                onPress={() => setActiveSection(tab)}
              >
                <Text style={[styles.subTabText, activeSection === tab && styles.subTabTextActive]}>
                  {labels[tab]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassCard>

      {/* Content */}
      <GlassCard>
        {activeSection === 'refunds' && (
          <>
            <Text style={[sharedStyles.cardTitle, { fontSize: 18 }]}>{t('eloRefundsTab')}</Text>
            <Text style={styles.sectionDesc}>
              {t('eloRefundsDesc')}
            </Text>
            {(data?.eloRefunds?.length || 0) > 0 ? (
              data!.eloRefunds.map((refund) => (
                <View key={refund.id} style={styles.listItem}>
                  <View>
                    <Text style={{ color: '#4caf50', fontFamily: 'Lexend-Bold', fontSize: 16 }}>
                      {t('eloRefundAmount', { amount: refund.amount }, '+{{amount}} ELO')}
                    </Text>
                    <Text style={{ color: '#888', fontSize: 12, fontFamily: 'Lexend', marginTop: 4 }}>
                      {t('fromLabel', undefined, 'From:')} <Text style={{ color: '#f44336' }}>{refund.bannedUsername}</Text>
                    </Text>
                  </View>
                  <Text style={{ color: '#888', fontSize: 12, fontFamily: 'Lexend' }}>
                    {formatDate(refund.date)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>{t('noEloRefundsYet')}</Text>
            )}
          </>
        )}

        {activeSection === 'history' && (
          <>
            <Text style={[sharedStyles.cardTitle, { fontSize: 18 }]}>{t('accountHistoryTab')}</Text>
            {(data?.moderationHistory?.length || 0) > 0 ? (
              data!.moderationHistory.map((item) => (
                <View key={item.id} style={styles.listItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontFamily: 'Lexend-Bold',
                      fontSize: 14,
                      color: item.actionType.includes('ban') && item.actionType !== 'unban'
                        ? '#f44336'
                        : item.actionType === 'unban' ? '#4caf50' : '#ffd700',
                    }}>
                      {item.actionDescription}
                    </Text>
                    {item.publicNote && (
                      <Text style={{ color: '#b0b0b0', marginTop: 6, fontSize: 13, fontFamily: 'Lexend' }}>
                        {item.publicNote}
                      </Text>
                    )}
                    {item.expiresAt && new Date(item.expiresAt) > new Date() && (
                      <Text style={{ color: '#ffd700', marginTop: 4, fontSize: 12, fontFamily: 'Lexend' }}>
                        {t('expires')}: {formatDate(item.expiresAt)}
                      </Text>
                    )}
                  </View>
                  <Text style={{ color: '#888', fontSize: 12, fontFamily: 'Lexend' }}>
                    {formatDate(item.date)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>{t('noModerationActions')}</Text>
            )}
          </>
        )}

        {activeSection === 'reports' && (
          <>
            <Text style={[sharedStyles.cardTitle, { fontSize: 18 }]}>{t('reportsYouSubmitted')}</Text>
            <Text style={styles.sectionDesc}>
              {t('reportsPrivacyNote')}
            </Text>
            {(data?.submittedReports?.length || 0) > 0 ? (
              data!.submittedReports.map((report) => (
                <View key={report.id} style={styles.listItem}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={{ color: '#e0e0e0', fontFamily: 'Lexend-Bold', fontSize: 14 }}>
                        {report.reportedUsername}
                      </Text>
                      <View style={styles.reasonBadge}>
                        <Text style={styles.reasonBadgeText}>{getReasonText(report.reason)}</Text>
                      </View>
                    </View>
                    <Text style={{
                      color: getStatusColor(report.status),
                      fontFamily: 'Lexend-Bold',
                      fontSize: 12,
                      marginTop: 4,
                    }}>
                      {getStatusText(report.status)}
                    </Text>
                  </View>
                  <Text style={{ color: '#888', fontSize: 12, fontFamily: 'Lexend' }}>
                    {formatDate(report.date)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>{t('noReportsSubmitted')}</Text>
            )}
          </>
        )}
      </GlassCard>

      {/* Danger Zone — account deletion (own profile only; this tab is own-only).
          If a deletion is already scheduled (re-logged in during the grace
          window), this offers Restore instead of Delete. */}
      <GlassCard>
        <Text style={[sharedStyles.cardTitle, { color: pendingDeletion ? '#ff9800' : '#ff6b6b' }]}>
          {t('dangerZone', undefined, 'Danger Zone')}
        </Text>
        {pendingDeletion ? (
          <>
            <Text style={[styles.dangerDesc, { color: '#e0e0e0' }]}>
              {scheduledDeletionAt
                ? t('accountScheduledForDeletion', { date: new Date(scheduledDeletionAt).toLocaleDateString() }, 'Your account is scheduled for deletion on {{date}}.')
                : t('accountScheduledForDeletionShort', undefined, 'Your account is scheduled for deletion.')}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.restoreAccountButton, pressed && { opacity: 0.85 }, restoring && { opacity: 0.6 }]}
              onPress={handleRestore}
              disabled={restoring}
            >
              {restoring ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.restoreAccountButtonText}>{t('restoreAccount', undefined, 'Restore Account')}</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.dangerDesc}>
              {t('dangerZoneSubtitle', undefined, 'Sensitive account actions. Proceed with care.')}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.deleteAccountButton, pressed && { opacity: 0.85 }]}
              onPress={startDelete}
            >
              <Text style={styles.deleteAccountButtonText}>{t('deleteAccount', undefined, 'Delete Account')}</Text>
            </Pressable>
          </>
        )}
      </GlassCard>

      {/* Layer 2 — type-to-confirm modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => { if (!deleting) setDeleteModalVisible(false); }}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalCard}>
            <Text style={styles.deleteModalTitle}>
              {t('deleteAccountFinalTitle', undefined, 'Confirm account deletion')}
            </Text>
            <Text style={styles.deleteModalText}>
              {t('deleteAccountTypeToConfirm', { username: username || '' }, 'To confirm, type your username {{username}} below.')}
            </Text>
            <TextInput
              style={styles.deleteModalInput}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder={username || ''}
              placeholderTextColor="rgba(255,255,255,0.4)"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!deleting}
            />
            <View style={styles.deleteModalButtons}>
              <Pressable
                style={[styles.deleteModalBtn, styles.deleteModalCancel]}
                onPress={() => setDeleteModalVisible(false)}
                disabled={deleting}
              >
                <Text style={styles.deleteModalBtnText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.deleteModalBtn, styles.deleteModalConfirm, (!confirmMatches || deleting) && { opacity: 0.5 }]}
                onPress={confirmDelete}
                disabled={!confirmMatches || deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.deleteModalBtnText}>{t('deleteAccountPermanently', undefined, 'Permanently Delete')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  suspensionBanner: {
    backgroundColor: 'rgba(244, 67, 54, 0.15)',
    borderWidth: 2,
    borderColor: '#f44336',
    borderRadius: 20,
    padding: 24,
  },
  suspensionTitle: {
    fontSize: 22,
    color: '#f44336',
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  timeRemainingCard: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  timeRemainingLabel: {
    color: '#b0b0b0',
    fontSize: 11,
    fontFamily: 'Lexend-Medium',
    marginBottom: 4,
  },
  timeRemainingValue: {
    color: '#ffd700',
    fontSize: 24,
    fontFamily: 'Lexend-Bold',
  },
  timeRemainingExpires: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'Lexend',
    marginTop: 4,
  },
  reasonCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  reasonLabel: {
    color: '#b0b0b0',
    fontSize: 11,
    fontFamily: 'Lexend-Medium',
    marginBottom: 6,
  },
  reasonText: {
    color: '#e0e0e0',
    fontSize: 15,
    fontFamily: 'Lexend',
    lineHeight: 22,
  },
  suspensionExplanation: {
    color: '#b0b0b0',
    fontSize: 13,
    fontFamily: 'Lexend',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  appealCard: {
    backgroundColor: 'rgba(88, 101, 242, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(88, 101, 242, 0.3)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  appealTitle: {
    color: '#5865F2',
    fontFamily: 'Lexend-Bold',
    fontSize: 15,
    marginBottom: 8,
  },
  appealText: {
    color: '#b0b0b0',
    fontSize: 13,
    fontFamily: 'Lexend',
    textAlign: 'center',
    marginBottom: 12,
  },
  discordButton: {
    backgroundColor: '#5865F2',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  discordButtonText: {
    color: '#fff',
    fontFamily: 'Lexend-Bold',
    fontSize: 14,
  },
  nameChangeBanner: {
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    borderWidth: 2,
    borderColor: '#ff9800',
    borderRadius: 20,
    padding: 24,
  },
  nameChangeTitle: {
    fontSize: 22,
    color: '#ff9800',
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  modStat: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  modStatLabel: {
    fontSize: 10,
    color: '#b0b0b0',
    fontFamily: 'Lexend-Medium',
    marginBottom: 4,
  },
  modStatValue: {
    fontSize: 20,
    fontFamily: 'Lexend-Bold',
  },
  subTabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  subTab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  subTabActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderColor: '#ffd700',
  },
  subTabText: {
    color: '#b0b0b0',
    fontSize: 12,
    fontFamily: 'Lexend',
  },
  subTabTextActive: {
    color: '#ffd700',
    fontFamily: 'Lexend-Bold',
  },
  sectionDesc: {
    color: '#888',
    fontSize: 13,
    fontFamily: 'Lexend',
    textAlign: 'center',
    marginBottom: 16,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    fontFamily: 'Lexend',
    textAlign: 'center',
    paddingVertical: 24,
  },
  reasonBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  reasonBadgeText: {
    color: '#888',
    fontSize: 10,
    fontFamily: 'Lexend',
  },
  dangerDesc: {
    color: '#b0b0b0',
    fontSize: 13,
    fontFamily: 'Lexend',
    textAlign: 'center',
    marginVertical: 12,
    lineHeight: 19,
  },
  deleteAccountButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(220, 53, 69, 0.6)',
    alignItems: 'center',
  },
  deleteAccountButtonText: {
    color: '#ff6b6b',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 14,
  },
  restoreAccountButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#2e7d32',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  restoreAccountButtonText: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 14,
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  deleteModalCard: {
    backgroundColor: '#1a0a0a',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#dc3545',
    padding: 22,
    width: '100%',
    maxWidth: 400,
  },
  deleteModalTitle: {
    color: '#ff6b6b',
    fontSize: 18,
    fontFamily: 'Lexend-Bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  deleteModalText: {
    color: '#e0e0e0',
    fontSize: 14,
    fontFamily: 'Lexend',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 20,
  },
  deleteModalInput: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Lexend',
    marginBottom: 16,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  deleteModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  deleteModalCancel: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  deleteModalConfirm: {
    backgroundColor: '#dc3545',
  },
  deleteModalBtnText: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 14,
  },
});
