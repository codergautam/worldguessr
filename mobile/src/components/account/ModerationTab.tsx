import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from 'react-native';
import { api } from '../../services/api';
import { GlassCard, sharedStyles } from './shared';

interface ModerationTabProps {
  secret: string;
  banned?: boolean;
  banType?: string;
  banExpiresAt?: string;
  banPublicNote?: string;
  pendingNameChange?: boolean;
  pendingNameChangePublicNote?: string;
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
}: ModerationTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ModerationData | null>(null);
  const [activeSection, setActiveSection] = useState<SubTab>(
    banned || pendingNameChange ? 'history' : 'refunds'
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await api.userModerationData(secret);
        setData(result);
      } catch (err: any) {
        setError(err.message || 'Failed to load');
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
    if (diff <= 0) return 'Expired';

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
      case 'open': return 'Open';
      case 'action_taken': return 'Action Taken';
      case 'ignored': return 'Ignored';
      default: return status;
    }
  };

  const getReasonText = (reason: string) => {
    switch (reason) {
      case 'inappropriate_username': return 'Inappropriate Username';
      case 'cheating': return 'Cheating';
      case 'other': return 'Other';
      default: return reason;
    }
  };

  if (loading) {
    return (
      <GlassCard>
        <View style={{ alignItems: 'center', gap: 16, paddingVertical: 40 }}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontFamily: 'Lexend' }}>
            Loading moderation data...
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
            Error: {error}
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
            {banType === 'temporary' ? 'Account Temporarily Suspended' : 'Account Suspended'}
          </Text>

          {banType === 'temporary' && banExpiresAt && (
            <View style={styles.timeRemainingCard}>
              <Text style={styles.timeRemainingLabel}>TIME REMAINING</Text>
              <Text style={styles.timeRemainingValue}>{getTimeRemaining(banExpiresAt)}</Text>
              <Text style={styles.timeRemainingExpires}>
                Expires: {new Date(banExpiresAt).toLocaleString()}
              </Text>
            </View>
          )}

          {banPublicNote && (
            <View style={styles.reasonCard}>
              <Text style={styles.reasonLabel}>REASON</Text>
              <Text style={styles.reasonText}>{banPublicNote}</Text>
            </View>
          )}

          <Text style={styles.suspensionExplanation}>
            {banType === 'temporary'
              ? 'Your account has been temporarily suspended. You will regain access when the suspension expires.'
              : 'Your account has been permanently suspended.'}
          </Text>

          {/* Appeal */}
          <View style={styles.appealCard}>
            <Text style={styles.appealTitle}>Want to Appeal?</Text>
            <Text style={styles.appealText}>
              Appeals are handled through our Discord server.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.discordButton, pressed && { opacity: 0.8 }]}
              onPress={() => Linking.openURL('https://discord.gg/ADw47GAyS5')}
            >
              <Text style={styles.discordButtonText}>Join Discord</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Name Change Required Banner */}
      {pendingNameChange && (
        <View style={styles.nameChangeBanner}>
          <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>✏️</Text>
          <Text style={styles.nameChangeTitle}>Username Change Required</Text>
          {pendingNameChangePublicNote && (
            <View style={styles.reasonCard}>
              <Text style={styles.reasonLabel}>REASON</Text>
              <Text style={styles.reasonText}>{pendingNameChangePublicNote}</Text>
            </View>
          )}
          <Text style={[styles.suspensionExplanation, { color: '#e0e0e0' }]}>
            Your username has been flagged. Please change it from the Profile tab.
          </Text>
        </View>
      )}

      {/* Stats Card */}
      <GlassCard>
        <Text style={sharedStyles.cardTitle}>Moderation</Text>
        <View style={sharedStyles.statsGrid}>
          <View style={styles.modStat}>
            <Text style={styles.modStatLabel}>ELO REFUNDED</Text>
            <Text style={[styles.modStatValue, { color: '#4caf50' }]}>
              +{data?.totalEloRefunded || 0}
            </Text>
          </View>
          <View style={styles.modStat}>
            <Text style={styles.modStatLabel}>REPORTS FILED</Text>
            <Text style={[styles.modStatValue, { color: '#ffd700' }]}>
              {data?.reportStats?.total || 0}
            </Text>
          </View>
          <View style={styles.modStat}>
            <Text style={styles.modStatLabel}>EFFECTIVE</Text>
            <Text style={[styles.modStatValue, { color: '#4caf50' }]}>
              {data?.reportStats?.actionTaken || 0}
            </Text>
          </View>
        </View>

        {/* Sub-tabs */}
        <View style={styles.subTabRow}>
          {(['refunds', 'history', 'reports'] as SubTab[]).map((tab) => {
            const labels: Record<SubTab, string> = {
              refunds: `ELO Refunds (${data?.eloRefunds?.length || 0})`,
              history: `History (${data?.moderationHistory?.length || 0})`,
              reports: `My Reports (${data?.submittedReports?.length || 0})`,
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
            <Text style={[sharedStyles.cardTitle, { fontSize: 18 }]}>ELO Refunds</Text>
            <Text style={styles.sectionDesc}>
              ELO points refunded when opponents were banned for cheating.
            </Text>
            {(data?.eloRefunds?.length || 0) > 0 ? (
              data!.eloRefunds.map((refund) => (
                <View key={refund.id} style={styles.listItem}>
                  <View>
                    <Text style={{ color: '#4caf50', fontFamily: 'Lexend-Bold', fontSize: 16 }}>
                      +{refund.amount} ELO
                    </Text>
                    <Text style={{ color: '#888', fontSize: 12, fontFamily: 'Lexend', marginTop: 4 }}>
                      From: <Text style={{ color: '#f44336' }}>{refund.bannedUsername}</Text>
                    </Text>
                  </View>
                  <Text style={{ color: '#888', fontSize: 12, fontFamily: 'Lexend' }}>
                    {formatDate(refund.date)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No ELO refunds yet</Text>
            )}
          </>
        )}

        {activeSection === 'history' && (
          <>
            <Text style={[sharedStyles.cardTitle, { fontSize: 18 }]}>Account History</Text>
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
                        Expires: {formatDate(item.expiresAt)}
                      </Text>
                    )}
                  </View>
                  <Text style={{ color: '#888', fontSize: 12, fontFamily: 'Lexend' }}>
                    {formatDate(item.date)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No moderation actions</Text>
            )}
          </>
        )}

        {activeSection === 'reports' && (
          <>
            <Text style={[sharedStyles.cardTitle, { fontSize: 18 }]}>Reports You Submitted</Text>
            <Text style={styles.sectionDesc}>
              Report outcomes are kept private to protect the review process.
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
              <Text style={styles.emptyText}>No reports submitted</Text>
            )}
          </>
        )}
      </GlassCard>
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
});
