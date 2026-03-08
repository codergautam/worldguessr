import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/shared';
import { useAuthStore } from '../../src/store/authStore';
import { useGoogleAuth } from '../../src/hooks/useGoogleAuth';
import { commonStyles, spacing, fontSizes, borderRadius } from '../../src/styles/theme';
import ProfileView from '../../src/components/account/ProfileView';

export default function AccountScreen() {
  const router = useRouter();
  const { user, secret, logout, isLoading: authLoading, loadSession } = useAuthStore();
  const { promptAsync, isReady: googleReady } = useGoogleAuth();

  const handleLogout = async () => {
    await logout();
    router.navigate('/(tabs)/home');
  };

  const handleLogin = async () => {
    try {
      await promptAsync();
    } catch (e) {
      console.error('Google login error:', e);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={commonStyles.container} edges={['top']}>
        <View style={commonStyles.centered}>
          <Pressable
            style={({ pressed }) => [
              styles.loginButton,
              pressed && { opacity: 0.8 },
              (authLoading || !googleReady) && { opacity: 0.6 },
            ]}
            onPress={handleLogin}
            disabled={authLoading || !googleReady}
          >
            {authLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <View style={styles.loginButtonContent}>
                <Ionicons name="logo-google" size={18} color={colors.white} />
                <Text style={styles.loginButtonText}>Sign in with Google</Text>
              </View>
            )}
          </Pressable>
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
