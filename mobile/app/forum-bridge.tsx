import { useEffect } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, t } from '../src/shared';
import { fontSizes, spacing } from '../src/styles/theme';

/**
 * Universal-link forwarder. /forum-bridge?code=... is a WEB flow (it plants a
 * browser session for forum SSO — see pages/forum-bridge.js), but because the
 * app claims worldguessr.com links, tapping a bridge link on a phone with the
 * app installed opens the app instead and would dead-end. Re-opening the same
 * URL from inside the claiming app goes to the browser (universal links never
 * self-trigger), which is exactly where the flow belongs.
 */
export default function ForumBridgeScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    const url = code
      ? `https://www.worldguessr.com/forum-bridge?code=${encodeURIComponent(code)}`
      : 'https://worldguessr.forum';
    Linking.openURL(url).finally(() => router.replace('/'));
  }, [code]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.message}>
          {t('forumOpeningBrowser', undefined, 'Opening in your browser…')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  message: {
    fontSize: fontSizes.md,
    color: colors.text,
  },
});
