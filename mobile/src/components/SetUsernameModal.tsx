import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors } from '../shared';
import { useAuthStore } from '../store/authStore';

export default function SetUsernameModal() {
  const { isAuthenticated, user, setUsername: setUsernameApi } = useAuthStore();
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const visible = isAuthenticated && !user?.username;

  const handleSave = async () => {
    if (isLoading || !username.trim()) return;

    setIsLoading(true);
    setError('');

    const result = await setUsernameApi(username.trim());

    if (!result.success) {
      setError(result.error || 'An error occurred');
      setIsLoading(false);
    }
    // On success, the store updates user.username which hides this modal
  };

  if (!visible) return null;

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Welcome to WorldGuessr</Text>
          <Text style={styles.subtitle}>
            Please enter a username to get started
          </Text>

          <View style={styles.form}>
            <TextInput
              style={[styles.input, isLoading && styles.inputDisabled]}
              placeholder="Enter username"
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                setError('');
              }}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              editable={!isLoading}
              onSubmitEditing={handleSave}
              returnKeyType="done"
            />

            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                (!username.trim() || isLoading) && styles.saveButtonDisabled,
                pressed && username.trim() && !isLoading && styles.saveButtonPressed,
              ]}
              onPress={handleSave}
              disabled={!username.trim() || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: 'rgba(36, 87, 52, 0.52)',
    borderRadius: 24,
    padding: 36,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: colors.white,
    fontSize: 26,
    fontFamily: 'Lexend-SemiBold',
    marginBottom: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontFamily: 'Lexend',
    marginBottom: 28,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    width: '100%',
    gap: 16,
  },
  input: {
    width: '100%',
    padding: 16,
    fontSize: 16,
    fontFamily: 'Lexend',
    color: colors.white,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 2,
    borderColor: 'rgba(17, 43, 24, 0.8)',
    borderRadius: 12,
    textAlign: 'center',
  },
  inputDisabled: {
    opacity: 0.7,
  },
  saveButton: {
    width: '100%',
    padding: 16,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: 'rgba(17, 43, 24, 0.8)',
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonPressed: {
    backgroundColor: 'rgba(36, 87, 52, 1)',
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 16,
    fontFamily: 'Lexend-SemiBold',
  },
  errorContainer: {
    marginTop: 12,
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 71, 87, 0.3)',
    padding: 12,
    width: '100%',
  },
  errorText: {
    color: '#ff4757',
    fontSize: 14,
    fontFamily: 'Lexend',
    textAlign: 'center',
  },
});
