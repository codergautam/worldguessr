import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, getLeague } from '../../src/shared';
import { useAuthStore } from '../../src/store/authStore';
import { commonStyles, spacing, fontSizes, borderRadius } from '../../src/styles/theme';

interface MenuItemProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  onPress: () => void;
  color?: string;
}

function MenuItem({ icon, title, subtitle, onPress, color = colors.text }: MenuItemProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuItem,
        pressed && commonStyles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.menuItemIcon}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.menuItemContent}>
        <Text style={[styles.menuItemTitle, { color }]}>{title}</Text>
        {subtitle && <Text style={styles.menuItemSubtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const league = user?.elo ? getLeague(user.elo) : null;

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  if (!user) {
    return (
      <SafeAreaView style={commonStyles.container} edges={['top']}>
        <View style={commonStyles.centered}>
          <Ionicons name="person-circle" size={64} color={colors.textMuted} />
          <Text style={styles.notLoggedIn}>Not logged in</Text>
          <Pressable
            style={styles.loginButton}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginButtonText}>Login</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {user.username?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.username}>{user.username}</Text>
          {league && (
            <View style={[styles.leagueBadge, { backgroundColor: league.color + '22' }]}>
              <Text style={[styles.leagueText, { color: league.color }]}>
                {league.emoji} {league.name} • {user.elo} ELO
              </Text>
            </View>
          )}
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <StatCard label="Total XP" value={(user.totalXp ?? 0).toLocaleString()} />
          <StatCard label="Games" value={user.totalGamesPlayed ?? 0} />
          <StatCard label="ELO" value={user.elo ?? 1000} />
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Social</Text>
          <MenuItem
            icon="people"
            title="Friends"
            onPress={() => router.push('/friends')}
          />
          <MenuItem
            icon="time"
            title="Game History"
            onPress={() => router.push('/history/list')}
          />
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <MenuItem
            icon="language"
            title="Language"
            subtitle="English"
            onPress={() => {
              // TODO: Language selector
            }}
          />
          <MenuItem
            icon="map"
            title="Map Type"
            subtitle="Normal"
            onPress={() => {
              // TODO: Map type selector
            }}
          />
          <MenuItem
            icon="speedometer"
            title="Units"
            subtitle="Metric"
            onPress={() => {
              // TODO: Units selector
            }}
          />
        </View>

        <View style={styles.menuSection}>
          <MenuItem
            icon="flag"
            title="Country"
            subtitle={user.countryCode || 'Not set'}
            onPress={() => {
              // TODO: Country selector
            }}
          />
        </View>

        <View style={styles.menuSection}>
          <MenuItem
            icon="log-out"
            title="Logout"
            onPress={handleLogout}
            color={colors.error}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: fontSizes['3xl'],
    fontWeight: 'bold',
    color: colors.white,
  },
  username: {
    fontSize: fontSizes['2xl'],
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  leagueBadge: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  leagueText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  statValue: {
    fontSize: fontSizes.xl,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  menuSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: fontSizes.md,
    fontWeight: '500',
  },
  menuItemSubtitle: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  notLoggedIn: {
    fontSize: fontSizes.lg,
    color: colors.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing['2xl'],
  },
  loginButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['3xl'],
    borderRadius: borderRadius.md,
  },
  loginButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.white,
  },
});
