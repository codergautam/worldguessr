import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable } from '../src/components/ui/SfxPressable';
import { colors, t } from '../src/shared';
import { borderRadius, fontSizes, spacing } from '../src/styles/theme';
import { API_URL, HTTP_TIMEOUT_MS } from '../src/constants/config';
import { fetchWithTimeout } from '../src/services/fetchWithTimeout';
import { useAuthStore } from '../src/store/authStore';

/**
 * Universal-link handler for forum logins (DiscourseConnect).
 *
 * The app claims worldguessr.com links (associatedDomains/intentFilters), so
 * when a signed-in player taps "Log In" on worldguessr.forum in their phone
 * browser, the forum's redirect to www.worldguessr.com/discourse-sso opens THE
 * APP instead of the website — which is ideal: the app already holds the
 * session, so it can vouch instantly (no website login), then hand the signed
 * redirect back to the browser. worldguessr.forum is not a claimed domain, so
 * Linking.openURL returns the user to their browser, now logged in.
 */
export default function DiscourseSsoScreen() {
  const router = useRouter();
  const { sso, sig } = useLocalSearchParams<{ sso?: string; sig?: string }>();
  const { secret, isLoading, isAuthenticated } = useAuthStore();
  const [status, setStatus] = useState<'working' | 'login' | 'error' | 'done'>('working');
  const startedRef = useRef(false);

  useEffect(() => {
    // Wait for SecureStore hydration before judging the session
    if (isLoading || startedRef.current) return;

    if (!sso || !sig) {
      setStatus('error');
      return;
    }
    if (!isAuthenticated || !secret) {
      setStatus('login');
      return;
    }

    startedRef.current = true;
    (async () => {
      try {
        const res = await fetchWithTimeout(
          `${API_URL}/api/discourseSSO`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret, sso, sig }),
          },
          HTTP_TIMEOUT_MS,
        );
        const data = await res.json();
        if (data?.redirect) {
          setStatus('done');
          await Linking.openURL(data.redirect);
        } else {
          setStatus('error');
        }
      } catch {
        setStatus('error');
      }
    })();
  }, [isLoading, isAuthenticated, secret, sso, sig]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>
          WorldGuessr <Text style={styles.titleAccent}>Forum</Text>
        </Text>

        {status === 'working' && (
          <>
            <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
            <Text style={styles.message}>{t('forumSigningIn', undefined, 'Signing you in…')}</Text>
          </>
        )}

        {status === 'done' && (
          <Text style={styles.message}>
            {t('forumReturnToBrowser', undefined, 'Done! Continue in your browser.')}
          </Text>
        )}

        {status === 'login' && (
          <>
            <Text style={styles.message}>
              {t(
                'forumLoginFirst',
                undefined,
                'Log in to WorldGuessr first, then tap Log In on the forum again.',
              )}
            </Text>
            <Pressable style={styles.button} onPress={() => router.replace('/')}>
              <Text style={styles.buttonText}>{t('forumOpenApp', undefined, 'Open WorldGuessr')}</Text>
            </Pressable>
          </>
        )}

        {status === 'error' && (
          <>
            <Text style={[styles.message, styles.errorText]}>
              {t('forumLoginFailed', undefined, 'Forum login failed — try again from the forum.')}
            </Text>
            <Pressable style={styles.button} onPress={() => router.replace('/')}>
              <Text style={styles.buttonText}>{t('backToGame', undefined, 'Back to the game')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.card,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  titleAccent: {
    color: colors.primary,
    fontWeight: '600',
  },
  spinner: {
    marginBottom: spacing.md,
  },
  message: {
    fontSize: fontSizes.md,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorText: {
    color: colors.warning,
  },
  button: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  buttonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: '#fff',
  },
});
