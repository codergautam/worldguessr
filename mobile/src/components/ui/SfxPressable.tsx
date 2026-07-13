/**
 * Pressable/TouchableOpacity with the web app's delegated button click sound
 * baked in. On web, ONE capture-phase document listener plays `click_2` for
 * every `button`/`[role="button"]` click (`ui_click` inside the `.g2_nav_ui`
 * home-menu scope), with a `data-no-click-sfx` attribute opt-out
 * (components/utils/audio.js attachUiClickSounds). React Native has no
 * document-level delegation, so the primitive IS the delegation point: swap
 * these in for react-native's Pressable/TouchableOpacity and every button
 * sounds by default.
 *
 *   sfx="click" (default) — click_2, the app-wide button sound
 *   sfx="ui"              — ui_click, the home main-menu scope (web .g2_nav_ui)
 *   sfx="none"            — web data-no-click-sfx: backdrops/scrims (web's
 *                           were divs, hence silent) and buttons whose press
 *                           already triggers its own more specific sound
 *                           (country-guess buttons → the reveal whoosh IS the
 *                           press sound; the singleplayer Guess button ditto).
 *
 * The sound rides the onPress wrapper, so a Pressable without onPress (pure
 * touch-swallower) stays silent automatically, and RN never invokes onPress
 * while `disabled` — matching the web's disabled-button check for free.
 */
import { forwardRef } from 'react';
import {
  Pressable as RNPressable,
  TouchableOpacity as RNTouchableOpacity,
  type GestureResponderEvent,
  type PressableProps,
  type TouchableOpacityProps,
  type View,
} from 'react-native';
import { sound } from '../../services/sound';

export type SfxMode = 'click' | 'ui' | 'none';

function wrapPress(
  sfx: SfxMode,
  onPress?: ((e: GestureResponderEvent) => void) | null,
): ((e: GestureResponderEvent) => void) | undefined {
  if (!onPress) return onPress ?? undefined;
  return (e) => {
    if (sfx === 'ui') sound.uiClick();
    else if (sfx === 'click') sound.click();
    onPress(e);
  };
}

export const Pressable = forwardRef<View, PressableProps & { sfx?: SfxMode }>(
  function SfxPressable({ sfx = 'click', onPress, ...rest }, ref) {
    return <RNPressable ref={ref} {...rest} onPress={wrapPress(sfx, onPress)} />;
  },
);

export const TouchableOpacity = forwardRef<View, TouchableOpacityProps & { sfx?: SfxMode }>(
  function SfxTouchableOpacity({ sfx = 'click', onPress, ...rest }, ref) {
    return <RNTouchableOpacity ref={ref} {...rest} onPress={wrapPress(sfx, onPress)} />;
  },
);
