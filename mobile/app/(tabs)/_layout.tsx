import { Tabs } from 'expo-router';
import { colors } from '../../src/shared';

export default function TabLayout() {
  return (
    <Tabs
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
