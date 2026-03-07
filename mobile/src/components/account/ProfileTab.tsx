import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  TextInput,
  Modal,
  StyleSheet,
  ActivityIndicator,
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

  if (!profileData) return null;

  const joinedAgo = profileData.createdAt
    ? msToTime(Date.now() - new Date(profileData.createdAt).getTime())
    : null;

  const gamesCount = profileData.gamesLen ?? profileData.gamesPlayed ?? 0;

  const handleChangeName = () => {
    if (!secret) return;
    // Use cross-platform modal instead of iOS-only Alert.prompt
    setNewUsername('');
    setNameModalVisible(true);
  };

  const submitNameChange = async () => {
    if (!secret || !newUsername.trim()) return;
    setChangingName(true);
    setNameModalVisible(false);
    try {
      const response = await api.setName(secret, newUsername.trim());
      if (response.message) {
        Alert.alert('Error', response.message);
      } else {
        Alert.alert('Success', 'Username changed successfully');
        onUsernameChanged?.();
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred');
    } finally {
      setChangingName(false);
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

  const showNameChange = profileData.pendingNameChange || profileData.canChangeUsername;

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
                  Username was recently changed
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

      {/* Cross-platform Name Change Modal */}
      <Modal
        visible={nameModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setNameModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {profileData.pendingNameChange ? 'Change Username (Required)' : 'Change Username'}
            </Text>
            {profileData.pendingNameChange && (
              <Text style={styles.modalSubtext}>
                Your username has been flagged and must be changed.
              </Text>
            )}
            <TextInput
              style={styles.modalInput}
              placeholder="Enter new username"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={newUsername}
              onChangeText={setNewUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              maxLength={20}
            />
            <View style={styles.modalButtons}>
              {!profileData.pendingNameChange && (
                <Pressable
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => setNameModalVisible(false)}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.modalButton, styles.modalButtonConfirm, !newUsername.trim() && { opacity: 0.5 }]}
                onPress={submitNameChange}
                disabled={!newUsername.trim()}
              >
                <Text style={styles.modalButtonText}>Change</Text>
              </Pressable>
            </View>
          </View>
        </View>
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
  // Name change modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: 'rgba(36, 87, 52, 0.95)',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
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
    marginBottom: 16,
    marginTop: 8,
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
});
