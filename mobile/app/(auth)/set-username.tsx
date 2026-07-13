import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Pressable } from '../../src/components/ui/SfxPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, t, validateUsername, USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH } from '../../src/shared';
import { useAuthStore } from '../../src/store/authStore';
import { commonStyles, spacing, fontSizes, borderRadius } from '../../src/styles/theme';

export default function SetUsernameScreen() {
  const router = useRouter();
  const { setUsername, isLoading } = useAuthStore();
  const [username, setUsernameInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const validationError = validateUsername(username);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);

    try {
      const result = await setUsername(username);
      if (result.success) {
        router.replace('/(tabs)/home');
      } else {
        setError(result.error || t('error', undefined, 'An error occurred'));
      }
    } catch (err) {
      console.error('Set username error:', err);
      setError(t('unexpectedErrorOccurred', undefined, 'An unexpected error occurred'));
    }
  };

  const isValid = username.length >= USERNAME_MIN_LENGTH && !validateUsername(username);

  return (
    <SafeAreaView style={commonStyles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="person-add" size={48} color={colors.primary} />
          </View>

          <Text style={styles.title}>{t('chooseUsername', undefined, 'Choose a Username')}</Text>
          <Text style={styles.subtitle}>
            {t('usernameVisibleToOthers', undefined, 'This is how other players will see you')}
          </Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                error && styles.inputError,
              ]}
              placeholder={t('enterUsernameBox')}
              placeholderTextColor={colors.textMuted}
              value={username}
              onChangeText={(text) => {
                setUsernameInput(text);
                setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={USERNAME_MAX_LENGTH}
            />
            {username.length > 0 && (
              <View style={styles.inputStatus}>
                {isValid ? (
                  <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                ) : (
                  <Ionicons name="close-circle" size={24} color={colors.error} />
                )}
              </View>
            )}
          </View>

          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          <Text style={styles.hint}>
            {t('usernameRulesHint', { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH }, '3-30 characters, letters, numbers, and underscores only')}
          </Text>
        </View>

        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              !isValid && styles.submitButtonDisabled,
              pressed && isValid && { opacity: 0.8 },
            ]}
            onPress={handleSubmit}
            disabled={!isValid || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitButtonText}>{t('continue', undefined, 'Continue')}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['2xl'],
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(36, 87, 52, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  title: {
    fontSize: fontSizes['2xl'],
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    marginBottom: spacing['3xl'],
    textAlign: 'center',
  },
  inputContainer: {
    width: '100%',
    position: 'relative',
  },
  input: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingRight: 50,
    fontSize: fontSizes.lg,
    color: colors.text,
    borderWidth: 2,
    borderColor: 'transparent',
    textAlign: 'center',
  },
  inputError: {
    borderColor: colors.error,
  },
  inputStatus: {
    position: 'absolute',
    right: spacing.lg,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  errorText: {
    color: colors.error,
    fontSize: fontSizes.sm,
    marginTop: spacing.md,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  footer: {
    padding: spacing['2xl'],
    paddingBottom: spacing['3xl'],
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.white,
  },
});
