import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/shared';
import { useAuthStore } from '../../src/store/authStore';
import { commonStyles, spacing, fontSizes, borderRadius } from '../../src/styles/theme';
import ProfileView from '../../src/components/account/ProfileView';
import AccountSelectSheet from '../../src/components/auth/AccountSelectSheet';

export default function AccountScreen() {
  const router = useRouter();
  const { user, secret, logout, isLoading: authLoading, loadSession } = useAuthStore();
  const [accountSheetVisible, setAccountSheetVisible] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.navigate('/(tabs)/home');
  };

  const handleLogin = async () => {
    if (authLoading) return;
    setAccountSheetVisible(true);
  };

  if (!user) {
    return (
      <SafeAreaView style={commonStyles.container} edges={['top']}>
        <View style={commonStyles.centered}>
          <Pressable
            style={({ pressed }) => [
              styles.loginButton,
              pressed && { opacity: 0.8 },
              authLoading && { opacity: 0.6 },
            ]}
            onPress={handleLogin}
            disabled={authLoading}
          >
            {authLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <View style={styles.loginButtonContent}>
                <Ionicons name="person-circle" size={20} color={colors.white} />
                <Text style={styles.loginButtonText}>Sign in</Text>
              </View>
            )}
          </Pressable>
          <AccountSelectSheet visible={accountSheetVisible} onClose={() => setAccountSheetVisible(false)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ProfileView
      isOwnProfile
      secret={secret!}
      user={user}
      onLogout={handleLogout}
      onBack={() => router.navigate('/(tabs)/home')}
      onRefreshUser={loadSession}
      onNavigateToUser={(username) => router.push(`/user/${username}`)}
    />
  );
}

const styles = StyleSheet.create({
  loginButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['3xl'],
    borderRadius: borderRadius.md,
  },
  loginButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  loginButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.white,
  },
});
