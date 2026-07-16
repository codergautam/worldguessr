import { useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Pressable } from '../../src/components/ui/SfxPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, t } from '../../src/shared';
import { useAuthStore } from '../../src/store/authStore';
import { commonStyles, spacing, fontSizes, borderRadius } from '../../src/styles/theme';
import ProfileView from '../../src/components/account/ProfileView';
import AccountSelectSheet from '../../src/components/auth/AccountSelectSheet';
import { useLoginPrompt } from '../../src/hooks/useGoogleSignIn';

type AccountTabParam = 'profile' | 'history' | 'elo' | 'friends' | 'moderation';
const VALID_ACCOUNT_TABS: AccountTabParam[] = ['profile', 'history', 'elo', 'friends', 'moderation'];

export default function AccountScreen() {
  const router = useRouter();
  const { user, secret, logout, isLoading: authLoading, loadSession } = useAuthStore();
  const [accountSheetVisible, setAccountSheetVisible] = useState(false);
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const initialTab = tab && (VALID_ACCOUNT_TABS as string[]).includes(tab)
    ? (tab as AccountTabParam)
    : undefined;

  const handleLogout = async () => {
    await logout();
    router.navigate('/(tabs)/home');
  };

  // Android: straight to native Google sign-in; iOS: chooser sheet.
  const handleLogin = useLoginPrompt(() => setAccountSheetVisible(true));

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
                <Text style={styles.loginButtonText}>{t('signIn')}</Text>
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
      initialTab={initialTab}
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
