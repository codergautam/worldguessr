import { useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Pressable } from '../ui/SfxPressable';
import { useRouter } from 'expo-router';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { t } from '../../shared';

/**
 * Danger Zone body for the Settings screen (moved here from the account
 * ModerationTab — web parity: the danger zone lives under the Account
 * settings section of the settings modal).
 *
 * Delete is a 2-layer confirm: warning Alert, then type-to-confirm modal.
 * If a deletion is already scheduled (re-logged in during the 30-day grace
 * window), this offers Restore instead of Delete.
 */
export default function DangerZoneSection() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const secret = useAuthStore((s) => s.secret);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const username = user?.username;
  const confirmMatches =
    !!username && deleteConfirmText.trim().toLowerCase() === username.toLowerCase();

  // Layer 1: warning Alert. On "Continue", open the type-to-confirm modal.
  const startDelete = () => {
    const supporterWarning = user?.supporter
      ? '\n\n' + t('deleteAccountWarningSupporter', undefined, 'You are a Supporter — deleting your account permanently removes your ad-free perk and badge. This cannot be restored even on a new account.')
      : '';
    Alert.alert(
      t('deleteAccountConfirmTitle', undefined, 'Delete your account?'),
      t('deleteAccountConfirmBody', { days: 30 }, 'Your account will be permanently deleted in {{days}} days. Log back in before then to restore it. You will lose your XP, ELO, friends, and created maps.') + supporterWarning,
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

  // Layer 2: type-to-confirm. Schedules deletion (fast — 30-day grace) then logs out.
  const confirmDelete = async () => {
    if (deleting || !confirmMatches || !secret) return;
    try {
      setDeleting(true);
      await api.deleteAccount(secret);
      setDeleteModalVisible(false);
      await logout();
      router.navigate('/(tabs)/home');
    } catch (e: any) {
      Alert.alert(t('error', undefined, 'Error'), e?.message || String(e));
      setDeleting(false);
    }
  };

  // Cancel a scheduled deletion (account is inside its 30-day grace window).
  const handleRestore = async () => {
    if (restoring || !secret) return;
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

  return (
    <View>
      {user?.pendingDeletion ? (
        <>
          <Text style={[styles.dangerDesc, { color: '#e0e0e0' }]}>
            {user?.scheduledDeletionAt
              ? t('accountScheduledForDeletion', { date: new Date(user.scheduledDeletionAt).toLocaleDateString() }, 'Your account is scheduled for deletion on {{date}}.')
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
  dangerDesc: {
    color: '#b0b0b0',
    fontSize: 13,
    fontFamily: 'Lexend',
    marginBottom: 12,
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
