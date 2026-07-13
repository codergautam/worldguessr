import { useCallback, useEffect } from 'react';
import {
  ImageBackground,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Pressable } from '../src/components/ui/SfxPressable';
import Animated, { FadeInDown, FadeIn, ReduceMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { haptics } from '../src/services/haptics';
import {
  colors,
  t,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '../src/shared';
import { borderRadius, fontSizes, spacing } from '../src/styles/theme';
import { useSettingsStore, type MapType } from '../src/store/settingsStore';
import { useAuthStore } from '../src/store/authStore';
import { useMultiplayerStore } from '../src/store/multiplayerStore';
import SegmentedControl from '../src/components/settings/SegmentedControl';
import DangerZoneSection from '../src/components/settings/DangerZoneSection';
import VolumeSliders from '../src/components/VolumeSliders';

const PRIVACY_URL = 'https://worldguessr.com/privacy.html';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** A glassmorphic settings card with a header icon + title, staggered entrance. */
function Section({
  title,
  icon,
  index,
  children,
}: {
  title: string;
  icon: IoniconName;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(420)
        .delay(90 + index * 70)
        .reduceMotion(ReduceMotion.Never)}
      style={styles.section}
    >
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={18} color={colors.textSecondary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </Animated.View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const units = useSettingsStore((s) => s.units);
  const mapType = useSettingsStore((s) => s.mapType);
  const language = useSettingsStore((s) => s.language);
  const emotesEnabled = useSettingsStore((s) => s.multiplayerEmotesEnabled);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setUnits = useSettingsStore((s) => s.setUnits);
  const setMapType = useSettingsStore((s) => s.setMapType);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const setEmotesEnabled = useSettingsStore((s) => s.setMultiplayerEmotesEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);

  // Recomputed each render so labels follow a live language switch (the screen
  // re-renders because it subscribes to `language`).
  const mapTypes: { value: MapType; label: string; icon: IoniconName }[] = [
    { value: 'm', label: t('normal'), icon: 'map-outline' },
    { value: 's', label: t('satellite'), icon: 'planet-outline' },
    { value: 'p', label: t('terrain'), icon: 'leaf-outline' },
    { value: 'y', label: t('hybrid'), icon: 'layers-outline' },
  ];

  // ── Account settings ────────────────────────────────────────────────────
  // Server-backed per-account preferences — NEVER stored locally. Shown only
  // when logged in (mirrors web settingsModal). Both values live in the
  // multiplayer store, synced from the ws 'friends' message: the server echoes
  // authoritative state after every write attempt (accepted or rejected), so
  // an optimistic flip the server refused snaps back automatically.
  const user = useAuthStore((s) => s.user);
  const verified = useMultiplayerStore((s) => s.verified);
  const allowFriendReq = useMultiplayerStore((s) => s.allowFriendReq);
  const hideLastSeen = useMultiplayerStore((s) => s.hideLastSeen);
  const requestFriends = useMultiplayerStore((s) => s.requestFriends);
  const setAllowFriendReqOnServer = useMultiplayerStore((s) => s.setAllowFriendReqOnServer);
  const setHideLastSeenOnServer = useMultiplayerStore((s) => s.setHideLastSeenOnServer);

  // Hydrate both toggles. Keyed on `verified` (not just mount): a send before
  // the socket is verified is silently dropped, and `verified` flips false on
  // disconnect and back true after every (re)connect — so this re-fires and
  // self-heals exactly when a retry can actually succeed, instead of polling.
  useEffect(() => {
    if (!user?.accountId || !verified) return;
    requestFriends(); // hydrates both toggles in the store
  }, [user?.accountId, verified, requestFriends]);

  // Both values ride the same 'friends' message, so hideLastSeen === null is
  // the shared "no server data yet" sentinel (web parity: settingsModal.js
  // disables both checkboxes until accountSettings arrives). Also locked while
  // the socket is down/unverified — a write couldn't reach the server, and the
  // authoritative echo that confirms it could never arrive.
  const accountSettingsLocked = !verified || hideLastSeen === null;

  const pickLanguage = useCallback(
    (lang: SupportedLanguage) => {
      if (lang === language) return;
      haptics.selection();
      setLanguage(lang);
    },
    [language, setLanguage],
  );

  const openPrivacy = useCallback(() => {
    Linking.openURL(PRIVACY_URL).catch(() => {});
  }, []);

  return (
    <View style={styles.root}>
      <ImageBackground
        source={require('../assets/street2.jpg')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0, 30, 15, 0.62)', 'rgba(6, 18, 11, 0.86)', 'rgba(0, 0, 0, 0.92)']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>

      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {/* Header */}
        <Animated.View
          entering={FadeIn.duration(320).reduceMotion(ReduceMotion.Never)}
          style={styles.header}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          >
            <Ionicons name="close" size={26} color={colors.white} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('settings')}</Text>
          <View style={styles.backBtn} />
        </Animated.View>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing['3xl'] },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Audio — two sliders shared with the party-lobby sound modal
              (one VolumeSliders component, two surfaces — web parity). First
              section on the page per user demand. */}
          <Section title={t('audioSettings')} icon="volume-high-outline" index={0}>
            <VolumeSliders />
          </Section>

          {/* Units */}
          <Section title={t('units')} icon="speedometer-outline" index={1}>
            <SegmentedControl
              value={units}
              onChange={setUnits}
              options={[
                { value: 'metric', label: t('metric') },
                { value: 'imperial', label: t('imperial') },
              ]}
            />
          </Section>

          {/* Map type */}
          <Section title={t('mapType')} icon="map-outline" index={2}>
            <View style={styles.tileGrid}>
              {mapTypes.map((m) => {
                const active = m.value === mapType;
                return (
                  <Pressable
                    key={m.value}
                    onPress={() => {
                      if (!active) {
                        haptics.selection();
                        setMapType(m.value);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.tile,
                      active && styles.tileActive,
                      pressed && styles.tilePressed,
                    ]}
                  >
                    <Ionicons
                      name={m.icon}
                      size={22}
                      color={active ? colors.white : colors.textSecondary}
                    />
                    <Text style={[styles.tileLabel, active && styles.tileLabelActive]}>
                      {m.label}
                    </Text>
                    {active && (
                      <View style={styles.tileCheck}>
                        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Section>

          {/* Language */}
          <Section title={t('language')} icon="language-outline" index={3}>
            <View style={styles.list}>
              {SUPPORTED_LANGUAGES.map((lang, i) => {
                const active = lang === language;
                return (
                  <Pressable
                    key={lang}
                    onPress={() => pickLanguage(lang)}
                    style={({ pressed }) => [
                      styles.row,
                      i > 0 && styles.rowDivider,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>
                      {LANGUAGE_NAMES[lang]}
                    </Text>
                    {active ? (
                      <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                    ) : (
                      <View style={styles.radioEmpty} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Section>

          {/* Multiplayer */}
          <Section title={t('multiplayer', undefined, 'Multiplayer')} icon="happy-outline" index={4}>
            <View style={styles.row}>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowLabel}>
                  {t('emoteReactions', undefined, 'Emote reactions')}
                </Text>
                <Text style={styles.rowSub}>
                  {t(
                    'emoteReactionsDesc',
                    undefined,
                    'Show emoji reactions from other players during multiplayer games.',
                  )}
                </Text>
              </View>
              <Switch
                value={emotesEnabled}
                onValueChange={(v) => {
                  haptics.selection();
                  setEmotesEnabled(v);
                }}
                trackColor={{ false: 'rgba(255,255,255,0.18)', true: colors.primary }}
                thumbColor={colors.white}
                ios_backgroundColor="rgba(255,255,255,0.18)"
              />
            </View>
          </Section>

          {/* Haptics */}
          <Section title={t('haptics', undefined, 'Haptics')} icon="phone-portrait-outline" index={5}>
            <View style={styles.row}>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowLabel}>
                  {t('hapticFeedback', undefined, 'Haptic feedback')}
                </Text>
                <Text style={styles.rowSub}>
                  {t(
                    'hapticFeedbackDesc',
                    undefined,
                    'Vibrate on guesses, results, and other interactions.',
                  )}
                </Text>
              </View>
              <Switch
                value={hapticsEnabled}
                onValueChange={(v) => {
                  // Set first, then tick: turning ON confirms with a buzz, turning
                  // OFF is silent (the helper is already gated).
                  setHapticsEnabled(v);
                  haptics.selection();
                }}
                trackColor={{ false: 'rgba(255,255,255,0.18)', true: colors.primary }}
                thumbColor={colors.white}
                ios_backgroundColor="rgba(255,255,255,0.18)"
              />
            </View>
          </Section>

          {/* Account — server-backed, logged-in only */}
          {user?.accountId && (
            <Section title={t('accountSettings')} icon="person-circle-outline" index={6}>
              <View style={[styles.row, accountSettingsLocked && styles.rowLocked]}>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowLabel}>{t('allowFriendRequests')}</Text>
                </View>
                <Switch
                  value={allowFriendReq}
                  disabled={accountSettingsLocked}
                  onValueChange={(v) => {
                    haptics.selection();
                    setAllowFriendReqOnServer(v);
                  }}
                  trackColor={{ false: 'rgba(255,255,255,0.18)', true: colors.primary }}
                  thumbColor={colors.white}
                  ios_backgroundColor="rgba(255,255,255,0.18)"
                />
              </View>
              <View style={[styles.row, styles.rowDivider, accountSettingsLocked && styles.rowLocked]}>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowLabel}>{t('hideMyLastSeen')}</Text>
                </View>
                <Switch
                  value={!!hideLastSeen}
                  disabled={accountSettingsLocked}
                  onValueChange={(v) => {
                    haptics.selection();
                    setHideLastSeenOnServer(v); // optimistic in the store; echo reconciles
                  }}
                  trackColor={{ false: 'rgba(255,255,255,0.18)', true: colors.primary }}
                  thumbColor={colors.white}
                  ios_backgroundColor="rgba(255,255,255,0.18)"
                />
              </View>
            </Section>
          )}

          {/* Danger Zone — account deletion (moved here from the account
              moderation tab; web parity: sits right under Account settings) */}
          {user?.accountId && (
            <Section title={t('dangerZone', undefined, 'Danger Zone')} icon="warning-outline" index={7}>
              <DangerZoneSection />
            </Section>
          )}

          {/* About */}
          <Section title={t('about', undefined, 'About')} icon="shield-checkmark-outline" index={8}>
            <Pressable
              onPress={openPrivacy}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowLabel}>
                {t('termsAndPrivacy', undefined, 'Terms & Privacy')}
              </Text>
              <Ionicons name="open-outline" size={20} color={colors.textMuted} />
            </Pressable>
          </Section>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  headerTitle: {
    fontFamily: 'JockeyOne',
    fontSize: fontSizes['3xl'],
    color: colors.white,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  section: {
    backgroundColor: 'rgba(36, 87, 52, 0.42)',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: fontSizes.md,
    color: colors.white,
    letterSpacing: 0.3,
  },
  // Map type tiles
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  tileActive: {
    backgroundColor: colors.primaryTransparent,
    borderColor: colors.success,
  },
  tilePressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  tileLabel: {
    fontFamily: 'Lexend-Medium',
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  tileLabelActive: {
    color: colors.white,
  },
  tileCheck: {
    marginLeft: 'auto',
  },
  // Lists / rows
  list: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md - 2,
    gap: spacing.md,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  rowPressed: {
    opacity: 0.7,
  },
  // Account rows grey out while the socket is unverified / toggles unhydrated
  // (writes couldn't reach the server, so changes are blocked at the Switch).
  rowLocked: {
    opacity: 0.45,
  },
  rowTextWrap: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  rowLabel: {
    fontFamily: 'Lexend-Medium',
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  rowLabelActive: {
    color: colors.white,
    fontFamily: 'Lexend-SemiBold',
  },
  rowSub: {
    fontFamily: 'Lexend',
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: fontSizes.xs * 1.4,
  },
  radioEmpty: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
});
