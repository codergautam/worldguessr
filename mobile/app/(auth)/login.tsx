import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/shared';
import { useAuthStore } from '../../src/store/authStore';
import { GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../../src/constants/config';
import { commonStyles, spacing, fontSizes, borderRadius } from '../../src/styles/theme';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithGoogle, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });

  const handleGoogleLogin = async () => {
    setError(null);

    try {
      const result = await promptAsync();

      if (result?.type === 'success') {
        const { id_token } = result.params;
        const success = await loginWithGoogle(id_token);

        if (success) {
          router.replace('/(tabs)/home');
        } else {
          setError('Login failed. Please try again.');
        }
      } else if (result?.type === 'error') {
        setError('Authentication error. Please try again.');
      }
    } catch (err) {
      console.error('Google login error:', err);
      setError('An unexpected error occurred.');
    }
  };

  const handleSkip = () => {
    // Guest mode - go to home without auth
    router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={commonStyles.container}>
      <View style={styles.container}>
        {/* Logo Section */}
        <View style={styles.logoSection}>
          <View style={styles.logoContainer}>
            <Ionicons name="globe" size={64} color={colors.primary} />
          </View>
          <Text style={styles.title}>WorldGuessr</Text>
          <Text style={styles.subtitle}>
            Explore the world, one location at a time
          </Text>
        </View>

        {/* Login Section */}
        <View style={styles.loginSection}>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.googleButton,
              pressed && { opacity: 0.8 },
              !request && styles.buttonDisabled,
            ]}
            onPress={handleGoogleLogin}
            disabled={!request || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color={colors.text} />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.skipButton,
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleSkip}
          >
            <Text style={styles.skipButtonText}>Continue as Guest</Text>
          </Pressable>

          <Text style={styles.disclaimer}>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing['2xl'],
  },
  logoSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(36, 87, 52, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  title: {
    fontSize: fontSizes['4xl'],
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  loginSection: {
    paddingBottom: spacing['2xl'],
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  googleButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: '#333',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing['2xl'],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  dividerText: {
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    fontSize: fontSizes.sm,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  skipButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  disclaimer: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing['2xl'],
    lineHeight: 18,
  },
});
