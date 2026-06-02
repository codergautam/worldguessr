import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, t } from '../../shared';
import { borderRadius, fontSizes, spacing } from '../../styles/theme';
import { useAuthStore } from '../../store/authStore';
import AccountSelectSheet from '../auth/AccountSelectSheet';

interface TopRightActionsProps {
  children?: ReactNode;
  onBeforeNavigate?: () => void;
}

export default function TopRightActions({ children, onBeforeNavigate }: TopRightActionsProps) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const username = useAuthStore((s) => s.user?.username);
  const [accountSheetVisible, setAccountSheetVisible] = useState(false);

  const beforeNavigate = () => {
    onBeforeNavigate?.();
  };

  return (
    <View style={styles.stack}>
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => {
            beforeNavigate();
            router.push('/party/join');
          }}
          style={({ pressed }) => [styles.toolbarBtn, styles.toolbarBtnBlue, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="enter-outline" size={18} color={colors.white} />
          <Text style={styles.toolbarBtnText}>{t('joinGame')}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (isAuthenticated) {
              beforeNavigate();
              router.push('/(tabs)/account');
            } else {
              setAccountSheetVisible(true);
            }
          }}
          style={({ pressed }) => [styles.toolbarBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons
            name={isAuthenticated ? 'person-circle' : 'person-circle-outline'}
            size={18}
            color={colors.white}
          />
          <Text style={styles.toolbarBtnText} numberOfLines={1}>
            {isAuthenticated ? username || t('account') : t('login')}
          </Text>
        </Pressable>
      </View>
      {children}
      <AccountSelectSheet visible={accountSheetVisible} onClose={() => setAccountSheetVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    alignItems: 'flex-end',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(36, 87, 52, 0.9)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    maxWidth: 160,
  },
  toolbarBtnBlue: {
    backgroundColor: 'rgba(37, 99, 235, 0.92)',
    borderColor: 'rgba(147, 197, 253, 0.55)',
  },
  toolbarBtnText: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.sm,
  },
});
