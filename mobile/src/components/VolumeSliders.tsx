/**
 * The two audio slider rows (SFX + Music) — mobile mirror of web
 * components/ui/volumeSliders.js. ONE component, two surfaces (the Settings
 * screen's Audio section and the party-lobby sound modal), exactly like web —
 * standing rule: reuse the shell, never duplicate it.
 *
 * Live-preview semantics (web parity):
 *  • SFX slider plays click_2 on RELEASE as the level preview;
 *  • music previews itself (keeps playing through the drag; the settings
 *    subscriber in sound.ts retargets the live fade / stops at 0 / restarts
 *    on unmute).
 * Values live in slider space 0–1 (settingsStore persists them); the
 * perceptual v² mapping applies only inside the sound service.
 */

import { StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, t } from '../shared';
import { fontSizes, spacing } from '../styles/theme';
import { useSettingsStore } from '../store/settingsStore';
import { playSfx } from '../services/sound';

function SliderRow({
  icon,
  label,
  value,
  onValueChange,
  onRelease,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  onRelease?: (v: number) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Ionicons name={icon} size={18} color="rgba(255,255,255,0.8)" />
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{Math.round(value * 100)}%</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        value={value}
        onValueChange={onValueChange}
        onSlidingComplete={onRelease}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor="rgba(255,255,255,0.2)"
        thumbTintColor="#fff"
      />
    </View>
  );
}

export default function VolumeSliders() {
  const sfxVolume = useSettingsStore((s) => s.sfxVolume);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  const setSfxVolume = useSettingsStore((s) => s.setSfxVolume);
  const setMusicVolume = useSettingsStore((s) => s.setMusicVolume);

  return (
    <View style={styles.container}>
      <SliderRow
        icon="volume-medium-outline"
        label={t('sfxVolume')}
        value={sfxVolume}
        onValueChange={setSfxVolume}
        // Release preview at the freshly-set level (web parity). Zero skips
        // inside playSfx (muted = silent, zero cost).
        onRelease={() => playSfx('click_2')}
      />
      <SliderRow
        icon="musical-notes-outline"
        label={t('musicVolume')}
        value={musicVolume}
        onValueChange={setMusicVolume}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  row: { gap: 2 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontFamily: 'Lexend-Medium',
    flex: 1,
  },
  value: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: fontSizes.xs,
    fontFamily: 'Lexend',
    fontVariant: ['tabular-nums'],
  },
  slider: { width: '100%', height: 36 },
});
