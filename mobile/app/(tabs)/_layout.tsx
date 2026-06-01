import { Tabs } from 'expo-router';
import { colors } from '../../src/shared';
import { useSettingsStore } from '../../src/store/settingsStore';

export default function TabLayout() {
  // Most tab screens render text via the non-reactive t() helper and stay mounted,
  // so they won't pick up a language switch on their own. Keying the navigator by
  // language remounts the whole tab tree when it changes — which happens while the
  // user is on the settings screen (a root-stack screen above the tabs), so the
  // remount is invisible and they land back on a freshly-translated home.
  const language = useSettingsStore((s) => s.language);
  return (
    <Tabs
      key={language}
      detachInactiveScreens={false}
      lazy={false}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
        // 'shift' translates scenes horizontally instead of cross-fading,
        // which avoids the opacity-dip flicker a fade has over a black bg.
        animation: 'shift',
        transitionSpec: {
          animation: 'timing',
          config: { duration: 200 },
        },
        freezeOnBlur: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="maps" />
      <Tabs.Screen name="leaderboard" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
