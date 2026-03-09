import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  TextInput,
  Modal,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import {
  GlassCard,
  ProgressionGraph,
  msToTime,
  sharedStyles,
  ProgressionEntry,
} from './shared';
import CountryFlag from '../CountryFlag';

interface ProfileTabProps {
  profileData: {
    username?: string;
    totalXp?: number;
    createdAt?: string;
    gamesLen?: number;
    gamesPlayed?: number;
    profileViews?: number;
    canChangeUsername?: boolean;
    daysUntilNameChange?: number;
    recentChange?: boolean;
    countryCode?: string;
    pendingNameChange?: boolean;
    pendingNameChangePublicNote?: string;
  } | null;
  isOwnProfile: boolean;
  secret?: string;
  onLogout?: () => void;
  onChangeFlag?: () => void;
  onUsernameChanged?: () => void;
  progression: ProgressionEntry[];
  progressionLoading: boolean;
  screenWidth: number;
  onScrollEnable?: (enabled: boolean) => void;
  viewingPublicProfile?: boolean;
}

interface ExistingRequest {
  requestedUsername: string;
  status: 'pending' | 'rejected';
  rejectionReason?: string;
  rejectionCount?: number;
  createdAt: string;
}

export default function ProfileTab({
  profileData,
  isOwnProfile,
  secret,
  onLogout,
  onChangeFlag,
  onUsernameChanged,
  progression,
  progressionLoading,
  screenWidth,
  onScrollEnable,
  viewingPublicProfile,
}: ProfileTabProps) {
  const [changingName, setChangingName] = useState(false);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [existingRequest, setExistingRequest] = useState<ExistingRequest | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  if (!profileData) return null;

  const joinedAgo = profileData.createdAt
    ? msToTime(Date.now() - new Date(profileData.createdAt).getTime())
    : null;

  const gamesCount = profileData.gamesLen ?? profileData.gamesPlayed ?? 0;

  const handleChangeName = async () => {
    if (!secret) return;
    setNewUsername('');
    setModalError(null);
    setSubmitSuccess(false);
    setExistingRequest(null);
    setNameModalVisible(true);

    // For forced name changes, check existing request status
    if (profileData.pendingNameChange) {
      setCheckingStatus(true);
      try {
        const status = await api.checkNameChangeStatus(secret);
        if (status.request) {
          setExistingRequest(status.request as ExistingRequest);
        }
      } catch {
        // Silently fail — user can still submit
      } finally {
        setCheckingStatus(false);
      }
    }
  };

  const validateUsername = (name: string): string | null => {
    if (name.length < 3 || name.length > 20) {
      return 'Username must be between 3 and 20 characters';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      return 'Username can only contain letters, numbers, and underscores';
    }
    return null;
  };

  const submitNameChange = async () => {
    if (!secret || !newUsername.trim()) return;

    const trimmed = newUsername.trim();
    const validationError = validateUsername(trimmed);
    if (validationError) {
      setModalError(validationError);
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      const response = await api.setName(secret, trimmed);
      if (response.message) {
        setModalError(response.message);
      } else if (response.pendingReview) {
        // Forced name change — submitted for review
        setSubmitSuccess(true);
        setExistingRequest({ requestedUsername: trimmed, status: 'pending', createdAt: new Date().toISOString() });
      } else {
        // Normal name change — immediate success
        setNameModalVisible(false);
        Alert.alert('Success', 'Username changed successfully');
        onUsernameChanged?.();
      }
    } catch {
      setModalError('An error occurred. Please try again.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => onLogout?.(),
        },
      ]
    );
  };

  return (
    <View style={{ gap: 20 }}>
      {/* Stats Card */}
      <GlassCard>
        {joinedAgo && (
          <View style={sharedStyles.statRow}>
            <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.8)" style={sharedStyles.statIcon} />
            <Text style={sharedStyles.statText}>Joined {joinedAgo} ago</Text>
          </View>
        )}

        <View style={sharedStyles.statRow}>
          <Ionicons name="star" size={16} color="#ffd700" style={sharedStyles.statIcon} />
          <Text style={sharedStyles.statText}>{(profileData.totalXp || 0).toLocaleString()} XP</Text>
        </View>

        <View style={sharedStyles.statRow}>
          <Ionicons name="game-controller" size={16} color="rgba(255,255,255,0.8)" style={sharedStyles.statIcon} />
          <Text style={sharedStyles.statText}>Games Played: {gamesCount.toLocaleString()}</Text>
        </View>

        {viewingPublicProfile && profileData.profileViews != null && (
          <View style={sharedStyles.statRow}>
            <Ionicons name="people" size={16} color="rgba(255,255,255,0.8)" style={sharedStyles.statIcon} />
            <Text style={sharedStyles.statText}>Profile Views: {profileData.profileViews.toLocaleString()}</Text>
          </View>
        )}

        {/* Own profile action buttons */}
        {isOwnProfile && (
          <View style={{ gap: 12, marginTop: 10 }}>
            {/* Forced Name Change Warning */}
            {profileData.pendingNameChange && (
              <Pressable
                style={({ pressed }) => [
                  styles.orangeButton,
                  pressed && { opacity: 0.8 },
                  changingName && { opacity: 0.6 },
                ]}
                onPress={handleChangeName}
                disabled={changingName}
              >
                {changingName ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="warning" size={18} color="#fff" />
                    <Text style={sharedStyles.actionButtonText}>Change Name (Required)</Text>
                  </View>
                )}
              </Pressable>
            )}

            {/* Normal Change Name Button */}
            {!profileData.pendingNameChange && profileData.canChangeUsername && (
              <Pressable
                style={({ pressed }) => [
                  styles.greenButton,
                  pressed && { opacity: 0.8 },
                  changingName && { opacity: 0.6 },
                ]}
                onPress={handleChangeName}
                disabled={changingName}
              >
                {changingName ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={sharedStyles.actionButtonText}>Change Name</Text>
                )}
              </Pressable>
            )}

            {/* Recent change warning */}
            {!profileData.pendingNameChange && profileData.recentChange && (
              <View style={styles.warningCard}>
                <Text style={styles.warningText}>
                  Username was recently changed, might take a few hours to fully update
                </Text>
              </View>
            )}

            {/* Name change cooldown warning */}
            {!profileData.pendingNameChange && !profileData.canChangeUsername && profileData.daysUntilNameChange != null && profileData.daysUntilNameChange > 0 && (
              <View style={styles.warningCard}>
                <Text style={styles.warningText}>
                  Name change available in {profileData.daysUntilNameChange} days
                </Text>
              </View>
            )}

            {/* Change Country Flag Button */}
            <Pressable
              style={({ pressed }) => [
                styles.blueButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={onChangeFlag}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {profileData.countryCode && (
                  <CountryFlag countryCode={profileData.countryCode} size={20} />
                )}
                <Text style={sharedStyles.actionButtonText}>
                  {profileData.countryCode ? 'Change Flag' : 'Set Flag'}
                </Text>
              </View>
            </Pressable>
          </View>
        )}
      </GlassCard>

      {/* XP Progression Graph */}
      <ProgressionGraph
        data={progression}
        loading={progressionLoading}
        mode="xp"
        screenWidth={screenWidth}
        onChartTouch={onScrollEnable}
      />

      {/* Logout Button (own profile only) */}
      {isOwnProfile && (
        <Pressable
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleLogout}
        >
          <Text style={[sharedStyles.actionButtonText, { color: '#dc3545' }]}>Logout</Text>
        </Pressable>
      )}

      {/* Name Change Modal */}
      <Modal
        visible={nameModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setNameModalVisible(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            {/* Close button */}
            <Pressable
              style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.6 }]}
              onPress={() => setNameModalVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>×</Text>
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {profileData.pendingNameChange ? 'Username Change Required' : 'Change Username'}
              </Text>

              {/* Forced change description */}
              {profileData.pendingNameChange && (
                <Text style={styles.modalSubtext}>
                  Your username has been flagged as inappropriate. You can still play singleplayer, but multiplayer is disabled until your new name is approved.
                </Text>
              )}

              {/* Public note from moderator */}
              {profileData.pendingNameChange && profileData.pendingNameChangePublicNote && (
                <View style={styles.reasonBox}>
                  <Text style={styles.reasonText}>
                    Reason: {profileData.pendingNameChangePublicNote}
                  </Text>
                </View>
              )}

              {/* Loading status check */}
              {checkingStatus && (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <ActivityIndicator color="#fff" size="small" />
                </View>
              )}

              {/* Pending review state */}
              {!checkingStatus && existingRequest?.status === 'pending' && (
                <View style={styles.pendingBox}>
                  <Text style={styles.pendingTitle}>Awaiting Approval</Text>
                  <Text style={styles.pendingText}>
                    Your requested username "{existingRequest.requestedUsername}" is being reviewed by our moderation team.
                  </Text>
                  <Text style={styles.pendingNote}>
                    You will be able to play multiplayer once approved. This usually takes less than 7 days.
                  </Text>
                  <View style={styles.divider}>
                    <Text style={styles.dividerText}>or submit a different name</Text>
                  </View>
                </View>
              )}

              {/* Rejected state */}
              {!checkingStatus && existingRequest?.status === 'rejected' && (
                <View style={styles.rejectedBox}>
                  <Text style={styles.rejectedTitle}>Name Rejected</Text>
                  <Text style={styles.rejectedText}>
                    Your requested username "{existingRequest.requestedUsername}" was rejected.
                  </Text>
                  {existingRequest.rejectionReason && (
                    <Text style={styles.rejectedReason}>
                      Reason: {existingRequest.rejectionReason}
                    </Text>
                  )}
                  <Text style={styles.pendingNote}>
                    Please choose a different username below.
                  </Text>
                </View>
              )}

              {/* Success after fresh submission */}
              {submitSuccess && !existingRequest?.status ? (
                <View style={styles.successBox}>
                  <Text style={styles.successTitle}>Request Submitted</Text>
                  <Text style={styles.successText}>
                    Your name change request has been submitted for review.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Input */}
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Enter new username"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={newUsername}
                    onChangeText={(text) => {
                      setNewUsername(text);
                      setModalError(null);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    maxLength={20}
                    editable={!modalLoading}
                  />
                  <Text style={styles.hintText}>
                    3-20 characters, letters, numbers, and underscores only
                  </Text>

                  {/* Error */}
                  {modalError && (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>{modalError}</Text>
                    </View>
                  )}

                  {/* Buttons */}
                  <View style={styles.modalButtons}>
                    {!profileData.pendingNameChange && (
                      <Pressable
                        style={[styles.modalButton, styles.modalButtonCancel]}
                        onPress={() => setNameModalVisible(false)}
                        disabled={modalLoading}
                      >
                        <Text style={styles.modalButtonText}>Cancel</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.modalButton, styles.modalButtonConfirm, (!newUsername.trim() || modalLoading) && { opacity: 0.5 }]}
                      onPress={submitNameChange}
                      disabled={!newUsername.trim() || modalLoading}
                    >
                      {modalLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.modalButtonText}>
                          {profileData.pendingNameChange ? 'Submit' : 'Change'}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}

              {/* Contact support */}
              {profileData.pendingNameChange && (
                <Text style={styles.contactText}>
                  Need help? Contact support@worldguessr.com
                </Text>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  greenButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#28a745',
    alignItems: 'center',
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  orangeButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#e67e22',
    alignItems: 'center',
    shadowColor: '#e67e22',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  blueButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  logoutButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(220, 53, 69, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(220, 53, 69, 0.3)',
    alignItems: 'center',
  },
  warningCard: {
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.3)',
  },
  warningText: {
    color: '#ffc107',
    fontSize: 13,
    fontFamily: 'Lexend',
    textAlign: 'center',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalCloseBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  modalCard: {
    backgroundColor: 'rgba(36, 87, 52, 0.95)',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Lexend-SemiBold',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtext: {
    color: '#ffc107',
    fontSize: 14,
    fontFamily: 'Lexend',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  reasonBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  reasonText: {
    color: '#e0e0e0',
    fontSize: 13,
    fontFamily: 'Lexend',
  },
  pendingBox: {
    backgroundColor: 'rgba(210, 153, 34, 0.15)',
    borderWidth: 1,
    borderColor: '#d29922',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  pendingTitle: {
    color: '#d29922',
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
    marginBottom: 6,
  },
  pendingText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Lexend',
    marginBottom: 6,
  },
  pendingNote: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: 'Lexend',
  },
  divider: {
    alignItems: 'center',
    marginTop: 14,
  },
  dividerText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'Lexend',
  },
  rejectedBox: {
    backgroundColor: 'rgba(248, 81, 73, 0.15)',
    borderWidth: 1,
    borderColor: '#f85149',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  rejectedTitle: {
    color: '#f85149',
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
    marginBottom: 6,
  },
  rejectedText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Lexend',
    marginBottom: 6,
  },
  rejectedReason: {
    color: '#f85149',
    fontSize: 13,
    fontFamily: 'Lexend',
    fontStyle: 'italic',
    marginBottom: 6,
  },
  successBox: {
    backgroundColor: 'rgba(63, 185, 80, 0.15)',
    borderWidth: 1,
    borderColor: '#3fb950',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  successTitle: {
    color: '#3fb950',
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
    marginBottom: 6,
  },
  successText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Lexend',
  },
  modalInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Lexend',
    marginBottom: 4,
    marginTop: 8,
  },
  hintText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontFamily: 'Lexend',
    marginBottom: 12,
    marginLeft: 4,
  },
  errorBox: {
    backgroundColor: 'rgba(248, 81, 73, 0.15)',
    borderWidth: 1,
    borderColor: '#f85149',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#f85149',
    fontSize: 13,
    fontFamily: 'Lexend',
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modalButtonConfirm: {
    backgroundColor: '#28a745',
  },
  modalButtonText: {
    color: '#fff',
    fontFamily: 'Lexend-SemiBold',
    fontSize: 15,
  },
  contactText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'Lexend',
    textAlign: 'center',
    marginTop: 16,
  },
});
