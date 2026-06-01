import { useCallback } from 'react';
import {
  ImageBackground,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeIn, ReduceMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  colors,
  t,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '../src/shared';
import { borderRadius, fontSizes, spacing } from '../src/styles/theme';
import { useSettingsStore, type MapType } from '../src/store/settingsStore';
import SegmentedControl from '../src/components/settings/SegmentedControl';

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
  const setUnits = useSettingsStore((s) => s.setUnits);
  const setMapType = useSettingsStore((s) => s.setMapType);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const setEmotesEnabled = useSettingsStore((s) => s.setMultiplayerEmotesEnabled);

  // Recomputed each render so labels follow a live language switch (the screen
  // re-renders because it subscribes to `language`).
  const mapTypes: { value: MapType; label: string; icon: IoniconName }[] = [
    { value: 'm', label: t('normal'), icon: 'map-outline' },
    { value: 's', label: t('satellite'), icon: 'planet-outline' },
    { value: 'p', label: t('terrain'), icon: 'leaf-outline' },
    { value: 'y', label: t('hybrid'), icon: 'layers-outline' },
  ];

  const pickLanguage = useCallback(
    (lang: SupportedLanguage) => {
      if (lang === language) return;
      Haptics.selectionAsync().catch(() => {});
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
            <Ionicons name="chevron-back" size={26} color={colors.white} />
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
          {/* Units */}
          <Section title={t('units')} icon="speedometer-outline" index={0}>
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
          <Section title={t('mapType')} icon="map-outline" index={1}>
            <View style={styles.tileGrid}>
              {mapTypes.map((m) => {
                const active = m.value === mapType;
                return (
                  <Pressable
                    key={m.value}
                    onPress={() => {
                      if (!active) {
                        Haptics.selectionAsync().catch(() => {});
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
          <Section title={t('language')} icon="language-outline" index={2}>
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
          <Section title={t('multiplayer', undefined, 'Multiplayer')} icon="happy-outline" index={3}>
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
                  Haptics.selectionAsync().catch(() => {});
                  setEmotesEnabled(v);
                }}
                trackColor={{ false: 'rgba(255,255,255,0.18)', true: colors.primary }}
                thumbColor={colors.white}
                ios_backgroundColor="rgba(255,255,255,0.18)"
              />
            </View>
          </Section>

          {/* About */}
          <Section title={t('about', undefined, 'About')} icon="shield-checkmark-outline" index={4}>
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
