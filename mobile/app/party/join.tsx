/**
 * Join a private game by entering a 6-digit code.
 *
 * Thin entry screen: it only collects the code and calls joinPrivateGame. It
 * does NOT render a lobby or navigate to the game — home.tsx pushes the unified
 * /game/multiplayer screen (which renders the lobby) as soon as `inGame` flips.
 */

import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ImageBackground,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, t } from '../../src/shared';
import { haptics } from '../../src/services/haptics';
import { spacing, fontSizes, borderRadius } from '../../src/styles/theme';
import { useMultiplayerStore } from '../../src/store/multiplayerStore';

export default function PartyJoinScreen() {
  const router = useRouter();
  // Landscape is height-bound: the auto-focused number pad covers most of a short
  // viewport, so the content is made scrollable and the input/button are compacted.
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const inputRef = useRef<TextInput>(null);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const joinPrivateGame = useMultiplayerStore((s) => s.joinPrivateGame);
  const joinError = useMultiplayerStore((s) => s.joinError);

  // Auto-focus input
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  // Clear error when code changes
  useEffect(() => {
    if (joinError) {
      useMultiplayerStore.setState({ joinError: null });
    }
  }, [code]);

  // A join error means the attempt failed — re-enable the button
  useEffect(() => {
    if (joinError) {
      setJoining(false);
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
    }
  }, [joinError]);

  // Clear the safety timeout on unmount (success navigates away before it fires).
  useEffect(() => () => {
    if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
  }, []);

  const handleJoin = () => {
    if (code.length !== 6) return;
    haptics.medium(); // committing to join a party
    setJoining(true);
    joinPrivateGame(code);
    // Safety net: if the server never answers (dropped packet / silent drop),
    // re-enable the button instead of spinning forever.
    if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
    joinTimeoutRef.current = setTimeout(() => setJoining(false), 5000);
  };

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/street2.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        fadeDuration={0}
      />
      <View style={styles.darkOverlay} />
      <LinearGradient
        colors={[
          'rgba(20, 65, 25, 0.85)',
          'rgba(20, 65, 25, 0.6)',
          'rgba(0, 0, 0, 0.7)',
        ]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('joinGame')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.codeLabel}>{t('gameCode')}</Text>

            <TextInput
              ref={inputRef}
              style={[styles.codeInput, isLandscape && styles.codeInputLandscape]}
              value={code}
              onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor="rgba(255, 255, 255, 0.2)"
              autoFocus
            />

            {joinError && <Text style={styles.errorText}>{joinError}</Text>}

            <Pressable
              style={({ pressed }) => [
                styles.joinBtn,
                isLandscape && styles.joinBtnLandscape,
                code.length !== 6 && styles.joinBtnDisabled,
                pressed && code.length === 6 && { opacity: 0.85 },
              ]}
              onPress={handleJoin}
              disabled={code.length !== 6 || joining}
            >
              {joining ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.joinBtnText}>{t('join')}</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1a0c' },
  darkOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: colors.white, fontSize: fontSizes.lg, fontFamily: 'Lexend-Bold' },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  codeLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend-SemiBold',
    letterSpacing: 2,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  codeInput: {
    color: colors.white,
    fontSize: 36,
    fontFamily: 'Lexend-Bold',
    letterSpacing: 8,
    textAlign: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    width: '100%',
    maxWidth: 300,
  },
  codeInputLandscape: { paddingVertical: spacing.md },
  errorText: {
    color: colors.error,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  joinBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['3xl'],
    borderRadius: borderRadius.lg,
    minWidth: 160,
    alignItems: 'center',
  },
  joinBtnLandscape: { marginTop: spacing.lg },
  joinBtnDisabled: { opacity: 0.5 },
  joinBtnText: { color: colors.white, fontSize: fontSizes.md, fontFamily: 'Lexend-Bold' },
});
